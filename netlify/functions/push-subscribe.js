// Manages push subscriptions.
// GET  → returns VAPID public key
// POST → saves a new subscription
// DELETE → removes a subscription

const SUPA_URL  = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const key = process.env.SUPA_SERVICE_KEY;
  if (!key) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Server config error' }) };

  if (event.httpMethod === 'GET') {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ publicKey: process.env.VAPID_PUBLIC_KEY || '' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    if (event.httpMethod === 'POST') {
      const sub = body.subscription;
      if (!sub || !sub.endpoint || !sub.keys) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid subscription object' }) };
      }
      const resp = await fetch(SUPA_REST + '/push_subscriptions', {
        method: 'POST',
        headers: {
          apikey: key, Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
      });
      if (!resp.ok) throw new Error(await resp.text());
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === 'DELETE') {
      if (!body.endpoint) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing endpoint' }) };
      const resp = await fetch(SUPA_REST + '/push_subscriptions?endpoint=eq.' + encodeURIComponent(body.endpoint), {
        method: 'DELETE',
        headers: { apikey: key, Authorization: 'Bearer ' + key }
      });
      if (!resp.ok) throw new Error(await resp.text());
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
