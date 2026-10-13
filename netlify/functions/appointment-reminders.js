// Scheduled every 15 min: reminder texts/emails before customer appointments (2026-10-13, deep-research finding —
// a day-before and a same-day reminder cut no-shows; the scheduling notice alone is not a reminder).
//  - "day"  reminder: appointment is within ~26h and the scheduling notice went out 6+ hours ago.
//  - "soon" reminder: appointment is 15 min – 2.5h away.
// Only 8am–8pm Pacific. Skips canceled/completed, date-only entries (no time to remind about), and any
// appointment already reminded at that stage. State lives in pipeline_state key 'appt_reminders' — no migration.
const notify = require('./lib/notify');
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const TZ = 'America/Los_Angeles';
const NOUN = { 'Solar Evaluation': 'solar evaluation', 'Diagnostic Visit': 'diagnostic visit', 'Repair Service Visit': 'repair service visit', 'Battery Install': 'battery installation', 'Site Survey': 'site survey', 'Install': 'installation', 'Inspection': 'inspection' };
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
function inWindow(now) { const h = parseInt(new Date(now).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }), 10); return h >= 8 && h < 20; }

exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const KEY = process.env.SUPA_SERVICE_KEY; if (!KEY) return { statusCode: 500, body: 'not configured' };
  const now = (deps && deps.now) ? new Date(deps.now) : new Date();
  if (!inWindow(now)) return { statusCode: 200, body: 'outside reminder window' };
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const from = new Date(now.getTime() + 15 * 60000).toISOString(), to = new Date(now.getTime() + 26 * 3600000).toISOString();
  const r = await doFetch(SUPA_URL + '/rest/v1/appointments?status=eq.scheduled&starts_at=gte.' + from + '&starts_at=lte.' + to + '&select=*&order=starts_at.asc&limit=60', { headers: H });
  let rows = await r.json().catch(() => []); if (!Array.isArray(rows)) rows = [];
  rows = rows.filter(a => NOUN[a.event_type] && a.notes !== 'date_only');
  let state = {};
  try { const sr = await doFetch(SUPA_URL + '/rest/v1/pipeline_state?key=eq.appt_reminders&select=value', { headers: H }); const sv = await sr.json(); state = (sv && sv[0] && sv[0].value) || {}; } catch (e) { state = {}; }
  const next = {}; let sent = 0, skipped = 0;
  for (const a of rows) {
    const hrs = (new Date(a.starts_at) - now) / 3600000, st = state[a.id] || {};
    next[a.id] = st;
    let stage = null;
    if (hrs <= 2.5) stage = st.soon ? null : 'soon';
    else if (hrs <= 26) { const noticeAge = a.notified_at ? (now - new Date(a.notified_at)) / 3600000 : 99; stage = (st.day || noticeAge < 6) ? null : 'day'; }
    if (!stage) { skipped++; continue; }
    const cr = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + a.customer_id + '&select=id,first_name,email,phone,access_code,address,dnc,archived&limit=1', { headers: H });
    const c = ((await cr.json().catch(() => [])) || [])[0];
    if (!c || c.dnc || c.archived) { skipped++; continue; }
    const first = (c.first_name || 'there').trim(), noun = NOUN[a.event_type], link = notify.magicLink(c);
    const when = fmtDate(a.starts_at) + ', ' + fmtTime(a.starts_at) + (a.ends_at ? ' – ' + fmtTime(a.ends_at) : '');
    const lead = stage === 'day' ? 'Reminder: your Solar Review ' + noun + ' is tomorrow' : 'Your Solar Review ' + noun + ' is coming up soon';
    const sms = 'Hi ' + first + '! ' + lead + ' (' + when + '). Please be home. Need to change it? Call (619) 777-6527 or open ' + link + ' Reply STOP to opt out.';
    const mail = { subject: (stage === 'day' ? 'Reminder: ' : 'Starting soon: ') + 'your ' + noun + ' — ' + fmtDate(a.starts_at), heading: lead, lines: ['Hi ' + first + ',', '<b>' + when + '</b>', 'Please be home during the window. Need to reschedule? Call (619) 777-6527.'], cta: { url: link, label: 'View in my portal' } };
    const res = await notify.sendBoth(c, sms, mail, doFetch);
    if (res.ok) { st[stage] = now.toISOString(); next[a.id] = st; sent++; } else skipped++;
  }
  try {
    await doFetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'appt_reminders', value: next }) });
  } catch (e) { /* worst case a reminder repeats once */ }
  console.log('appointment-reminders', { checked: rows.length, sent, skipped });
  return { statusCode: 200, body: JSON.stringify({ checked: rows.length, sent, skipped }) };
};
