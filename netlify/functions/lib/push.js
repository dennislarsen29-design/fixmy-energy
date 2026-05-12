// Web Push notification sender — uses only Node.js built-in crypto, no npm required.
// Implements RFC 8291 (message encryption) and RFC 8292 (VAPID authentication).

const crypto = require('crypto');
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

// HKDF-SHA256 — derives keyLen bytes from ikm, salt, info
function hkdf(salt, ikm, info, keyLen) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const infoBuffer = Buffer.concat([Buffer.from(info), Buffer.from([0x01])]);
  const t = crypto.createHmac('sha256', prk).update(infoBuffer).digest();
  return t.slice(0, keyLen);
}

// Encrypt a push message payload (RFC 8291, aes128gcm content encoding)
function encryptPayload(plaintext, recipientPublicKeyBase64url, authBase64url) {
  const recipientPublicKey = Buffer.from(recipientPublicKeyBase64url, 'base64url');
  const auth = Buffer.from(authBase64url, 'base64url');

  const senderECDH = crypto.createECDH('prime256v1');
  senderECDH.generateKeys();
  const senderPublicKey = senderECDH.getPublicKey();               // 65-byte uncompressed
  const sharedSecret   = senderECDH.computeSecret(recipientPublicKey);

  const salt = crypto.randomBytes(16);

  // PRK for key material derivation
  const keyInfo   = Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([0x00])]);
  const nonceInfo = Buffer.concat([Buffer.from('Content-Encoding: nonce\0'),     Buffer.from([0x00])]);

  // ikm via HKDF-SHA256 using auth as salt
  const prkKey = crypto.createHmac('sha256', auth)
    .update(Buffer.concat([sharedSecret, senderPublicKey, recipientPublicKey]))
    .digest();

  const contentEncKey = hkdf(salt, prkKey, 'Content-Encoding: aes128gcm\0\0', 16);
  const nonce         = hkdf(salt, prkKey, 'Content-Encoding: nonce\0\0',      12);

  // Pad to at least 1 byte padding + delimiter
  const body = Buffer.concat([Buffer.from(plaintext), Buffer.from([0x02])]);

  const cipher = crypto.createCipheriv('aes-128-gcm', contentEncKey, nonce);
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const tag = cipher.getAuthTag();

  // aes128gcm record format: salt(16) + rs(4) + keyid_len(1) + sender_public(65) + ciphertext + tag(16)
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, rs, Buffer.from([65]), senderPublicKey]);
  return Buffer.concat([header, encrypted, tag]);
}

// Build a VAPID Authorization header (ES256 JWT)
function buildVapidAuth(audience, vapidPublicKeyBase64url, vapidPrivateKeyBase64url) {
  const header  = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: 'mailto:admin@fixmy.energy'
  })).toString('base64url');

  const sigInput  = Buffer.from(header + '.' + payload);
  const privKeyDer = Buffer.from(vapidPrivateKeyBase64url, 'base64url');

  // Reconstruct EC private key in DER PKCS#8 format for Node crypto
  const ecPrivKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420', 'hex'),
      privKeyDer
    ]),
    format: 'der',
    type: 'pkcs8'
  });

  const sig = crypto.sign(null, sigInput, { key: ecPrivKey, dsaEncoding: 'ieee-p1363' });

  return {
    jwt:    header + '.' + payload + '.' + sig.toString('base64url'),
    pubKey: vapidPublicKeyBase64url
  };
}

async function sendAgentNotification(agentName, itemCount) {
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const supaKey      = process.env.SUPA_SERVICE_KEY;
  if (!vapidPublic || !vapidPrivate || !supaKey) return;

  const resp = await fetch(SUPA_URL + '/rest/v1/push_subscriptions?select=endpoint,p256dh,auth', {
    headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey }
  });
  if (!resp.ok) return;
  const subs = await resp.json();
  if (!subs.length) return;

  const label  = agentName.replace('-', ' ');
  const plural = itemCount !== 1 ? 's' : '';
  const payload = JSON.stringify({
    title: 'FixMy.Energy — ' + label + ' agent',
    body:  itemCount + ' new action item' + plural + ' in your Agent Inbox.',
    url:   '/portal.html'
  });

  await Promise.allSettled(subs.map(async function(s) {
    try {
      const audience  = new URL(s.endpoint).origin;
      const { jwt, pubKey } = buildVapidAuth(audience, vapidPublic, vapidPrivate);
      const encrypted = encryptPayload(payload, s.p256dh, s.auth);

      const pushResp = await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          Authorization:    'vapid t=' + jwt + ',k=' + pubKey,
          'Content-Type':   'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          TTL: '86400'
        },
        body: encrypted
      });

      if (!pushResp.ok && pushResp.status !== 201) {
        if (pushResp.status === 410 || pushResp.status === 404) {
          // Subscription expired — clean it up
          fetch(SUPA_URL + '/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(s.endpoint), {
            method: 'DELETE',
            headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey }
          }).catch(function(){});
        }
      }
    } catch(err) {
      console.error('[push] Error sending to subscriber:', err.message);
    }
  }));
}

module.exports = { sendAgentNotification };
