// POST /.netlify/functions/leadlocker-inbound?k=<secret>
// Lead Locker Room "CRM Webhook" target. Creates the customer, texts the homeowner, queues the
// dialer/doors priority. The secret lives in app_config.leadlocker_webhook_key (service-role only).
const crypto = require('crypto');
const LL = require('./lib/leadlocker');

const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const out = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function noteEntry(text) { return { by: 'Lead Locker', ts: new Date().toISOString(), text: text }; }
function parseNotes(n) { try { const a = JSON.parse(n || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return n ? [{ by: 'Legacy', ts: null, text: String(n) }] : []; } }

exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const SK = process.env.SUPA_SERVICE_KEY;
  const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  if (!SK) return out(500, { error: 'not configured' });

  // auth: shared secret in the URL
  const given = (event.queryStringParameters && event.queryStringParameters.k) || (event.headers && (event.headers['x-webhook-key'] || event.headers['X-Webhook-Key'])) || '';
  let want = '';
  try { const r = await doFetch(SUPA_URL + '/rest/v1/app_config?key=eq.leadlocker_webhook_key&select=value', { headers: H }); const j = await r.json(); want = j && j[0] && j[0].value; } catch (e) {}
  if (!want || !safeEqual(given, want)) return out(401, { error: 'unauthorized' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  if (LL.isTestPayload(body)) return out(200, { ok: true, test: true, message: 'Webhook reached Solar Review. No lead was created (sample payload).' });

  const m = LL.mapPayload(body);
  if (!m.phone && !m.email) return out(422, { error: 'lead has no phone or email' });
  if (!m.first_name && !m.last_name) return out(422, { error: 'lead has no name' });

  // dedupe on phone (last 10 digits) or email — never create a second row for the same homeowner
  let existing = null;
  try {
    const ors = [];
    if (m.phone10) ors.push('phone.ilike.*' + m.phone10.slice(0, 3) + '*' + m.phone10.slice(3, 6) + '*' + m.phone10.slice(6) + '*');
    if (m.email) ors.push('email.eq.' + encodeURIComponent(m.email));
    const r = await doFetch(SUPA_URL + '/rest/v1/customers?select=id,notes,lead_source,archived&or=(' + ors.join(',') + ')&order=created_at.desc&limit=1', { headers: H });
    const j = await r.json(); existing = Array.isArray(j) && j[0] ? j[0] : null;
  } catch (e) {}
  if (existing) {
    const notes = parseNotes(existing.notes); notes.push(noteEntry('Lead Locker sent this homeowner again (lead #' + (m.meta.lead_id || '?') + ', $' + (m.meta.amount_paid || 0) + '). Matched the existing record — no duplicate created, no text sent.'));
    await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + existing.id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ notes: JSON.stringify(notes) }) });
    return out(200, { ok: true, duplicate: true, id: existing.id });
  }

  const geo = m.address ? await LL.geocode(m.address, doFetch) : null;
  const now = new Date();
  const sendNow = LL.inSmsWindow(now) && !!m.phone;
  const note = noteEntry('Lead Locker lead #' + (m.meta.lead_id || '?') + (m.meta.amount_paid != null ? ' ($' + m.meta.amount_paid + ')' : '') +
    (m.meta.utility_provider ? ' · utility: ' + m.meta.utility_provider : '') + (m.meta.trusted_form_url ? ' · TrustedForm: ' + m.meta.trusted_form_url : '') + (m.meta.consent ? ' · consent: ' + m.meta.consent : ''));
  const row = {
    first_name: m.first_name, last_name: m.last_name, email: m.email, phone: m.phone, address: m.address,
    lead_category: 'new_solar', lead_source: 'lead_locker', black_box: true, lead_score: 100, step: 1, rep_id: 'tech4',
    notes: JSON.stringify([note]),
    lead_locker: Object.assign({}, m.meta, { received_at: now.toISOString(), sms_status: sendNow ? 'sending' : (m.phone ? 'queued' : 'skipped') })
  };
  if (geo) { row.lat = geo.lat; row.lng = geo.lng; }
  const ins = await doFetch(SUPA_URL + '/rest/v1/customers', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify(row) });
  const insj = await ins.json().catch(function () { return null; });
  if (!ins.ok || !Array.isArray(insj) || !insj[0]) { console.error('leadlocker insert failed', ins.status, JSON.stringify(insj).slice(0, 300)); return out(500, { error: 'could not save lead' }); }
  const c = insj[0];

  let sms = { status: row.lead_locker.sms_status };
  if (sendNow) {
    sms = await LL.sendLeadSms(c, m.address, doFetch);
    const meta = Object.assign({}, c.lead_locker, { sms_status: sms.status, sms_at: new Date().toISOString(), sms_reason: sms.reason || null });
    const notes = parseNotes(c.notes); notes.push(noteEntry(sms.status === 'sent' ? 'Texted the homeowner to confirm their roof (satellite image attached).' : 'Roof-confirm text did NOT send (' + (sms.reason || sms.status) + ') — call or text manually.'));
    await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ lead_locker: meta, notes: JSON.stringify(notes) }) });
  }
  return out(200, { ok: true, id: c.id, sms: sms.status });
};
