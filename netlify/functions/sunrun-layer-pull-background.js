// sunrun-layer-pull-background.js
// The "Sunrun layer": existing Sunrun and Vivint Solar installs (Sunrun owns Vivint Solar since Oct 2020)
// as prospects for an AC-coupled battery add-on (meter-collar Powerwall 3 — nothing on the solar system
// is touched, so the installer's consent is not needed).
//
// ⚠️ DELIBERATELY SEPARATE from the orphaned-installer Black Box:
//   - leads carry lead_source = 'sunrun_layer' (never 'orphaned_list'), so every orphaned-list stat, the
//     nightly pipeline phases (owner lookup, Tracerfy), the canvass routes and the dialer exclude them
//     unless the rep turns the Sunrun layer ON in Doors / Dialing.
//   - black_box = true keeps them out of the admin and rep Leads lists, like any other cold lead.
//   - NOTHING here spends skip-trace credits. Phone numbers are bought only when an admin exports the
//     top-scoring leads and pays for them on purpose.
//
// What it does (free sources only):
//   1. PermitStack search for Sunrun / Vivint Solar permits, city by city, rotating through the
//      (brand x city) units across runs (persisted cursor) so each run fits the time budget.
//   2. County assessor roll (parcel_owners, already loaded): owner of record + the parcel's coordinates,
//      so Doors routes work without geocoding.
//   3. Score 0-100 (install era, system size, owner known) so the best homes are worked first.
//
// Manual only (admin button). Writes progress and outcomes to pipeline_state key 'sunrun_layer_status'
// so a dead key / rate limit never looks like "no Sunrun permits found".
//
// POST /.netlify/functions/sunrun-layer-pull-background   body: { max_seconds? }

const { originAllowed } = require('./lib/plaid');
const P = require('./lib/parcel-owner');

const SUPA_REST = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const PS_BASE = 'https://api.permit-stack.com/v1';
const LAYER_SOURCE = 'sunrun_layer';

const BRANDS = [
  { name: 'Sunrun',       names: ['Sunrun Installation Services', 'Sunrun Inc', 'Sunrun'], rx: /sun\s*run/i },
  { name: 'Vivint Solar', names: ['Vivint Solar Developer', 'Vivint Solar', 'Vivint Solar Inc'], rx: /vivint/i }
];
const CITIES = [
  'San Diego', 'Chula Vista', 'El Cajon', 'La Mesa', 'Santee',
  'Escondido', 'Poway', 'Oceanside', 'Carlsbad', 'Encinitas',
  'National City', 'Vista', 'San Marcos', 'Lemon Grove', 'Spring Valley', 'Lakeside'
];


// San Diego County zips (91901-91999, 92003-92199). Contractor-wide permit lists are statewide, so every
// record is filtered to this before it can become a lead.
function sdZip(z) { const n = parseInt(z, 10); return (n >= 91901 && n <= 91999) || (n >= 92003 && n <= 92199); }
function recZip(p) { return String(p.address_zip || p.zip || p.zip_code || p.postal_code || p.zipcode || '').replace(/\D/g, '').slice(0, 5); }
function recInSD(p) {
  const z = recZip(p);
  if (z) return sdZip(z);
  const c = String(p.address_city || p.city || '').trim().toLowerCase();
  return !!c && CITIES.some(x => x.toLowerCase() === c);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const STREET_SUFFIX = {
  LANE: 'LN', ROAD: 'RD', STREET: 'ST', DRIVE: 'DR', AVENUE: 'AVE', COURT: 'CT', PLACE: 'PL',
  BOULEVARD: 'BLVD', CIRCLE: 'CIR', TERRACE: 'TER', TRAIL: 'TRL', PARKWAY: 'PKWY',
  HIGHWAY: 'HWY', SQUARE: 'SQ', WAY: 'WAY', NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W'
};
function normStreet(a) {
  return String(a || '').split(',')[0].toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    .split(' ').map(w => STREET_SUFFIX[w] || w).join(' ');
}
function normZip(a) {
  const m = String(a || '').match(/\b(\d{5})(?:[-.]\d+)?\b(?![\s\S]*\b\d{5}\b)/);
  return m ? m[1] : '';
}
function normAddr(a) {
  const st = normStreet(a);
  return st ? st + '|' + normZip(a) : '';
}
function extractKw(text) {
  const m = String(text || '').match(/(\d+\.?\d*)\s*k[Ww]/);
  return m ? parseFloat(m[1]) : null;
}

// 0-100. Install era (NEM 1.0/2.0 homes keep a rate worth protecting; 2023+ is NEM 3.0), system size
// (a big system on an ordinary home is likely net-positive — the profile SDCP's program is built for),
// and whether the county roll gave us the owner. SDCP-zip boost is applied client-side at export time.
function scoreLead(rec, ownerKnown) {
  let s = 0;
  const y = rec.install_year;
  s += !y ? 10 : (y >= 2013 && y <= 2022) ? 30 : (y >= 2010 && y < 2013) ? 15 : y > 2022 ? 5 : 8;
  const kw = rec.system_size;
  s += !kw ? 10 : kw >= 8 ? 35 : kw >= 6 ? 25 : kw >= 4 ? 15 : 5;
  if (ownerKnown) s += 10;
  return Math.min(100, s);
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  // Netlify's own cron invocation carries { next_run } in the body and no browser origin.
  let _sched = false;
  try { _sched = !!JSON.parse(event.body || '{}').next_run; } catch (e) {}
  if (!_sched && !originAllowed(event)) return { statusCode: 403, body: 'Forbidden' };

  const key = process.env.SUPA_SERVICE_KEY;
  const psKey = process.env.PERMITSTACK_KEY;
  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  let req = {};
  try { req = JSON.parse(event.body || '{}'); } catch (e) {}
  const deadline = Date.now() + Math.min(Math.max(parseInt(req.max_seconds, 10) || 720, 20), 780) * 1000;

  const status = { started_at: new Date().toISOString(), finished_at: null, running: true,
    inserted: 0, scanned: 0, skipped_dupe: 0, skipped_other: 0, with_owner: 0, with_coords: 0,
    units_covered: 0, units_total: BRANDS.length * CITIES.length, outcomes: {}, error: null };
  const tally = r => { status.outcomes[r] = (status.outcomes[r] || 0) + 1; };
  async function writeState(k, v) {
    try {
      await fetch(SUPA_REST + '/pipeline_state', {
        method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: k, value: typeof v === 'string' ? v : JSON.stringify(v), updated_at: new Date().toISOString() })
      });
    } catch (e) { console.error('[sunrun-layer] state write failed', k, e.message); }
  }
  async function finish(err) {
    status.running = false; status.finished_at = new Date().toISOString(); if (err) status.error = err;
    await writeState('sunrun_layer_status', status);
    return { statusCode: 200, body: JSON.stringify(status) };
  }

  if (!key) return finish('SUPA_SERVICE_KEY not set');
  if (!psKey) return finish('PERMITSTACK_KEY not set in Netlify — no permits can be pulled');
  await writeState('sunrun_layer_status', status);

  try {
    // Every existing customer's street+zip, so a Sunrun home that is already a lead or a customer is never duplicated.
    const existing = new Set();
    for (let off = 0; ; off += 1000) {
      if (Date.now() > deadline) break;
      const r = await fetch(SUPA_REST + '/customers?select=address&order=id.asc&limit=1000&offset=' + off, { headers });
      if (!r.ok) { tally('existing_http_' + r.status); break; }
      const rows = await r.json();
      rows.forEach(x => { const k = normAddr(x.address); if (k) existing.add(k); });
      if (rows.length < 1000) break;
    }

    // Rotation cursor over (brand x city) units.
    let cursor = 0;
    try {
      const r = await fetch(SUPA_REST + '/pipeline_state?key=eq.sunrun_layer_cursor&select=value&limit=1', { headers });
      const rows = r.ok ? await r.json() : [];
      cursor = rows.length ? (parseInt(rows[0].value, 10) || 0) : 0;
    } catch (e) {}
    const units = [];
    BRANDS.forEach(b => CITIES.forEach(c => units.push({ brand: b, city: c })));
    const start = cursor % units.length;
    const psHeaders = { 'X-API-Key': psKey, Accept: 'application/json' };
    const seen = new Set();
    const thisYear = new Date().getFullYear();

  async function processBatch(batch, brand, city, trusted) {
    const cands = [];
    for (const p of batch) {
      status.scanned++;
      // The keyword search is fuzzy — only keep permits that really name the brand somewhere.
      if (!trusted && !brand.rx.test(JSON.stringify(p))) { status.skipped_other++; continue; }
      const street = String(p.address_street || p.street_address || p.address || p.site_address || p.property_address || '').split(',')[0].trim();
      if (!street || !/^\d/.test(street) || street.split(/\s+/).length < 2) { status.skipped_other++; continue; }
      const zip = String(p.address_zip || p.zip || p.zip_code || p.postal_code || p.zipcode || '').replace(/\D/g, '').slice(0, 5);
      const full = [street, String(p.address_city || p.city || city || 'San Diego').trim(), 'CA', zip].filter(Boolean).join(', ');
      const k = normAddr(full);
      if (!k) { status.skipped_other++; continue; }
      if (seen.has(k) || existing.has(k)) { status.skipped_dupe++; continue; }
      const rawDate = p.issue_date || p.issued_date || p.permit_date || p.filed_date || '';
      const yr = rawDate ? (new Date(rawDate).getFullYear() || null) : null;
      const kw = extractKw(p.work_description || p.description || p.scope_of_work || '');
      if (yr && (yr < 2005 || yr > thisYear)) { status.skipped_other++; continue; }
      if (kw != null && (kw < 0.5 || kw > 100)) { status.skipped_other++; continue; }
      seen.add(k);
      cands.push({
        address: full, lead_category: 'fixmy', step: 1,
        lead_source: LAYER_SOURCE, black_box: true,
        original_installer: brand.name, install_year: yr || null,
        system_size: kw ? String(kw) : null,
        notes: brand.name + (kw ? ' · ' + kw + 'kW' : '') + (yr ? ' · Installed ' + yr : '')
      });
    }

    // Owner of record + parcel coordinates from the county roll (free), 10 at a time.
    for (let i = 0; i < cands.length; i += 10) {
      await Promise.all(cands.slice(i, i + 10).map(async rec => {
        let hit = null;
        try { hit = await P.lookup(rec.address); } catch (e) { tally('roll_err'); }
        if (hit && hit.owner) { rec.title_owner = hit.owner; status.with_owner++; }
        if (hit && hit.x != null && hit.y != null && hit.x > -117.7 && hit.x < -116.0 && hit.y > 32.4 && hit.y < 33.6) {
          rec.lng = hit.x; rec.lat = hit.y; status.with_coords++;
        }
        rec.lead_score = scoreLead(rec, !!(hit && hit.owner));
      }));
    }

    if (cands.length) {
      for (let i = 0; i < cands.length; i += 100) {
        const chunk = cands.slice(i, i + 100);
        const ins = await fetch(SUPA_REST + '/customers', {
          method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(chunk)
        });
        if (ins.ok) { status.inserted += chunk.length; chunk.forEach(r => existing.add(normAddr(r.address))); }
        else { tally('insert_http_' + ins.status); console.error('[sunrun-layer] insert failed', ins.status, (await ins.text()).slice(0, 300)); }
      }
    }
  }


    async function psGet(path) {
      try {
        const r = await fetch(PS_BASE + path, { headers: psHeaders, signal: AbortSignal.timeout(12000) });
        if (!r.ok) { tally('http_' + r.status); return { status: r.status }; }
        return { status: 200, body: await r.json() };
      } catch (e) { tally(e && e.name === 'TimeoutError' ? 'timeout' : 'net_error'); return { status: 0, error: e.message }; }
    }
    function listOf(b) { return (b && (b.permits || b.results || b.data || b.contractors)) || []; }

    // Diagnostic: shows what PermitStack really calls these contractors and how many permits each query
    // returns, so the search terms can be tuned from real data instead of guessed.
    async function probe() {
      const out = { at: new Date().toISOString(), keyword: [], contractors: [], samples: [] };
      const terms = ['Sunrun', 'SUNRUN INC', 'Sunrun Installation Services', 'Sun Run', 'Vivint Solar', 'Vivint Solar Developer', 'VIVINT'];
      for (const t of terms) {
        for (const city of ['San Diego', 'Escondido', 'Oceanside']) {
          const r = await psGet('/permits/search?city=' + encodeURIComponent(city) + '&keyword=' + encodeURIComponent(t) + '&per_page=5&page=1');
          const arr = listOf(r.body);
          out.keyword.push(t + ' @ ' + city + ': ' + (r.status === 200 ? arr.length + ' results' : 'HTTP ' + r.status));
          if (arr.length && out.samples.length < 3) {
            const x = arr[0];
            out.samples.push({ term: t, city, keys: Object.keys(x), contractorFields: Object.keys(x).filter(k => /contract|licen|applic|business|company/i.test(k)).reduce((m, k) => (m[k] = String(x[k]).slice(0, 80), m), {}),
              addr: [x.address_street || x.address, x.address_city || x.city, x.address_zip || x.zip].join(' | ') });
          }
        }
        const c = await psGet('/contractors/search?name=' + encodeURIComponent(t) + '&per_page=10');
        const carr = listOf(c.body);
        out.contractors.push(t + ': ' + (c.status === 200 ? carr.length + ' contractors' : 'HTTP ' + c.status)
          + (carr.length ? ' → ' + carr.slice(0, 6).map(x => (x.name || x.business_name || x.company || '?') + ' [id ' + (x.id || x.contractor_id) + (x.permit_count != null ? ', ' + x.permit_count + ' permits' : '') + ']').join('; ') : ''));
        await sleep(150);
      }
      out.outcomes = status.outcomes;
      await writeState('sunrun_layer_probe', out);
      return out;
    }

    // Contractor-wide pass: find the contractor records PermitStack holds for each brand, then walk their
    // permit lists page by page (statewide), keeping only San Diego County. A per-contractor page cursor
    // is saved so every night continues where the last run stopped.
    async function contractorPass() {
      let pages = {};
      try {
        const r = await fetch(SUPA_REST + '/pipeline_state?key=eq.sunrun_layer_contractor_pages&select=value&limit=1', { headers });
        const rows = r.ok ? await r.json() : [];
        if (rows.length) pages = JSON.parse(rows[0].value) || {};
      } catch (e) {}
      const found = {};
      for (const brand of BRANDS) {
        for (const name of brand.names) {
          if (Date.now() > deadline) break;
          const c = await psGet('/contractors/search?name=' + encodeURIComponent(name) + '&per_page=20');
          if (c.status !== 200) continue;
          listOf(c.body).forEach(x => {
            const id = x.id || x.contractor_id;
            if (id && brand.rx.test(JSON.stringify(x))) found[id] = brand;
          });
        }
      }
      status.contractors_found = Object.keys(found).length;
      for (const id of Object.keys(found)) {
        const brand = found[id];
        const st = pages[id] || { page: 1 };
        if (st.done_at && Date.now() - new Date(st.done_at).getTime() < 7 * 86400000) continue;
        let page = st.done_at ? 1 : (st.page || 1);
        while (Date.now() < deadline && page <= 400) {
          const r = await psGet('/contractors/' + encodeURIComponent(id) + '/permits?per_page=100&page=' + page);
          if (r.status !== 200) { if (r.status === 429) await sleep(2000); break; }
          const batch = listOf(r.body);
          if (!Array.isArray(batch) || !batch.length) { pages[id] = { page, done_at: new Date().toISOString() }; tally('c_end'); break; }
          tally('c_ok');
          status.c_scanned = (status.c_scanned || 0) + batch.length;
          const sd = batch.filter(recInSD);
          if (sd.length) await processBatch(sd, brand, 'San Diego', true);
          if (batch.length < 100) { pages[id] = { page, done_at: new Date().toISOString() }; break; }
          page++;
          pages[id] = { page };
          if (page % 5 === 0) { await writeState('sunrun_layer_contractor_pages', pages); await writeState('sunrun_layer_status', status); }
          await sleep(60);
        }
      }
      await writeState('sunrun_layer_contractor_pages', pages);
    }

    if (req.probe) { const pr = await probe(); status.running = false; status.finished_at = new Date().toISOString(); await writeState('sunrun_layer_status', status); return { statusCode: 200, body: JSON.stringify(pr) }; }
    for (let u = 0; u < units.length; u++) {
      if (Date.now() > deadline) break;
      const { brand, city } = units[(start + u) % units.length];
      for (const qname of brand.names) {
        if (Date.now() > deadline) break;
        for (let page = 1; page <= 30; page++) {
          if (Date.now() > deadline) break;
          let resp;
          try {
            resp = await fetch(PS_BASE + '/permits/search?city=' + encodeURIComponent(city) + '&keyword=' + encodeURIComponent(qname) + '&per_page=100&page=' + page,
              { headers: psHeaders, signal: AbortSignal.timeout(10000) });
          } catch (e) { tally(e && e.name === 'TimeoutError' ? 'timeout' : 'net_error'); break; }
          if (!resp.ok) { tally('http_' + resp.status); if (resp.status === 429) await sleep(2000); break; }
          let body;
          try { body = await resp.json(); } catch (e) { tally('bad_json'); break; }
          const batch = body.permits || body.results || body.data || [];
          if (!Array.isArray(batch)) { tally('unexpected_shape'); break; }
          if (!batch.length) { tally(page === 1 ? 'empty' : 'end_of_pages'); break; }
          tally('ok');

          await processBatch(batch, brand, city);
          if (batch.length < 100) break;
          await sleep(80);
        }
      }
      status.units_covered++;
      await writeState('sunrun_layer_status', status);
    }

    try { await contractorPass(); } catch (e) { tally('contractor_pass_err'); console.error('[sunrun-layer] contractor pass', e.message); }
    await writeState('sunrun_layer_cursor', String((start + status.units_covered) % units.length));
    return finish(null);
  } catch (e) {
    console.error('[sunrun-layer] failed', e);
    return finish(e.message);
  }
};
