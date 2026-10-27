// GET ?id=&t= — one-click newsletter unsubscribe (CAN-SPAM). Sets newsletter_status='unsubscribed'.
const nl = require('./lib/newsletter');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const page = (code, msg) => ({ statusCode: code, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Solar Review</title><body style="font-family:system-ui;max-width:440px;margin:15vh auto;padding:0 20px;text-align:center"><h2>' + msg + '</h2><p><a href="https://fixmy.energy">fixmy.energy</a></p></body>' });
exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const q = event.queryStringParameters || {};
  const id = String(q.id || '');
  if (!/^[0-9a-fA-F-]{36}$/.test(id) || !nl.valid(id, q.t)) return page(400, 'This link is not valid.');
  const KEY = process.env.SUPA_SERVICE_KEY; if (!KEY) return page(500, 'Something went wrong. Please reply STOP to any message from us.');
  const r = await doFetch(SUPA + '/customers?id=eq.' + id, { method: 'PATCH', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ newsletter_status: 'unsubscribed' }) });
  if (!r.ok) return page(500, 'Something went wrong. Please reply STOP to any message from us.');
  return page(200, 'You are unsubscribed. We will not email you our newsletter again.');
};
