// Independent-electrician pay (2026-10-31, per Dennis): every Ops partner EXCEPT Cosmic is paid on the electrician plan
// shown on /electricians: $250 per completed diagnostic, a travel adder by distance from the partner's base ZIP to the job,
// and a $50 Professional Bonus when the visit meets its conditions. Cosmic (ops3) stays on its own flat $300 model.
// Everything is recomputed from the database on each call and is idempotent, so it is safe to call after every save.
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const EXCLUDED = ['ops3'];
const BASE = 250, BONUS = 50, COSMIC_FLAT = 300;
const TRAVEL = [{ upTo: 25, add: 0 }, { upTo: 50, add: 50 }, { upTo: 100, add: 100 }]; // beyond 100 mi: +100 and flagged
const LABEL_BASE = 'Diagnostic — COGS', LABEL_BONUS = 'Professional bonus — COGS';
const PT = 'America/Los_Angeles';
// Jobs sold or priced before this moment keep the pricing they already have (per Dennis: "don't change past jobs pricing").
const CUTOVER = '2026-11-01T00:00:00Z';
const isLegacy = (c, costs) => (c.sold_at && c.sold_at < CUTOVER) || (costs || []).some(x => x.created_at && x.created_at < CUTOVER);

function heads() { const k = process.env.SUPA_SERVICE_KEY; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }
function miles(a, b, c, d) { const R = 3958.8, r = x => x * Math.PI / 180, dLa = r(c - a), dLo = r(d - b); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function travelAdder(mi) { for (const t of TRAVEL) if (mi <= t.upTo) return { add: t.add, over: false }; return { add: 100, over: true }; }
function ptDay(iso) { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: PT }); } catch (e) { return ''; } }
async function geocode(address, doFetch) {
  try {
    const r = await doFetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=' + encodeURIComponent(address) + '&benchmark=Public_AR_Current&format=json');
    if (!r.ok) return null; const j = await r.json(); const m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
    return m && m.coordinates ? { lat: m.coordinates.y, lng: m.coordinates.x } : null;
  } catch (e) { return null; }
}
async function get(path, doFetch) { const r = await doFetch(SUPA_URL + '/rest/v1' + path, { headers: heads() }); return r.ok ? await r.json() : null; }
const tag = id => 'payee:' + id;
const isOwnLine = (c, id) => String(c.created_by || '') === tag(id);

// Create or refresh the partner's pending base + travel lines for one diagnostic job.
async function reconcile(customerId, doFetch) {
  doFetch = doFetch || fetch;
  const c = ((await get('/customers?id=eq.' + customerId + '&select=id,assigned_ops,sold_type,sold_at,address,lat,lng&limit=1', doFetch)) || [])[0];
  if (!c) return { ok: false, reason: 'no_customer' };
  if (c.sold_type !== 'diagnostic') return { ok: true, skipped: 'not_diagnostic' };
  if (!c.assigned_ops) return { ok: true, skipped: 'unassigned' };
  const costs = (await get('/job_costs?customer_id=eq.' + customerId + '&select=id,label,amount,status,created_by,created_at', doFetch)) || [];
  const del = async (ids) => { for (const id of ids) await doFetch(SUPA_URL + '/rest/v1/job_costs?id=eq.' + id, { method: 'DELETE', headers: heads() }); };
  const ins = async (row) => doFetch(SUPA_URL + '/rest/v1/job_costs', { method: 'POST', headers: Object.assign({}, heads(), { Prefer: 'return=minimal' }), body: JSON.stringify(Object.assign({ customer_id: customerId, status: 'pending' }, row)) });
  if (isLegacy(c, costs)) return { ok: true, skipped: 'legacy_pricing' };
  const pendingAuto = costs.filter(x => x.status === 'pending' && x.created_by === 'auto-diag-convert');

  if (EXCLUDED.indexOf(c.assigned_ops) > -1) {
    // Back on Cosmic's model: drop any electrician-plan pending lines, keep the flat $300 placeholder.
    const own = costs.filter(x => x.status === 'pending' && String(x.created_by || '').indexOf('payee:') === 0 && /^(Diagnostic|Travel adder)/.test(x.label || ''));
    if (own.length) await del(own.map(x => x.id));
    const left = costs.length - own.length;
    if (!left) await ins({ label: LABEL_BASE, amount: COSMIC_FLAT, created_by: 'auto-diag-convert' });
    return { ok: true, model: 'cosmic' };
  }
  // A diagnostic line already PAID (to anyone) means the pay was settled: never recompute it.
  if (costs.some(x => x.status === 'paid' && /^Diagnostic/.test(x.label || ''))) return { ok: true, skipped: 'already_paid' };

  const p = ((await get('/team_members?id=eq.' + encodeURIComponent(c.assigned_ops) + '&select=id,name,home_lat,home_lng,service_bases&limit=1', doFetch)) || [])[0] || {};
  let mi = null, add = 0, over = false, noBase = false, noLoc = false;
  const bases = (Array.isArray(p.service_bases) ? p.service_bases : []).map(b => ({ lat: parseFloat(b.lat), lng: parseFloat(b.lng) })).filter(b => isFinite(b.lat) && isFinite(b.lng));
  if (!bases.length && isFinite(parseFloat(p.home_lat)) && isFinite(parseFloat(p.home_lng))) bases.push({ lat: parseFloat(p.home_lat), lng: parseFloat(p.home_lng) });
  if (!bases.length) noBase = true;
  else {
    let lat = parseFloat(c.lat), lng = parseFloat(c.lng);
    if (!isFinite(lat) || !isFinite(lng)) { const g = await geocode(c.address || '', doFetch); if (g) { lat = g.lat; lng = g.lng; } }
    if (!isFinite(lat) || !isFinite(lng)) noLoc = true;
    else { mi = Math.round(Math.min.apply(null, bases.map(b => miles(lat, lng, b.lat, b.lng))) * 10) / 10; const t = travelAdder(mi); add = t.add; over = t.over; }
  }
  const want = [{ label: LABEL_BASE, amount: BASE }];
  if (add > 0) want.push({ label: 'Travel adder (' + Math.round(mi) + ' mi) — COGS', amount: add });
  const mine = costs.filter(x => x.status === 'pending' && isOwnLine(x, c.assigned_ops) && /^(Diagnostic|Travel adder)/.test(x.label || ''));
  const same = mine.length === want.length && want.every(w => mine.some(m => m.label === w.label && Number(m.amount) === w.amount)) && !pendingAuto.length;
  if (!same) {
    await del(pendingAuto.concat(mine).map(x => x.id));
    for (const w of want) await ins({ label: w.label, amount: w.amount, created_by: tag(c.assigned_ops) });
  }
  return { ok: true, model: 'electrician', partner: p.name || c.assigned_ops, miles: mi, adder: add, over100: over, noBase, noLoc, changed: !same };
}

// The $50 Professional Bonus was removed 2026-11-04 (per Dennis). These stay as no-ops so older callers don't break.
async function bonus() { return { ok: true, skipped: 'removed' }; }
async function approveBonus() { return { ok: true, skipped: 'removed' }; }
module.exports = { reconcile, bonus, approveBonus, travelAdder, miles, EXCLUDED, BASE, BONUS };
