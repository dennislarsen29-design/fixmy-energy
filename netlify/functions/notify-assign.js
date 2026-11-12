// Text + email to a Tech/rep when a lead is assigned or handed to them (2026-11-12, per Dennis).
// Public endpoint, so the caller names only the customer and who made the change; the recipient is
// ALWAYS the lead's current rep_id read from our records, and the wording is built here. Skips when the
// person assigning is the assignee, and rate-limits per (lead, rep) so a re-save can't spam.
const notify = require('./lib/notify');
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });

exports.handler = async function (event, context, deps) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method Not Allowed' });
  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return out(500, { error: 'Server misconfigured' });
  const doFetch = (deps && deps.fetch) || fetch;
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  let b; try { b = JSON.parse(event.body); } catch (e) { return out(400, { error: 'Invalid JSON' }); }
  const id = String(b.customerId || ''), by = String(b.byId || '').slice(0, 60);
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return out(400, { error: 'Bad request' });
  const get = async (path) => (await (await doFetch(SUPA_URL + '/rest/v1' + path, { headers: H })).json().catch(() => null));

  const c = ((await get('/customers?id=eq.' + id + '&select=first_name,last_name,address,phone,diagnostic_date,arrival_window,rep_id,archived,disposition_exit&limit=1')) || [])[0];
  if (!c || !c.rep_id) return out(200, { ok: false, skipped: 'no_rep' });
  if (c.archived || c.disposition_exit) return out(200, { ok: false, skipped: 'set_aside' });
  if (by && by === c.rep_id) return out(200, { ok: false, skipped: 'self_assigned' });

  const rlKey = 'assignalert_' + id + '_' + c.rep_id;
  const rl = ((await get('/pipeline_state?key=eq.' + encodeURIComponent(rlKey) + '&select=value')) || [])[0];
  if (rl) { try { if (Date.now() - JSON.parse(rl.value).ts < 10 * 60000) return out(200, { ok: true, skipped: 'recent' }); } catch (e) {} }

  const tm = ((await get('/team_members?id=eq.' + encodeURIComponent(c.rep_id) + '&select=name,phone,email&limit=1')) || [])[0];
  if (!tm || (!tm.phone && !tm.email)) return out(200, { ok: false, skipped: 'no_contact' });

  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'A lead';
  let when = '';
  if (c.diagnostic_date) {
    try {
      const d = new Date(c.diagnostic_date);
      when = ' Appointment: ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }) + (c.arrival_window ? ', ' + c.arrival_window : '') + '.';
    } catch (e) {}
  }
  const msg = 'New lead assigned to you: ' + name + (c.address ? ', ' + c.address : '') + '.' + when + (c.phone ? ' Phone: ' + c.phone + '.' : '') + ' Open it: ' + notify.SITE + '/portal';
  const results = {};
  if (tm.phone) { const r = await notify.sendSms({ phone: tm.phone, first_name: tm.name }, msg, doFetch); results.sms = { ok: r.ok, reason: r.reason }; }
  if (tm.email) {
    const r = await notify.sendEmail({ email: tm.email }, 'New lead assigned: ' + name, 'New lead assigned to you', [msg.replace(' Open it: ' + notify.SITE + '/portal', '')], { url: notify.SITE + '/portal', label: 'Open the portal' }, doFetch).catch(() => ({ ok: false }));
    results.email = { ok: r.ok };
  }
  const ok = !!((results.sms && results.sms.ok) || (results.email && results.email.ok));
  if (ok) await doFetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: rlKey, value: JSON.stringify({ ts: Date.now() }), updated_at: new Date().toISOString() }) }).catch(() => {});
  return out(200, { ok, results });
};
