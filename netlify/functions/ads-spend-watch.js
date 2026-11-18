// ads-spend-watch.js — daily-spend and monthly-ceiling alarm for Meta ads (2026-11-17, per Dennis).
// Read-only (uses META_ADS_TOKEN / ads_read). Texts + emails Dennis once per day per kind. Never changes an ad.
// Scheduled every 2 hours in netlify.toml. Manual: GET /.netlify/functions/ads-spend-watch
const limits = require('./lib/ads-limits');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const G = 'https://graph.facebook.com/v21.0/';
const sh = function () { const k = process.env.SUPA_SERVICE_KEY || ''; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; };

async function graph(path, token) {
  const r = await fetch(G + path + (path.indexOf('?') > -1 ? '&' : '?') + 'access_token=' + encodeURIComponent(token));
  const j = await r.json().catch(function () { return {}; });
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
  return j;
}
// Daily budgets are in the account currency's minor unit (cents). Campaign-level (CBO) and ad-set budgets never overlap.
async function dailyBudgetTotal(acct, token) {
  const act = 'act_' + acct;
  const f = function (edge) { return graph(act + '/' + edge + '?fields=daily_budget,effective_status&limit=200&filtering=' + encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }])), token); };
  const [c, a] = await Promise.all([f('campaigns'), f('adsets')]);
  const sum = function (j) { return (j.data || []).reduce(function (t, x) { return t + (parseFloat(x.daily_budget) || 0); }, 0); };
  return (sum(c) + sum(a)) / 100;
}
async function readState() {
  try { const r = await fetch(SUPA + '/pipeline_state?key=eq.ads_spend_alerts&select=value', { headers: sh() }); const j = await r.json(); let v = j && j[0] && j[0].value; if (typeof v === 'string') v = JSON.parse(v); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
async function writeState(v) {
  await fetch(SUPA + '/pipeline_state', { method: 'POST', headers: Object.assign({}, sh(), { Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ key: 'ads_spend_alerts', value: JSON.stringify(v), updated_at: new Date().toISOString() }) });
}
async function tell(subject, text) {
  const out = { sms: false, email: false };
  const GHL = process.env.GHL_API_KEY, LOC = process.env.GHL_LOCATION_ID;
  try {
    const tm = (await (await fetch(SUPA + '/team_members?id=eq.tech4&select=name,phone', { headers: sh() })).json())[0];
    if (GHL && LOC && tm && tm.phone) {
      const d = tm.phone.replace(/\D/g, ''), e164 = d.length === 10 ? '+1' + d : '+' + d;
      const gh = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GHL, Version: '2021-07-28' };
      const up = await (await fetch('https://services.leadconnectorhq.com/contacts/upsert', { method: 'POST', headers: gh, body: JSON.stringify({ firstName: tm.name || 'Dennis', phone: e164, locationId: LOC }) })).json();
      const cid = up.contact && up.contact.id;
      if (cid) { const r = await fetch('https://services.leadconnectorhq.com/conversations/messages', { method: 'POST', headers: gh, body: JSON.stringify({ type: 'SMS', contactId: cid, message: text, locationId: LOC }) }); out.sms = r.ok; }
    }
  } catch (e) { console.error('[ads-spend-watch] sms', e.message); }
  const RESEND = process.env.RESEND_API_KEY, TO = process.env.AGENT_REPORT_EMAIL || 'dennislarsen29@gmail.com';
  if (RESEND) {
    try { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Solar Review <info@fixmy.energy>', to: [TO], subject: subject, html: '<p>' + text.replace(/</g, '&lt;') + '</p><p><a href="https://fixmy.energy/portal">Open S.U.N.</a></p>' }) }); out.email = r.ok; } catch (e) { console.error('[ads-spend-watch] email', e.message); }
  }
  return out;
}

exports.handler = async function () {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return { statusCode: 200, body: JSON.stringify({ skipped: 'META_ADS_TOKEN not set' }) };
  const acct = String(process.env.META_AD_ACCOUNT_ID || '2741612295961694').replace(/^act_/, '');
  try {
    const L = await limits.load();
    const [today, month, budget] = await Promise.all([
      graph('act_' + acct + '/insights?fields=spend&date_preset=today', token),
      graph('act_' + acct + '/insights?fields=spend&date_preset=this_month', token),
      dailyBudgetTotal(acct, token)
    ]);
    const spendToday = parseFloat(today.data && today.data[0] && today.data[0].spend) || 0;
    const spendMonth = parseFloat(month.data && month.data[0] && month.data[0].spend) || 0;
    const day = new Date().toISOString().slice(0, 10), mon = day.slice(0, 7);
    const state = await readState(), fired = [];
    // 1) a single day well over what the budgets allow (ignore tiny amounts)
    if (budget > 0 && spendToday >= 20 && spendToday > L.alert_multiple * budget && state.day !== day) {
      const t = await tell('Ad spend alert: today is over budget', 'AD SPEND ALERT: Meta spent $' + spendToday.toFixed(0) + ' so far today, which is ' + (spendToday / budget).toFixed(1) + 'x your $' + budget.toFixed(0) + '/day budgets. Check Ads Manager.');
      state.day = day; fired.push({ kind: 'day', spendToday: spendToday, budget: budget, sent: t });
    }
    // 2) month-to-date past the ceiling you set
    if (spendMonth > L.monthly_ceiling && state.month !== mon) {
      const t = await tell('Ad spend alert: monthly ceiling passed', 'AD SPEND ALERT: Meta has spent $' + spendMonth.toFixed(0) + ' this month, past your $' + L.monthly_ceiling + ' ceiling. Pause or lower budgets in Ads Manager.');
      state.month = mon; fired.push({ kind: 'month', spendMonth: spendMonth, ceiling: L.monthly_ceiling, sent: t });
    }
    if (fired.length) await writeState(state);
    return { statusCode: 200, body: JSON.stringify({ spendToday: spendToday, spendMonth: spendMonth, dailyBudget: budget, fired: fired }) };
  } catch (e) { console.error('[ads-spend-watch] failed:', e.message); return { statusCode: 200, body: 'error: ' + e.message }; }
};
