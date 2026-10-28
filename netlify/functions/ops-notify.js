// Ops partner automations (2026-10-28, per Dennis). Every 10 min:
//  1. JOB ASSIGNED — a sold job with assigned_ops and a future diagnostic_date: text/email the partner once per
//     (partner, appointment time) with the address, window and a one-tap Add-to-calendar link.
//  2. FINDINGS REMINDER — after 4:30pm PT, a diagnostic that happened today with no findings posted: remind once per job/day.
// Each partner chooses channels with checkboxes (team_members.notify_prefs). No prefs = nothing sent.
const notify = require('./lib/notify');
const { token } = require('./lib/newsletter');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const TZ = 'America/Los_Angeles';
const ptParts = d => { const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {}); return p; };
exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const K = process.env.SUPA_SERVICE_KEY; if (!K) return { statusCode: 500, body: 'no key' };
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  const get = async p => { try { const r = await doFetch(SUPA + p, { headers: H }); const j = await r.json(); return Array.isArray(j) ? j : []; } catch (e) { return []; } };
  const seen = async key => (await get('/pipeline_state?key=eq.' + encodeURIComponent(key) + '&select=key')).length > 0;
  const mark = key => doFetch(SUPA + '/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key, value: JSON.stringify({ ts: Date.now() }), updated_at: new Date().toISOString() }) }).catch(() => {});
  const partners = {}; (await get('/team_members?role=eq.ops&active=eq.true&select=id,name,email,phone,notify_prefs')).forEach(p => partners[p.id] = p);
  const now = new Date(), nowIso = now.toISOString();
  const fmt = (d, o) => new Date(d).toLocaleString('en-US', Object.assign({ timeZone: TZ }, o));
  const out = { assigned: 0, reminders: 0 };

  async function send(p, sms, mail, kind) {
    const pr = p.notify_prefs || {};
    const wantSms = !!pr[kind + '_sms'], wantMail = !!pr[kind + '_email'];
    const to = { phone: p.phone, email: p.email, first_name: (p.name || '').split(' ')[0] };
    let ok = false;
    if (wantSms && p.phone) { const r = await notify.sendSms(to, sms, doFetch); ok = ok || r.ok; }
    if (wantMail && p.email) { const r = await notify.sendEmail(to, mail.subject, mail.heading, mail.lines, mail.cta, doFetch); ok = ok || r.ok; }
    return { ok, tried: wantSms || wantMail };
  }

  // 1. job assigned (or rescheduled)
  const jobs = await get('/customers?select=id,first_name,last_name,address,assigned_ops,diagnostic_date,arrival_end,arrival_window&assigned_ops=not.is.null&sold_type=not.is.null&diagnostic_date=gt.' + nowIso + '&archived=not.eq.true&limit=300');
  for (const c of jobs) {
    const p = partners[c.assigned_ops]; if (!p || !p.notify_prefs) continue;
    const key = 'opsnotify_assigned_' + c.id + '_' + c.assigned_ops + '_' + String(c.diagnostic_date).slice(0, 16);
    if (await seen(key)) continue;
    const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
    const when = fmt(c.diagnostic_date, { weekday: 'short', month: 'short', day: 'numeric' }) + (c.arrival_window ? ', ' + c.arrival_window : ' ' + fmt(c.diagnostic_date, { hour: 'numeric', minute: '2-digit' }));
    const ics = notify.SITE + '/.netlify/functions/ops-ics?id=' + c.id + '&t=' + token('ics|' + c.id);
    const wantCal = p.notify_prefs.calendar_link !== false;
    const sms = 'New job: ' + name + ', ' + (c.address || '') + '. ' + when + '.' + (wantCal ? ' Add to calendar: ' + ics : '') + ' Post findings in the portal when done.';
    const mail = { subject: 'New diagnostic job — ' + name, heading: 'New diagnostic job', lines: [name + ' — ' + (c.address || ''), when, 'Please post your findings in the Ops portal when the visit is done.'], cta: wantCal ? { text: 'Add to calendar', url: ics, label: 'Add to calendar' } : null };
    const r = await send(p, sms, mail, 'job_assigned');
    if (r.ok) { out.assigned++; await mark(key); }
  }

  // 2. end-of-day findings reminder: only between 4:30pm and 8pm PT
  const pt = ptParts(now), mins = (+pt.hour % 24) * 60 + (+pt.minute);
  if (mins >= 16 * 60 + 30 && mins < 20 * 60) {
    const dayKey = pt.year + '-' + pt.month + '-' + pt.day;
    const todays = await get('/customers?select=id,first_name,last_name,assigned_ops,diagnostic_date,diag_findings&assigned_ops=not.is.null&sold_type=not.is.null&diagnostic_date=gte.' + new Date(now.getTime() - 20 * 3600000).toISOString() + '&diagnostic_date=lt.' + nowIso + '&archived=not.eq.true&limit=300');
    for (const c of todays) {
      const dp = ptParts(new Date(c.diagnostic_date)); if (dp.year + '-' + dp.month + '-' + dp.day !== dayKey) continue;
      if (c.diag_findings && c.diag_findings.submitted_at) continue;
      const p = partners[c.assigned_ops]; if (!p || !p.notify_prefs) continue;
      const key = 'opsnotify_eod_' + c.id + '_' + dayKey;
      if (await seen(key)) continue;
      const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
      const sms = 'Reminder: findings for ' + name + ' are not posted yet. Please post them in the Ops portal before end of day.';
      const r = await send(p, sms, { subject: 'Findings needed — ' + name, heading: 'Post your findings', lines: ['Findings for ' + name + ' are not posted yet.', 'Please post them in the Ops portal before end of day so we can get back to the customer.'], cta: { text: 'Open the Ops portal', url: notify.SITE + '/portal', label: 'Open the Ops portal' } }, 'eod_reminder');
      if (r.ok) { out.reminders++; await mark(key); }
    }
  }
  console.log('ops-notify', JSON.stringify(out));
  return { statusCode: 200, body: JSON.stringify(out) };
};
