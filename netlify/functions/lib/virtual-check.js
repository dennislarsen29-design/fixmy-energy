// Virtual vs Local evaluation (2026-10-23, per Dennis): a lead 50+ miles from EVERY active Tech's home base
// is flagged 'virtual' (self-service evaluation with Quoya + remote assist). Electricians do not count.
// Never overrides a manual choice (eval_mode_manual), never throws into a booking, and an address that
// can't be located stays Local with distance unknown (never guessed Virtual).
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const VIRTUAL_MI = 50;
function heads() { const k = process.env.SUPA_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPA_KEY; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }
function miles(a, b, c, d) { const R = 3958.8, r = x => x * Math.PI / 180, dLa = r(c - a), dLo = r(d - b); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
async function geocode(address, doFetch) {
  try {
    const r = await doFetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=' + encodeURIComponent(address) + '&benchmark=Public_AR_Current&format=json');
    if (!r.ok) return null; const j = await r.json(); const m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
    return m && m.coordinates ? { lat: m.coordinates.y, lng: m.coordinates.x } : null;
  } catch (e) { return null; }
}
async function check(customerId, doFetch) {
  doFetch = doFetch || fetch;
  try {
    const cr = await doFetch(SUPA_URL + '/rest/v1/customers?select=id,address,lat,lng,eval_mode,eval_mode_manual,lead_category&id=eq.' + customerId, { headers: heads() });
    const c = ((await cr.json()) || [])[0]; if (!c) return { ok: false, reason: 'no_customer' };
    if (c.eval_mode_manual) return { ok: true, skipped: 'manual', mode: c.eval_mode };
    let lat = parseFloat(c.lat), lng = parseFloat(c.lng);
    if (!isFinite(lat) || !isFinite(lng)) { const g = await geocode(c.address || '', doFetch); if (!g) return { ok: true, skipped: 'no_location' }; lat = g.lat; lng = g.lng; }
    const tr = await doFetch(SUPA_URL + '/rest/v1/team_members?select=id,name,home_lat,home_lng&active=eq.true&role=eq.tech&home_lat=not.is.null', { headers: heads() });
    const techs = (await tr.json()) || [];
    if (!techs.length) return { ok: true, skipped: 'no_tech_bases' };
    let best = null; techs.forEach(t => { const d = miles(lat, lng, parseFloat(t.home_lat), parseFloat(t.home_lng)); if (best == null || d < best) best = d; });
    const mode = best >= VIRTUAL_MI ? 'virtual' : 'local';
    await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + customerId + '&eval_mode_manual=is.false', { method: 'PATCH', headers: heads(), body: JSON.stringify({ eval_mode: mode, eval_distance_mi: Math.round(best * 10) / 10 }) });
    return { ok: true, mode, miles: Math.round(best * 10) / 10 };
  } catch (e) { console.warn('virtual-check', e.message); return { ok: false, reason: 'error' }; }
}
// Pre-booking check for the public /book page: no customer row yet, just an address (or the lat/lng Google
// Places already gave the browser). Same rule as check(): 50+ miles from EVERY active Tech base. An address
// that can't be located is NOT guessed virtual -- it returns virtual:null and the page stays in-person.
async function checkPoint(input, doFetch) {
  doFetch = doFetch || fetch;
  try {
    let lat = parseFloat(input && input.lat), lng = parseFloat(input && input.lng);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      const addr = String((input && input.address) || '').slice(0, 200);
      if (addr.length < 8) return { ok: true, virtual: null, reason: 'no_location' };
      const g = await geocode(addr, doFetch); if (!g) return { ok: true, virtual: null, reason: 'no_location' };
      lat = g.lat; lng = g.lng;
    }
    const tr = await doFetch(SUPA_URL + '/rest/v1/team_members?select=id,home_lat,home_lng&active=eq.true&role=eq.tech&home_lat=not.is.null', { headers: heads() });
    const techs = (await tr.json()) || [];
    if (!Array.isArray(techs) || !techs.length) return { ok: true, virtual: null, reason: 'no_tech_bases' };
    let best = null; techs.forEach(t => { const d = miles(lat, lng, parseFloat(t.home_lat), parseFloat(t.home_lng)); if (isFinite(d) && (best == null || d < best)) best = d; });
    if (best == null) return { ok: true, virtual: null, reason: 'no_tech_bases' };
    return { ok: true, virtual: best >= VIRTUAL_MI, miles: Math.round(best) };
  } catch (e) { console.warn('virtual-check point', e.message); return { ok: false, virtual: null, reason: 'error' }; }
}
module.exports = { check, checkPoint, miles, VIRTUAL_MI };
