// Business listings checklist (Agents tab -> PR & Backlinks -> Listings). Origin-allowlisted; service-role
// writes to pipeline_state 'business_listings'. Never signs up or submits anything to a directory.
const L = require('./lib/listings');
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
const NAP_FIELDS = ['name', 'phone', 'website', 'email', 'address_mode', 'address', 'service_area', 'category', 'categories_extra', 'hours', 'description'];

exports.handler = async function (event) {
  const origin = (event.headers || {}).origin || '';
  const cors = { 'Access-Control-Allow-Origin': OK.indexOf(origin) > -1 ? origin : OK[0], 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const J = (c, o) => ({ statusCode: c, headers: cors, body: JSON.stringify(o) });
  if (OK.indexOf(origin) < 0 && !/\.netlify\.app$/.test(origin.replace(/^https?:\/\//, ''))) return J(403, { error: 'forbidden' });
  const k = process.env.SUPA_SERVICE_KEY; if (!k) return J(500, { error: 'no_key' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'bad_json' }); }
  try {
    const v = await L.load(k);
    const out = () => J(200, { ok: true, nap: v.nap, items: v.items, statuses: L.STATUSES });
    if (b.action === 'list') return out();

    if (b.action === 'save_nap') {
      const n = b.nap || {};
      NAP_FIELDS.forEach(function (f) { if (n[f] !== undefined) v.nap[f] = String(n[f]).slice(0, f === 'description' ? 750 : 300).trim(); });
      if (['hidden', 'shown'].indexOf(v.nap.address_mode) < 0) v.nap.address_mode = 'hidden';
      if (String(v.nap.phone || '').replace(/\D/g, '').length < 10) return J(400, { error: 'phone_invalid' });
      v.nap.confirmed = true; v.nap.confirmed_at = new Date().toISOString(); v.nap.confirmed_by = String(b.by || '').slice(0, 40);
      if (!(await L.save(k, v))) return J(500, { error: 'save_failed' });
      return out();
    }

    if (b.action === 'update') {
      const it = v.items.find(x => x.id === b.id); if (!it) return J(404, { error: 'not_found' });
      if (b.status !== undefined) { if (L.STATUSES.indexOf(b.status) < 0) return J(400, { error: 'bad_status' }); it.status = b.status; it.status_at = new Date().toISOString(); }
      if (b.listing_url !== undefined) {
        const u = String(b.listing_url || '').trim();
        if (u && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(u)) return J(400, { error: 'bad_url' });
        it.listing_url = u; it.check = null;
      }
      if (b.note !== undefined) it.my_note = String(b.note || '').slice(0, 300);
      if (!(await L.save(k, v))) return J(500, { error: 'save_failed' });
      return out();
    }

    if (b.action === 'add') {
      const name = String(b.name || '').trim().slice(0, 80); if (!name) return J(400, { error: 'name_required' });
      const url = String(b.url || '').trim();
      if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) return J(400, { error: 'bad_url' });
      const id = 'c-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now());
      if (v.items.some(x => x.id === id)) return J(409, { error: 'exists' });
      v.items.push({ id, name, url, group: 'local', cost: String(b.cost || 'free'), verify: '', note: 'Added by hand.', status: 'not_started', listing_url: '', check: null, custom: true });
      if (!(await L.save(k, v))) return J(500, { error: 'save_failed' });
      return out();
    }

    if (b.action === 'remove') {
      const i = v.items.findIndex(x => x.id === b.id && x.custom); if (i < 0) return J(400, { error: 'only_custom_removable' });
      v.items.splice(i, 1);
      if (!(await L.save(k, v))) return J(500, { error: 'save_failed' });
      return out();
    }

    if (b.action === 'check') {
      const targets = v.items.filter(x => x.listing_url && (!b.id || x.id === b.id)).slice(0, 25);
      for (let i = 0; i < targets.length; i += 5) {
        const res = await Promise.all(targets.slice(i, i + 5).map(x => L.checkItem(x, v.nap).catch(() => ({ result: 'unreachable', at: new Date().toISOString() }))));
        res.forEach((c, j) => L.mergeCheck(targets[i + j], c));
      }
      if (!(await L.save(k, v))) return J(500, { error: 'save_failed' });
      return out();
    }
    return J(400, { error: 'unknown_action' });
  } catch (e) { return J(500, { error: e.message }); }
};
