// ads-queue.js — proposes ad pauses and budget changes; Dennis approves each one (2026-11-17).
// Nothing here ever executes on its own: scan() only writes proposals to pipeline_state 'ads_queue'.
// Every approval re-checks the rules against fresh data (execute()), and every change is logged with an undo.
// Rules come from lib/ads-limits.js (Dennis's numbers).
const limits = require('./ads-limits');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const G = 'https://graph.facebook.com/v21.0/';
const sh = function () { const k = process.env.SUPA_SERVICE_KEY || ''; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; };
const acctId = function () { return 'act_' + String(process.env.META_AD_ACCOUNT_ID || '2741612295961694').replace(/^act_/, ''); };

async function graph(path, token, method, body) {
  const u = G + path + (path.indexOf('?') > -1 ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
  const r = await fetch(u, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(function () { return {}; });
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
  return j;
}
async function readKey(key, dflt) {
  try { const r = await fetch(SUPA + '/pipeline_state?key=eq.' + key + '&select=value', { headers: sh() }); const j = await r.json(); let v = j && j[0] && j[0].value; if (typeof v === 'string') v = JSON.parse(v); return v == null ? dflt : v; } catch (e) { return dflt; }
}
async function writeKey(key, value) {
  const r = await fetch(SUPA + '/pipeline_state', { method: 'POST', headers: Object.assign({}, sh(), { Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ key: key, value: JSON.stringify(value), updated_at: new Date().toISOString() }) });
  return r.ok;
}
const schedules = function (row) { return (row.actions || []).filter(function (a) { return /schedule/i.test(a.action_type); }).reduce(function (m, a) { return Math.max(m, parseFloat(a.value) || 0); }, 0); };

// Everything the rules need, from Meta (read) + the portal's own bookings (truth for "did it book").
async function snapshot(token) {
  const act = acctId(), since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [adIns, setIns, ads, sets, leads] = await Promise.all([
    graph(act + '/insights?level=ad&date_preset=last_14d&fields=ad_id,spend,actions&limit=500', token),
    graph(act + '/insights?level=adset&date_preset=last_14d&fields=adset_id,spend,actions&limit=500', token),
    graph(act + '/ads?fields=id,name,effective_status,adset_id&limit=500', token),
    graph(act + '/adsets?fields=id,name,daily_budget,effective_status,campaign{id,daily_budget}&limit=500', token),
    fetch(SUPA + '/customers?utm_content=not.is.null&created_at=gte.' + since + '&select=utm_content,arrival_window,created_at&limit=2000', { headers: sh() }).then(function (r) { return r.json(); }).catch(function () { return []; })
  ]);
  const portal = {}, lastBooked = {};
  (Array.isArray(leads) ? leads : []).forEach(function (c) { if (!c.arrival_window) return; const k = c.utm_content; portal[k] = (portal[k] || 0) + 1; if (!lastBooked[k] || c.created_at > lastBooked[k]) lastBooked[k] = c.created_at; });
  const adm = {}; (adIns.data || []).forEach(function (r) { adm[r.ad_id] = { spend: parseFloat(r.spend) || 0, sched: schedules(r) }; });
  const setm = {}; (setIns.data || []).forEach(function (r) { setm[r.adset_id] = { spend: parseFloat(r.spend) || 0, sched: schedules(r) }; });
  const adList = (ads.data || []).map(function (a) { const m = adm[a.id] || { spend: 0, sched: 0 }; return { id: a.id, name: a.name, status: a.effective_status, adset_id: a.adset_id, spend: m.spend, bookings: Math.max(m.sched, portal[a.id] || 0), lastBooked: lastBooked[a.id] || null }; });
  const setList = (sets.data || []).map(function (s) {
    const m = setm[s.id] || { spend: 0, sched: 0 }, mine = adList.filter(function (a) { return a.adset_id === s.id; });
    const portalBookings = mine.reduce(function (t, a) { return t + (portal[a.id] || 0); }, 0);
    return { id: s.id, name: s.name, status: s.effective_status, budget: (parseFloat(s.daily_budget) || 0) / 100, cbo: !!(s.campaign && s.campaign.daily_budget), spend: m.spend, bookings: Math.max(m.sched, portalBookings) };
  });
  return { ads: adList, adsets: setList };
}
const dailyTotal = function (snap) { return snap.adsets.filter(function (s) { return s.status === 'ACTIVE'; }).reduce(function (t, s) { return t + s.budget; }, 0); };
const days = function (iso) { return iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity; };

// The rules, in one place. Returns { ok, ... } for a proposed budget change, using fresh numbers.
function budgetRule(L, set, snap, lastChangeAt) {
  if (set.status !== 'ACTIVE') return { ok: false, why: 'ad set is not active' };
  if (set.cbo) return { ok: false, why: 'budget is set at the campaign level' };
  if (!(set.budget > 0)) return { ok: false, why: 'no daily budget on this ad set' };
  if (set.bookings < L.min_bookings_14d) return { ok: false, why: 'only ' + set.bookings + ' bookings in 14 days (needs ' + L.min_bookings_14d + ')' };
  const cpb = set.spend / set.bookings;
  if (cpb > L.max_cost_per_booking) return { ok: false, why: 'cost per booking $' + cpb.toFixed(0) + ' is above your $' + L.max_cost_per_booking + ' limit' };
  if (days(lastChangeAt) < L.increase_cooldown_days) return { ok: false, why: 'changed less than ' + L.increase_cooldown_days + ' days ago' };
  const current = dailyTotal(snap), room = (L.monthly_ceiling / 30) - current;
  if (room <= 0.5) return { ok: false, why: 'no room left under the $' + L.monthly_ceiling + '/month ceiling' };
  const raise = Math.min(set.budget * (L.max_increase_pct / 100), room);
  const next = Math.round((set.budget + raise) * 100) / 100;
  if (next <= set.budget) return { ok: false, why: 'increase too small to matter' };
  return { ok: true, from: set.budget, to: next, cpb: cpb };
}
function pauseRule(L, ad) {
  if (ad.status !== 'ACTIVE') return { ok: false, why: 'ad is not active' };
  if (days(ad.lastBooked) < L.protect_booked_days) return { ok: false, why: 'it booked in the last ' + L.protect_booked_days + ' days' };
  if (ad.bookings === 0 && ad.spend >= L.max_cost_per_booking) return { ok: true, why: '$' + ad.spend.toFixed(0) + ' spent in 14 days with no booked evaluations' };
  if (ad.bookings > 0 && ad.spend / ad.bookings > 2 * L.max_cost_per_booking && ad.spend >= 2 * L.max_cost_per_booking) return { ok: true, why: '$' + (ad.spend / ad.bookings).toFixed(0) + ' per booking, over twice your $' + L.max_cost_per_booking + ' limit' };
  return { ok: false, why: 'within limits' };
}

async function scan() {
  const token = process.env.META_ADS_TOKEN; if (!token) return { ok: false, reason: 'no_read_token' };
  const [L, snap, queue, log] = await Promise.all([limits.load(), snapshot(token), readKey('ads_queue', []), readKey('ads_change_log', { items: [] })]);
  const items = Array.isArray(queue) ? queue : (queue.items || []), changes = (log && log.items) || [];
  const have = function (kind, target) { return items.some(function (p) { return p.kind === kind && p.target === target && (p.status === 'open' || (p.status === 'dismissed' && days(p.decided_at) < 7)); }); };
  const added = [];
  snap.ads.forEach(function (a) { const r = pauseRule(L, a); if (r.ok && !have('pause', a.id)) added.push({ id: 'q_' + Date.now().toString(36) + added.length, kind: 'pause', target: a.id, name: a.name, why: r.why, status: 'open', created_at: new Date().toISOString() }); });
  snap.adsets.forEach(function (s) {
    const last = changes.filter(function (c) { return c.kind === 'budget' && c.target === s.id && !c.undone_at; }).map(function (c) { return c.at; }).sort().pop();
    const r = budgetRule(L, s, snap, last);
    if (r.ok && !have('budget', s.id)) added.push({ id: 'q_' + Date.now().toString(36) + added.length, kind: 'budget', target: s.id, name: s.name, why: s.bookings + ' bookings at $' + r.cpb.toFixed(0) + ' each in 14 days', from: r.from, to: r.to, status: 'open', created_at: new Date().toISOString() });
  });
  if (added.length) await writeKey('ads_queue', added.concat(items).slice(0, 100));
  return { ok: true, added: added.length, open: added.concat(items).filter(function (p) { return p.status === 'open'; }).length };
}

// Approval: re-check everything with fresh data, then make the one change with the edit token, then log it.
async function execute(id) {
  const rtoken = process.env.META_ADS_TOKEN, etoken = process.env.META_ADS_EDIT_TOKEN;
  if (!rtoken || !etoken) return { ok: false, reason: 'no_token' };
  const queue = await readKey('ads_queue', []), items = Array.isArray(queue) ? queue : (queue.items || []);
  const p = items.find(function (x) { return x.id === id; });
  if (!p) return { ok: false, reason: 'not_found' };
  if (p.status !== 'open') return { ok: false, reason: 'already_' + p.status };
  const [L, snap, log] = await Promise.all([limits.load(), snapshot(rtoken), readKey('ads_change_log', { items: [] })]);
  const changes = (log && log.items) || [];
  let entry;
  if (p.kind === 'pause') {
    const ad = snap.ads.find(function (a) { return a.id === p.target; });
    const r = ad ? pauseRule(L, ad) : { ok: false, why: 'ad not found' };
    if (!r.ok) return { ok: false, reason: 'rule_failed', message: 'No longer allowed: ' + r.why };
    await graph(p.target, etoken, 'POST', { status: 'PAUSED' });
    const after = await graph(p.target + '?fields=effective_status,status', etoken);
    if (after.status !== 'PAUSED') return { ok: false, reason: 'verify_failed', message: 'Meta did not confirm the pause. Check Ads Manager.' };
    entry = { kind: 'pause', target: p.target, name: p.name, before: 'ACTIVE', after: 'PAUSED' };
  } else if (p.kind === 'budget') {
    const set = snap.adsets.find(function (s) { return s.id === p.target; });
    const last = changes.filter(function (c) { return c.kind === 'budget' && c.target === p.target && !c.undone_at; }).map(function (c) { return c.at; }).sort().pop();
    const r = set ? budgetRule(L, set, snap, last) : { ok: false, why: 'ad set not found' };
    if (!r.ok) return { ok: false, reason: 'rule_failed', message: 'No longer allowed: ' + r.why };
    await graph(p.target, etoken, 'POST', { daily_budget: Math.round(r.to * 100) });
    const after = await graph(p.target + '?fields=daily_budget', etoken);
    if (Math.round(parseFloat(after.daily_budget)) !== Math.round(r.to * 100)) return { ok: false, reason: 'verify_failed', message: 'Meta did not confirm the new budget. Check Ads Manager.' };
    entry = { kind: 'budget', target: p.target, name: p.name, before: r.from, after: r.to };
  } else if (p.kind === 'launch') {
    // Re-check the ceiling with fresh numbers, then turn on the ad set and the ad together; verify both.
    const cur = snap.adsets.filter(function (s) { return s.status === 'ACTIVE' && s.id !== p.target; }).reduce(function (t, s) { return t + s.budget; }, 0);
    const mine = snap.adsets.find(function (s) { return s.id === p.target; });
    if (!mine) return { ok: false, reason: 'rule_failed', message: 'No longer allowed: ad set not found' };
    if (cur + mine.budget > L.monthly_ceiling / 30 + 0.01) return { ok: false, reason: 'rule_failed', message: 'No longer allowed: launching would pass your $' + L.monthly_ceiling + '/month ceiling' };
    await graph(p.target, etoken, 'POST', { status: 'ACTIVE' });
    await graph(p.ad_id, etoken, 'POST', { status: 'ACTIVE' });
    const [s2, a2] = await Promise.all([graph(p.target + '?fields=status', etoken), graph(p.ad_id + '?fields=status', etoken)]);
    if (s2.status !== 'ACTIVE' || a2.status !== 'ACTIVE') return { ok: false, reason: 'verify_failed', message: 'Meta did not confirm the launch. Check Ads Manager.' };
    entry = { kind: 'launch', target: p.target, ad_id: p.ad_id, name: p.name, before: 'PAUSED', after: 'ACTIVE' };
  } else return { ok: false, reason: 'unknown_kind' };
  entry.id = 'chg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); entry.at = new Date().toISOString(); entry.queue_id = p.id;
  p.status = 'approved'; p.decided_at = entry.at;
  changes.unshift(entry);
  await writeKey('ads_change_log', { items: changes.slice(0, 200) }); await writeKey('ads_queue', items);
  return { ok: true, log_id: entry.id, kind: entry.kind, name: p.name, before: entry.before, after: entry.after };
}
async function dismiss(id) {
  const queue = await readKey('ads_queue', []), items = Array.isArray(queue) ? queue : (queue.items || []);
  const p = items.find(function (x) { return x.id === id; }); if (!p) return { ok: false, reason: 'not_found' };
  if (p.status !== 'open') return { ok: false, reason: 'already_' + p.status };
  p.status = 'dismissed'; p.decided_at = new Date().toISOString(); await writeKey('ads_queue', items); return { ok: true };
}
async function undo(logId) {
  const etoken = process.env.META_ADS_EDIT_TOKEN; if (!etoken) return { ok: false, reason: 'no_token' };
  const log = await readKey('ads_change_log', { items: [] }), items = (log && log.items) || [];
  const it = items.find(function (x) { return x.id === logId; });
  if (!it || ['pause', 'budget', 'launch'].indexOf(it.kind) < 0) return { ok: false, reason: 'not_found' };
  if (it.undone_at) return { ok: false, reason: 'already_undone' };
  if (it.kind === 'launch') { await graph(it.target, etoken, 'POST', { status: 'PAUSED' }); await graph(it.ad_id, etoken, 'POST', { status: 'PAUSED' }); } else if (it.kind === 'pause') await graph(it.target, etoken, 'POST', { status: 'ACTIVE' }); else await graph(it.target, etoken, 'POST', { daily_budget: Math.round(it.before * 100) });
  it.undone_at = new Date().toISOString(); await writeKey('ads_change_log', { items: items });
  return { ok: true };
}
async function list() {
  const queue = await readKey('ads_queue', []), items = Array.isArray(queue) ? queue : (queue.items || []);
  const log = await readKey('ads_change_log', { items: [] });
  return { ok: true, open: items.filter(function (p) { return p.status === 'open'; }), changes: ((log && log.items) || []).filter(function (c) { return c.kind === 'pause' || c.kind === 'budget' || c.kind === 'launch'; }).slice(0, 10) };
}
module.exports = { scan: scan, execute: execute, dismiss: dismiss, undo: undo, list: list, pauseRule: pauseRule, budgetRule: budgetRule };
