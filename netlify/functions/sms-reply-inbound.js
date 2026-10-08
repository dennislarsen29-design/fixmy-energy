// POST /.netlify/functions/sms-reply-inbound?k=<secret>
// Target for a GHL workflow ("Customer Replied" trigger -> Webhook action). Logs the homeowner's text
// reply as a note on their lead, and texts the owner (tech4) so he knows to go look.
// Same shared secret as Lead Locker: app_config.leadlocker_webhook_key.
const crypto = require('crypto');
const notify = require('./lib/notify');

const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const out = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function parseNotes(n) { try { const a = JSON.parse(n || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return n ? [{ by: 'Legacy', ts: null, text: String(n) }] : []; } }
const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*[.!]*\s*$/i;

exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const SK = process.env.SUPA_SERVICE_KEY;
  const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  if (!SK) return out(500, { error: 'not configured' });

  const given = (event.queryStringParameters && event.queryStringParameters.k) || (event.headers && (event.headers['x-webhook-key'] || event.headers['X-Webhook-Key'])) || '';
  let want = '';
  try { const r = await doFetch(SUPA_URL + '/rest/v1/app_config?key=eq.leadlocker_webhook_key&select=value', { headers: H }); const j = await r.json(); want = j && j[0] && j[0].value; } catch (e) {}
  if (!want || !safeEqual(given, want)) return out(401, { error: 'unauthorized' });

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  const cd = p.customData || {};
  const rawPhone = p.phone || p.contact_phone || (p.contact && p.contact.phone) || cd.phone || '';
  const d10 = String(rawPhone).replace(/\D/g, '').slice(-10);
  const msgRaw = p.message || p.body || p.text || (p.message_body) || cd.message || (p.messageBody) || '';
  const message = (typeof msgRaw === 'object' ? (msgRaw.body || '') : String(msgRaw)).trim();
  if (d10.length !== 10) return out(400, { error: 'no usable phone' });
  if (!message) return out(200, { ok: true, skipped: 'empty message' });

  let c = null;
  try {
    const pat = 'phone.ilike.*' + d10.slice(0, 3) + '*' + d10.slice(3, 6) + '*' + d10.slice(6) + '*';
    const r = await doFetch(SUPA_URL + '/rest/v1/customers?select=id,first_name,last_name,phone,notes&or=(' + pat + ')&order=created_at.desc&limit=1', { headers: H });
    const j = await r.json();
    c = Array.isArray(j) && j[0];
  } catch (e) {}
  const name = c ? (((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'lead') : null;
  const isStop = STOP_RE.test(message);

  if (c) {
    const entries = parseNotes(c.notes);
    entries.push({ by: '💬 Text reply — ' + name, ts: new Date().toISOString(), text: message + (isStop ? '  [opt-out — marked Do Not Contact]' : '') });
    const upd = { notes: JSON.stringify(entries) };
    if (isStop) upd.dnc = true;
    try { await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(upd) }); } catch (e) { console.warn('sms-reply note failed', e.message); }
    try { await doFetch(SUPA_URL + '/rest/v1/lead_activity', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ customer_id: c.id, channel: 'sms', outcome: null, note: 'Reply: ' + message, rep_id: 'ghl', rep_name: name }) }); } catch (e) {}
  }

  // tell the owner
  let alerted = false;
  try {
    const r = await doFetch(SUPA_URL + '/rest/v1/team_members?id=eq.tech4&select=name,phone&limit=1', { headers: H });
    const tm = ((await r.json().catch(function () { return []; })) || [])[0];
    if (tm && tm.phone) {
      const res = await notify.sendSms({ phone: tm.phone, first_name: tm.name }, '💬 Reply from ' + (name || ('unknown number ' + d10)) + (c ? '' : ' (no matching lead)') + ':\n\n' + message + (isStop ? '\n\n(Opt-out — marked Do Not Contact.)' : ''), doFetch);
      alerted = !!res.ok;
    }
  } catch (e) {}
  return out(200, { ok: true, matched: !!c, logged: !!c, alerted, opt_out: isStop });
};
