// Scheduled every 15 min: texts Lead Locker leads that arrived outside 8am-8pm Pacific.
const LL = require('./lib/leadlocker');
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
function parseNotes(n) { try { const a = JSON.parse(n || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const SK = process.env.SUPA_SERVICE_KEY; if (!SK) return { statusCode: 500, body: 'not configured' };
  if (!LL.inSmsWindow(new Date())) return { statusCode: 200, body: 'outside text window' };
  const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
  const r = await doFetch(SUPA_URL + '/rest/v1/customers?select=*&lead_locker->>sms_status=eq.queued&archived=is.false&limit=25', { headers: H });
  let rows = await r.json().catch(function () { return []; });
  if (!Array.isArray(rows)) rows = [];
  let sent = 0, failed = 0;
  for (const c of rows) {
    // already worked by a human (dialed / booked) -> no automated text
    if (c.dial_status || c.sold_type || c.dnc) { await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ lead_locker: Object.assign({}, c.lead_locker, { sms_status: 'skipped', sms_reason: 'already_worked' }) }) }); continue; }
    const sms = await LL.sendLeadSms(c, c.address, doFetch);
    const notes = parseNotes(c.notes); notes.push({ by: 'Lead Locker', ts: new Date().toISOString(), text: sms.status === 'sent' ? 'Texted the homeowner to confirm their roof (satellite image attached).' : 'Roof-confirm text did NOT send (' + (sms.reason || sms.status) + ') — call or text manually.' });
    await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ lead_locker: Object.assign({}, c.lead_locker, { sms_status: sms.status, sms_at: new Date().toISOString(), sms_reason: sms.reason || null }), notes: JSON.stringify(notes) }) });
    if (sms.status === 'sent') sent++; else failed++;
  }
  return { statusCode: 200, body: JSON.stringify({ checked: rows.length, sent: sent, failed: failed }) };
};
