// Install-partner scorecard (2026-11-05, per Dennis). Stores a checklist per candidate installer in
// pipeline_state key 'partner_scorecard' (no migration). Origin-allowlisted; service-role writes.
// Nothing is pre-checked: every item starts UNVERIFIED and only a person marks it verified.
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
const KEY = 'partner_scorecard';
const CHECKS = [
  ['license', 'Utah contractor license active (dopl.utah.gov) and class covers batteries'],
  ['tesla', 'Tesla Powerwall certified installer (Tesla locator)'],
  ['bbb', 'BBB / court records / news checked, no red flags'],
  ['insurance', 'Liability + workers comp certificate received'],
  ['terms', 'Agrees 50% at sale / 50% at completion + gross-commission split'],
  ['w9', 'W-9 on file'],
  ['hb57', 'Utah HB 57 retailer registration question answered (who must register)'],
  ['reference', 'Two recent customer references called']
];
const SEED = [
  { id: 'smart-wave', name: 'Smart Wave Solar', city: 'Bluffdale', note: 'Self-claims Premier Powerwall 3; unverified' },
  { id: 'greenify', name: 'Greenify Energy Savers', city: 'Sandy/Draper', note: '~22 reviews; license record looked inconsistent' },
  { id: 'intermountain', name: 'Intermountain Wind & Solar', city: 'Centerville', note: 'Installs Powerwall; ask about dealer deal' },
  { id: 'byop', name: 'BYOP Electric', city: 'Salt Lake area', note: 'Small, master-electrician-led; backup' }
];
exports.handler = async function (event) {
  const origin = (event.headers || {}).origin || '';
  const cors = { 'Access-Control-Allow-Origin': OK.indexOf(origin) > -1 ? origin : OK[0], 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const J = (c, o) => ({ statusCode: c, headers: cors, body: JSON.stringify(o) });
  if (OK.indexOf(origin) < 0 && !/\.netlify\.app$/.test(origin.replace(/^https?:\/\//, ''))) return J(403, { error: 'forbidden' });
  const k = process.env.SUPA_SERVICE_KEY; if (!k) return J(500, { error: 'no_key' });
  const H = { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' };
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'bad_json' }); }
  async function load() {
    const r = await fetch(SB + '/pipeline_state?key=eq.' + KEY + '&select=value', { headers: H });
    const rows = r.ok ? await r.json() : [];
    let v = rows[0] && rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    return v && Array.isArray(v.partners) ? v : { partners: SEED.map(s => Object.assign({ checks: {}, status: 'candidate' }, s)) };
  }
  async function save(v) {
    const r = await fetch(SB + '/pipeline_state', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates' }, H), body: JSON.stringify({ key: KEY, value: JSON.stringify(v), updated_at: new Date().toISOString() }) });
    return r.ok;
  }
  try {
    const v = await load();
    if (b.action === 'list') return J(200, { ok: true, checks: CHECKS, partners: v.partners });
    if (b.action === 'check') {
      const p = v.partners.find(x => x.id === b.id); if (!p) return J(404, { error: 'not_found' });
      if (!CHECKS.some(c => c[0] === b.item)) return J(400, { error: 'bad_item' });
      p.checks = p.checks || {};
      if (b.value) p.checks[b.item] = { at: new Date().toISOString(), by: String(b.by || '').slice(0, 40) }; else delete p.checks[b.item];
      if (!(await save(v))) return J(500, { error: 'save_failed' });
      return J(200, { ok: true, partners: v.partners });
    }
    if (b.action === 'note' || b.action === 'status') {
      const p = v.partners.find(x => x.id === b.id); if (!p) return J(404, { error: 'not_found' });
      if (b.action === 'note') p.note = String(b.note || '').slice(0, 300);
      else if (['candidate', 'contacted', 'approved', 'rejected'].indexOf(b.status) > -1) p.status = b.status; else return J(400, { error: 'bad_status' });
      if (!(await save(v))) return J(500, { error: 'save_failed' });
      return J(200, { ok: true, partners: v.partners });
    }
    if (b.action === 'add') {
      const name = String(b.name || '').trim().slice(0, 80); if (!name) return J(400, { error: 'name_required' });
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ('p' + Date.now());
      if (v.partners.some(x => x.id === id)) return J(409, { error: 'exists' });
      v.partners.push({ id, name, city: String(b.city || '').slice(0, 60), note: '', checks: {}, status: 'candidate' });
      if (!(await save(v))) return J(500, { error: 'save_failed' });
      return J(200, { ok: true, partners: v.partners });
    }
    return J(400, { error: 'unknown_action' });
  } catch (e) { return J(500, { error: e.message }); }
};
