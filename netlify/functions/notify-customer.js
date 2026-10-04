// Sends the customer their proposal / documents link by SMS + email, straight from our own code.
// Replaces the GHL "Customer Agreement Notifications" workflow for customer-facing messages
// (2026-10-04). Safety, since this is a public endpoint:
//   - the caller can only name WHICH message (type) and WHICH customer — recipient, link and
//     wording are all built here from the customer's own record, never from the request;
//   - each type requires the real state to exist (a sent proposal / a document the rep reviewed /
//     everything signed), so it can't be used to text arbitrary people arbitrary things;
//   - one send per type per customer per 2 minutes.
// ENV: SUPA_SERVICE_KEY, GHL_API_KEY, RESEND_API_KEY.
const notify = require('./lib/notify');

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });
const TYPES = ['proposal_sent', 'document_ready', 'all_documents_signed'];
const RATE_MS = 120000;

exports.handler = async function (event, context, deps) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method Not Allowed' });
  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return out(500, { error: 'Server misconfigured' });
  const doFetch = (deps && deps.fetch) || fetch;
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  let body;
  try { body = JSON.parse(event.body); } catch (e) { return out(400, { error: 'Invalid JSON' }); }
  const type = body.type, id = body.customerId;
  if (TYPES.indexOf(type) === -1) return out(400, { error: 'Unknown type' });
  if (!/^[0-9a-fA-F-]{36}$/.test(String(id || ''))) return out(400, { error: 'Bad customerId' });

  const cr = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id + '&select=id,first_name,last_name,email,phone,access_code,proposal&limit=1', { headers: H });
  const rows = await cr.json().catch(function () { return null; });
  const c = Array.isArray(rows) && rows[0];
  if (!c) return out(404, { error: 'Customer not found' });

  // State gate
  const dr = await doFetch(SUPA_URL + '/rest/v1/deal_documents?customer_id=eq.' + id + '&select=id,status,data', { headers: H });
  const docs = (await dr.json().catch(function () { return []; })) || [];
  const reviewed = docs.filter(function (d) { return d.status === 'reviewed'; }).length;
  const signed = docs.filter(function (d) { return d.status === 'signed'; }).length;
  if (type === 'proposal_sent' && !(c.proposal && c.proposal.status === 'sent')) return out(409, { ok: false, reason: 'no_sent_proposal' });
  if (type === 'document_ready' && !reviewed) return out(409, { ok: false, reason: 'nothing_to_sign' });
  if (type === 'all_documents_signed' && (reviewed || !signed)) return out(409, { ok: false, reason: 'not_all_signed' });
  if (!notify.toE164(c.phone) && !notify.validEmail(c.email)) return out(200, { ok: false, reason: 'no_contact', sms: { ok: false, reason: 'no_phone' }, email: { ok: false, reason: 'no_email' } });

  // Rate limit (one send per type per customer per 2 min)
  const rlKey = 'notify_' + type + '_' + id;
  try {
    const rr = await doFetch(SUPA_URL + '/rest/v1/pipeline_state?key=eq.' + encodeURIComponent(rlKey) + '&select=value', { headers: H });
    const rv = await rr.json();
    if (Array.isArray(rv) && rv[0]) {
      const v = typeof rv[0].value === 'string' ? JSON.parse(rv[0].value) : rv[0].value;
      if (v && Date.now() - (v.ts || 0) < RATE_MS) return out(429, { ok: false, reason: 'rate_limited' });
    }
  } catch (e) { /* never block a real send on the limiter */ }

  // The portal rejects codes shorter than 10 chars. A customer with neither an access_code nor a
  // 10-digit phone would get a dead link, so mint one (never overwrites an existing code).
  if (!((c.access_code || '').length >= 10 || notify.digits(c.phone).length >= 10)) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = require('crypto').randomBytes(10);
    let code = ''; for (let i = 0; i < 10; i++) code += chars[bytes[i] % chars.length];
    try {
      const pr = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ access_code: code }) });
      if (pr.ok !== false) c.access_code = code;
    } catch (e) { /* link falls back to what exists */ }
  }
  const link = notify.magicLink(c);
  const first = (c.first_name || 'there').trim();
  let sms, mail;
  if (type === 'proposal_sent') {
    sms = 'Hi ' + first + '! Your Solar Review proposal is ready. Open it here: ' + link + '\nQuestions? Call (619) 777-6527.';
    mail = { subject: 'Your Solar Review proposal is ready', heading: 'Your proposal is ready, ' + first, lines: ['We put together a plan for your home. Open your portal to review your options and get started.'], cta: { url: link, label: 'View my proposal' } };
  } else if (type === 'document_ready') {
    sms = 'Hi ' + first + '! Your Solar Review documents are ready to sign: ' + link + '\nOpen the link and tap Sign. Questions? Call (619) 777-6527.';
    mail = { subject: 'Your Solar Review documents are ready to sign', heading: 'Your documents are ready to sign', lines: ['Hi ' + first + ', your paperwork is ready. Open your portal and tap <b>Sign</b> — it takes about two minutes.', 'For your protection we will send a one-time code to this phone/email before you sign. Only enter it yourself.'], cta: { url: link, label: 'Review &amp; sign' } };
  } else {
    sms = 'Hi ' + first + '! Everything is signed — thank you. Your signed documents are in your portal: ' + link;
    mail = { subject: 'Your documents are signed — thank you', heading: 'All signed — thank you, ' + first, lines: ['Your signed documents are saved in your portal anytime.'], cta: { url: link, label: 'Open my portal' } };
  }

  const result = await notify.sendBoth(c, sms, mail, doFetch);
  if (result.ok) {
    try {
      await doFetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ key: rlKey, value: JSON.stringify({ ts: Date.now() }), updated_at: new Date().toISOString() }) });
    } catch (e) { /* ignore */ }
  }
  // First-send contact snapshot on each reviewed document (never overwritten): doc-sign flags any
  // signing where the phone/email on file changed after the customer was first sent the documents.
  if (result.ok && type === 'document_ready') {
    for (const d of docs.filter(function (x) { return x.status === 'reviewed' && !(x.data && x.data.contact_snapshot); })) {
      try {
        await doFetch(SUPA_URL + '/rest/v1/deal_documents?id=eq.' + d.id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }),
          body: JSON.stringify({ data: Object.assign({}, d.data || {}, { contact_snapshot: { phone: notify.digits(c.phone), email: String(c.email || '').toLowerCase(), at: new Date().toISOString() } }) }) });
      } catch (e) { /* best effort */ }
    }
  }
  console.log('notify-customer', type, id, 'sms', result.sms.ok ? 'ok' : result.sms.reason, 'email', result.email.ok ? 'ok' : result.email.reason);
  return out(200, result);
};
