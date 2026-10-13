// Internal "Sign & Pay" alert (2026-10-13, per Dennis — Jon Faiella signed + paid after the rep left and
// nobody knew). Called server-side straight from sign-complete / sign-fallback, so there is no public
// endpoint to abuse. Texts the assigned rep + Dennis (team_members.phone) and emails them (team_members.email,
// plus AGENT_REPORT_EMAIL / Dennis as a floor). One alert per key (the Stripe PaymentIntent, or customer+time),
// recorded in pipeline_state so client retries can't double-alert. Never throws — a failed alert must not fail a payment.
const notify = require('./notify');
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const DEFAULT_REP = 'tech4';
const FALLBACK_EMAIL = process.env.AGENT_REPORT_EMAIL || 'dennislarsen29@gmail.com';

async function alertStaff(opts, doFetch) {
  doFetch = doFetch || fetch;
  try {
    const KEY = process.env.SUPA_SERVICE_KEY; if (!KEY) return { ok: false, reason: 'no_service_key' };
    const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
    const get = async (p) => (await (await doFetch(SUPA_URL + '/rest/v1' + p, { headers: H })).json().catch(() => null));
    const rlKey = 'signpay_alert_' + opts.key;
    const done = ((await get('/pipeline_state?key=eq.' + encodeURIComponent(rlKey) + '&select=value')) || [])[0];
    if (done) return { ok: true, skipped: 'already_sent' };

    const c = opts.customer || {};
    const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'A customer';
    const ids = [c.rep_id || DEFAULT_REP]; if (ids.indexOf(DEFAULT_REP) === -1) ids.push(DEFAULT_REP);
    const sms = opts.sms.replace('{name}', name);
    const subject = opts.subject.replace('{name}', name);
    const lines = [name + (c.address ? ' — ' + c.address : '')].concat(opts.lines || []);
    const link = notify.SITE + '/portal';

    const results = []; const emails = {};
    for (const tid of ids) {
      const tm = ((await get('/team_members?id=eq.' + encodeURIComponent(tid) + '&select=name,phone,email&limit=1')) || [])[0];
      if (!tm) { results.push({ to: tid, sms: 'no_member' }); continue; }
      if (tm.email) emails[tm.email.toLowerCase()] = tm.name;
      if (tm.phone) { const r = await notify.sendSms({ phone: tm.phone, first_name: tm.name }, sms, doFetch); results.push({ to: tid, sms: r.ok ? 'ok' : r.reason }); }
      else results.push({ to: tid, sms: 'no_phone' });
    }
    emails[FALLBACK_EMAIL.toLowerCase()] = emails[FALLBACK_EMAIL.toLowerCase()] || 'Dennis';
    for (const em of Object.keys(emails)) {
      const r = await notify.sendEmail({ email: em }, subject, subject, lines, { url: link, label: 'Open the portal' }, doFetch);
      results.push({ to: em, email: r.ok ? 'ok' : r.reason });
    }
    const anyOk = results.some(r => r.sms === 'ok' || r.email === 'ok');
    if (anyOk) {
      await doFetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: rlKey, value: JSON.stringify({ ts: Date.now() }), updated_at: new Date().toISOString() }) }).catch(() => {});
    }
    console.log('staff-alert', opts.key, JSON.stringify(results));
    return { ok: anyOk, results };
  } catch (e) { console.error('staff-alert error', e.message); return { ok: false, reason: 'error' }; }
}
module.exports = { alertStaff };
