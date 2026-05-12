// ONE-TIME USE: Visit /.netlify/functions/vapid-setup to generate VAPID keys.
// Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Netlify env vars, then DELETE this file.

const { createECDH } = require('crypto');

exports.handler = async function() {
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructions: 'Copy both values into Netlify → Site config → Environment variables. Then delete netlify/functions/vapid-setup.js from your repo.',
        VAPID_PUBLIC_KEY: ecdh.getPublicKey('base64url'),
        VAPID_PRIVATE_KEY: ecdh.getPrivateKey('base64url')
      }, null, 2)
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
