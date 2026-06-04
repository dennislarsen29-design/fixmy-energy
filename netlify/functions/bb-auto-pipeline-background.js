// bb-auto-pipeline-background.js
// Automated Black Box nightly pipeline — runs as a Netlify background function (15-min budget).
//
// Phase 1: Pull permits from all 16 defunct installers via Socrata open data, insert new leads.
// Phase 2: SANDAG / Regrid owner lookup for all leads missing title_owner (up to 2000 per run).
// Phase 3: Submit all no-contact leads to Tracerfy skip-trace, poll up to 4 min, apply results.
//
// Scheduled nightly at 9am UTC (2am PDT) via netlify.toml.
// Also callable manually via POST /.netlify/functions/bb-auto-pipeline-background

const SUPA_URL  = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

const INSTALLERS = [
  { name: 'Sullivan Solar',        names: ['Sullivan Solar Power', 'Sullivan Solar Power of California', 'Sullivan Solar'] },
  { name: 'SunPower',              names: ['Complete Solar Inc', 'BRS Field Ops', 'SunPower Corporation', 'SunPower'] },
  { name: 'Titan Solar',           names: ['Titan Solar Power', 'Titan Solar'] },
  { name: 'Sunnova',               names: ['Sunnova Energy International', 'Sunnova Energy', 'Sunnova'] },
  { name: 'Freedom Forever',       names: ['Freedom Forever LLC', 'Freedom Forever'] },
  { name: 'Petersen Dean',         names: ['Petersen-Dean', 'Petersen Dean', 'Red Rose Inc', 'PetersenDean'] },
  { name: 'Sungevity',             names: ['Sungevity Inc', 'Horizon Solar Power', 'Solar Spectrum', 'Sungevity'] },
  { name: 'Mosaic Solar Loans',    names: ['Mosaic Solar Loans', 'Mosaic'] },
  { name: 'ADT Solar',             names: ['ADT Solar LLC', 'ADT Solar'] },
  { name: 'RGS Energy',            names: ['Real Goods Solar Inc', 'RGS Energy', 'Alteris Renewables'] },
  { name: 'Pink Energy',           names: ['Pink Energy', 'Power Home Solar'] },
  { name: 'Vision Solar',          names: ['Vision Solar'] },
  { name: 'Verengo Solar',         names: ['Verengo Inc', 'Verengo Solar', 'Verengo'] },
  { name: 'American Solar Direct', names: ['American Solar Direct Inc', 'American Solar Direct'] },
  { name: 'Kota Energy',           names: ['Kota Energy Group LLC', 'Kota Energy Group', 'Kota Energy'] },
  { name: 'OneRoof Energy',        names: ['OneRoof Energy Inc', 'OneRoof Energy'] }
];

const BASE_SD_CITY = 'https://data.sandiego.gov/resource/nt65-c7a7.json';
const BASE_SD_CTY  = 'https://data.sandiegocounty.gov/resource/dyzh-7eat.json';

const TARGET_CITIES = new Set([
  'SAN DIEGO','CHULA VISTA','EL CAJON','SANTEE','LA MESA','LEMON GROVE',
  'NATIONAL CITY','POWAY','LAKESIDE','SPRING VALLEY','RAMONA','ESCONDIDO','VISTA',
  'CARLSBAD','OCEANSIDE','ENCINITAS','DEL MAR','SOLANA BEACH','CORONADO','IMPERIAL BEACH',
  'ALPINE','BONITA','CAMPO','DESCANSO','DULZURA','JAMUL','PINE VALLEY','POTRERO',
  'RANCHO SANTA FE','SAN MARCOS','VALLEY CENTER',
  'SAN CLEMENTE','DANA POINT','LAGUNA BEACH','LAGUNA NIGUEL','LAGUNA HILLS',
  'ALISO VIEJO','LAGUNA WOODS','MISSION VIEJO'
]);
const OC_ZIPS = new Set(['92629','92651','92652','92653','92656','92672','92673','92677','92618']);

exports.handler = async function(event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const supaKey = process.env.SUPA_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };

  const supaHeaders = {
    'Content-Type': 'application/json',
    'apikey': supaKey,
    'Authorization': 'Bearer ' + supaKey,
    'Prefer': 'return=minimal'
  };

  // ── Run-limit gate ────────────────────────────────────────────────────────
  // Reads bb_pipeline_runs_remaining from Supabase pipeline_state table.
  // Decrements on each run; stops when it hits 0.
  // To re-enable: UPDATE pipeline_state SET value='3' WHERE key='bb_pipeline_runs_remaining';
  // Manual HTTP trigger bypasses this check (use for ad-hoc runs).
  const isScheduled = !event.httpMethod; // Netlify cron events have no httpMethod
  if (isScheduled) {
    try {
      const stateResp = await fetch(
        SUPA_REST + "/pipeline_state?key=eq.bb_pipeline_runs_remaining&select=value",
        { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey, Accept: 'application/json' } }
      );
      const stateRows = stateResp.ok ? await stateResp.json() : [];
      const remaining = Array.isArray(stateRows) && stateRows.length ? parseInt(stateRows[0].value, 10) : 0;
      if (remaining <= 0) {
        console.log('bb-auto-pipeline: auto-disabled (runs_remaining=0). Update pipeline_state to re-enable.');
        return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'disabled', message: 'runs_remaining=0 — update pipeline_state to re-enable' }) };
      }
      // Decrement before running so a crash doesn't silently repeat
      await fetch(
        SUPA_REST + "/pipeline_state?key=eq.bb_pipeline_runs_remaining",
        {
          method: 'PATCH',
          headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ value: String(remaining - 1), updated_at: new Date().toISOString() })
        }
      );
      console.log(`bb-auto-pipeline: run ${remaining} of 3 starting (${remaining - 1} remaining after this)`);
    } catch(e) {
      console.log('bb-auto-pipeline: could not read run limit — proceeding anyway:', e.message);
    }
  }

  const log = [];
  function stamp(msg) {
    const ts = new Date().toISOString().slice(11, 19);
    const line = '[' + ts + '] ' + msg;
    log.push(line);
    console.log(line);
  }

  // 13.5 min global hard stop (Netlify background limit is 15 min)
  const GLOBAL_DEADLINE = Date.now() + (13.5 * 60 * 1000);
  function overGlobal() { return Date.now() > GLOBAL_DEADLINE; }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function fetchWithTimeout(url, opts, ms) {
    const remaining = GLOBAL_DEADLINE - Date.now();
    const timeoutMs = Math.min(ms || 8000, Math.max(remaining - 500, 500));
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, { ...(opts || {}), signal: ctrl.signal }).finally(() => clearTimeout(tid));
  }

  // ── Helpers shared with permitstack-pull.js ────────────────────────────────

  function isTarget(street, city, state, zip) {
    const z = String(zip || '');
    const c = String(city || '').toUpperCase().trim();
    const s = String(state || '').toUpperCase().trim();
    if (s && s !== 'CA') return false;
    if (/^919\d{2}$/.test(z)) return true;
    if (/^92[012]\d{2}$/.test(z)) return true;
    if (OC_ZIPS.has(z.slice(0, 5))) return true;
    if (TARGET_CITIES.has(c)) return true;
    const combined = (street + ' ' + city + ' ' + state + ' ' + zip).toUpperCase();
    for (const t of TARGET_CITIES) { if (combined.includes(t)) return true; }
    return false;
  }

  function extractKw(text) {
    if (!text) return null;
    const m = text.match(/(\d+\.?\d*)\s*k[Ww]/);
    return m ? parseFloat(m[1]) : null;
  }

  function extractSocrataAddress(p, defaultCity) {
    const num   = String(p.address_number || p.address_number_start || p.street_number || '').trim();
    const dir   = String(p.address_direction || p.address_street_direction || p.direction || '').trim();
    const sname = String(p.address_street_name || p.street_name || '').trim();
    const sfx   = String(p.address_sfx || p.address_street_type || p.street_type || p.address_suffix || '').trim();
    const street = [num, dir, sname, sfx].filter(Boolean).join(' ')
      || String(p.street_address || p.address || p.site_address || p.property_address || '').split(',')[0].trim();
    const city   = String(p.address_city || p.city || defaultCity || 'San Diego').trim();
    const state  = 'CA';
    const zip    = String(p.address_zip || p.zipcode || p.zip_code || p.zip || '').replace(/\D/g, '').slice(0, 5);
    const full   = [street, city, state, zip].filter(Boolean).join(', ');
    const rawDate = p.date_issued || p.issue_date || p.issued_date || p.applied_date || '';
    const installYear = rawDate ? new Date(rawDate).getFullYear() : null;
    const desc = p.work_description || p.project_description || p.description || p.scope_of_work || '';
    return { street, city, state, zip, fullAddress: full, installYear, systemSizeKw: extractKw(desc) };
  }

  function normAddr(a) { return String(a || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // Returns false if the permit record has invalid address, system size, or install year.
  function qualifyPermit(rec) {
    const street = (rec.address || '').split(',')[0].trim();
    if (!street || !/^\d/.test(street)) return false;
    if (street.split(/\s+/).length < 2) return false;
    if (rec.system_size != null && (rec.system_size < 0.5 || rec.system_size > 100)) return false;
    const yr = rec.install_year;
    if (yr != null && (yr < 2005 || yr > new Date().getFullYear())) return false;
    return true;
  }

  // 0–100 lead quality score based on system age and installer risk tier.
  function calcLeadScore(rec) {
    let score = 0;
    const yr = rec.install_year;
    if (yr) {
      const age = new Date().getFullYear() - yr;
      score += age >= 10 ? 40 : age >= 8 ? 30 : age >= 6 ? 20 : 10;
    }
    const riskMap = {
      'SunPower': 15, 'Titan Solar': 15, 'Sullivan Solar': 12,
      'Freedom Forever': 12, 'Sunnova': 10, 'Petersen Dean': 10,
      'Pink Energy': 10, 'Vision Solar': 10
    };
    score += riskMap[rec.original_installer] || 8;
    if (rec.system_size) score += 5;
    return Math.min(score, 100);
  }

  // 0–10 address completeness score — used to gate SANDAG and Tracerfy submissions.
  function addressQualityScore(address) {
    if (!address) return 0;
    let score = 0;
    const parts = address.split(',');
    const street = (parts[0] || '').trim();
    if (/^\d+/.test(street)) score += 3;
    if (street.split(/\s+/).length >= 3) score += 2;
    if (parts.length >= 3) score += 2;
    if (/\b\d{5}\b/.test(address)) score += 2;
    if (address.length > 20) score += 1;
    return score;
  }

  // ── Supabase helpers ───────────────────────────────────────────────────────

  async function supaFetch(path, opts) {
    try {
      const resp = await fetchWithTimeout(SUPA_REST + path, { headers: supaHeaders, ...opts }, 12000);
      const text = await resp.text();
      const data = text ? JSON.parse(text) : null;
      return { ok: resp.ok, status: resp.status, data };
    } catch(e) {
      return { ok: false, status: 0, data: null, err: e.message };
    }
  }

  async function supaInsertBatch(rows) {
    if (!rows.length) return true;
    const resp = await fetchWithTimeout(SUPA_REST + '/customers', {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify(rows)
    }, 20000);
    return resp.ok;
  }

  async function supaUpdate(id, updates) {
    const resp = await fetchWithTimeout(SUPA_REST + '/customers?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: supaHeaders,
      body: JSON.stringify(updates)
    }, 8000);
    return resp.ok;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — PERMIT PULL
  // Pull all 16 installers, insert records not already in Supabase
  // ══════════════════════════════════════════════════════════════════════════
  stamp('=== Phase 1: Permit pull ===');

  // Load all existing addresses into a Set for O(1) dedup
  stamp('Loading existing addresses...');
  const existingAddrs = new Set();
  let addrOffset = 0;
  while (true) {
    if (overGlobal()) break;
    const r = await supaFetch(`/customers?lead_source=eq.orphaned_list&select=address&limit=1000&offset=${addrOffset}`);
    if (!r.ok || !Array.isArray(r.data) || !r.data.length) break;
    r.data.forEach(row => existingAddrs.add(normAddr(row.address)));
    if (r.data.length < 1000) break;
    addrOffset += 1000;
  }
  stamp(`Loaded ${existingAddrs.size} existing addresses`);

  // Pull one installer — both Socrata endpoints, all name variants
  async function pullInstaller(installer) {
    const installerStart = Date.now();
    const PER_INSTALLER_MS = 45000;
    const installerDeadline = installerStart + PER_INSTALLER_MS;
    function timedOut() { return Date.now() > installerDeadline || overGlobal(); }

    const seenLocal = new Set();
    const newRecs = [];

    async function trySocrata(baseUrl, defaultCity, label) {
      for (const qname of installer.names) {
        if (timedOut()) break;
        let offset = 0;
        while (offset < 3000) {
          if (timedOut()) break;
          const url = `${baseUrl}?$q=${encodeURIComponent(qname)}&$limit=1000&$offset=${offset}`;
          let resp;
          try { resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000); }
          catch(e) { stamp(`  ${label} "${qname}" fetch err: ${e.message}`); break; }
          if (!resp.ok || resp.status === 404) break;
          let batch;
          try { batch = await resp.json(); } catch(e) { break; }
          if (!Array.isArray(batch) || !batch.length) break;

          for (const p of batch) {
            const { street, city, state, zip, fullAddress, installYear, systemSizeKw } =
              extractSocrataAddress(p, defaultCity);
            if (!street || !isTarget(street, city, state, zip)) continue;
            const key = normAddr(fullAddress);
            if (!key || seenLocal.has(key) || existingAddrs.has(key)) continue;
            const candidate = {
              address: fullAddress,
              lead_category: 'fixmy',
              step: 1,
              lead_source: 'orphaned_list',
              black_box: true,
              original_installer: installer.name,
              install_year: installYear || null,
              system_size: systemSizeKw ? parseFloat(systemSizeKw) : null,
              notes: installer.name
                + (systemSizeKw ? ' · ' + systemSizeKw + 'kW' : '')
                + (installYear ? ' · Installed ' + installYear : '')
            };
            if (!qualifyPermit(candidate)) continue;
            seenLocal.add(key);
            candidate.lead_score = calcLeadScore(candidate);
            newRecs.push(candidate);
          }
          if (batch.length < 1000) break;
          offset += 1000;
          await sleep(50);
        }
      }
    }

    await trySocrata(BASE_SD_CITY, 'San Diego', 'SD-city');
    if (!timedOut()) await trySocrata(BASE_SD_CTY, '', 'SD-county');

    return newRecs;
  }

  const pullSummary = [];
  let allNewRecords = [];

  // Run high-value installers first so they get the most time budget
  const PRIORITY_ORDER = ['SunPower', 'Titan Solar', 'Sullivan Solar', 'Sunnova', 'Freedom Forever'];
  const sortedInstallers = [...INSTALLERS].sort(function(a, b) {
    const ai = PRIORITY_ORDER.indexOf(a.name), bi = PRIORITY_ORDER.indexOf(b.name);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  for (const installer of sortedInstallers) {
    if (overGlobal()) { stamp('Phase 1: global deadline — stopping installer loop'); break; }
    const found = await pullInstaller(installer);
    pullSummary.push({ name: installer.name, new: found.length });
    if (found.length) stamp(`  ${installer.name}: ${found.length} new`);
    allNewRecords = allNewRecords.concat(found);
    await sleep(80);
  }

  stamp(`Phase 1 pull done: ${allNewRecords.length} new records to insert`);

  // Insert in batches of 100
  let inserted = 0;
  for (let i = 0; i < allNewRecords.length; i += 100) {
    if (overGlobal()) break;
    const batch = allNewRecords.slice(i, i + 100);
    const ok = await supaInsertBatch(batch);
    if (ok) {
      inserted += batch.length;
      // Add to existingAddrs so Phase 2/3 queries pick them up via Supabase
      batch.forEach(r => existingAddrs.add(normAddr(r.address)));
    } else {
      stamp(`  Insert batch ${Math.floor(i / 100) + 1} failed`);
    }
    await sleep(50);
  }
  stamp(`Phase 1 inserted: ${inserted} records`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — OWNER ENRICHMENT (SANDAG / Regrid)
  // Fill title_owner for all leads missing it, up to 2000 per run
  // ══════════════════════════════════════════════════════════════════════════
  stamp('=== Phase 2: Owner enrichment ===');

  const PHASE2_DEADLINE = Date.now() + (3 * 60 * 1000);

  const unenrichedRes = await supaFetch(
    '/customers?lead_source=eq.orphaned_list&title_owner=is.null&select=id,address&limit=2000'
  );
  const toEnrich = (Array.isArray(unenrichedRes.data) ? unenrichedRes.data : [])
    .filter(r => r.address && addressQualityScore(r.address) >= 4);
  stamp(`Phase 2: ${toEnrich.length} leads need owner lookup`);

  const regridKey = process.env.REGRID_KEY;

  async function lookupOwner(address) {
    const addrUpper = address.toUpperCase().replace(/,.*/, '').trim();
    const addrParts = addrUpper.split(' ').slice(0, 4).join(' ');

    function arcgisPoint(qlat, qlng, outFields) {
      return '&geometry=' + encodeURIComponent(JSON.stringify({ x: qlng, y: qlat }))
        + '&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&inSR=4326'
        + '&outFields=' + outFields + '&f=json&resultRecordCount=1';
    }

    // Geocode first — spatial queries are far more reliable than text LIKE matching
    let lat = null, lng = null;
    try {
      const geocodeResp = await fetchWithTimeout(
        'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address='
          + encodeURIComponent(address) + '&benchmark=Public_AR_Current&format=json',
        { headers: { Accept: 'application/json' } }, 6000);
      if (geocodeResp.ok) {
        const gd = await geocodeResp.json();
        const m = gd.result && gd.result.addressMatches;
        if (Array.isArray(m) && m.length) { lat = m[0].coordinates.y; lng = m[0].coordinates.x; }
      }
    } catch(e) {}

    // Primary: SANDAG Parcels — spatial if geocoded, text fallback
    try {
      const q = (lat != null)
        ? 'where=1%3D1' + arcgisPoint(lat, lng, 'OWN_NAME1,APN_8')
        : 'where=' + encodeURIComponent("SITUS_ADDRESS LIKE '" + addrParts + "%'") + '&outFields=OWN_NAME1,APN_8&f=json&resultRecordCount=1';
      const resp = await fetchWithTimeout(
        'https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0/query?' + q,
        { headers: { Accept: 'application/json', Referer: 'https://sdgis.sandag.org/' } }, 5000);
      if (resp.ok) {
        const d = await resp.json();
        if (d.features && d.features.length && d.features[0].attributes.OWN_NAME1) {
          const a = d.features[0].attributes;
          return { owner: a.OWN_NAME1, apn: a.APN_8 || null };
        }
      }
    } catch(e) {}

    // Fallback: SANDAG Parcels_South
    try {
      const q = (lat != null)
        ? 'where=1%3D1' + arcgisPoint(lat, lng, 'OWN_NAME1,APN_8')
        : 'where=' + encodeURIComponent("SITUS_ADDRESS LIKE '" + addrParts + "%'") + '&outFields=OWN_NAME1,APN_8&f=json&resultRecordCount=1';
      const resp = await fetchWithTimeout(
        'https://geo.sandag.org/server/rest/services/Hosted/Parcels_South/FeatureServer/0/query?' + q,
        { headers: { Accept: 'application/json', Referer: 'https://sdgis.sandag.org/' } }, 5000);
      if (resp.ok) {
        const d = await resp.json();
        if (d.features && d.features.length && d.features[0].attributes.OWN_NAME1) {
          const a = d.features[0].attributes;
          return { owner: a.OWN_NAME1, apn: a.APN_8 || null };
        }
      }
    } catch(e) {}

    // Fallback: Regrid address search
    if (regridKey) {
      try {
        const url = 'https://app.regrid.com/api/v1/search.json?query='
          + encodeURIComponent(address) + '&limit=3';
        const resp = await fetchWithTimeout(url,
          { headers: { Authorization: 'Bearer ' + regridKey, Accept: 'application/json' } }, 6000);
        if (resp.ok) {
          const d = await resp.json();
          const features = (d.parcels && d.parcels.features) || d.features || [];
          if (Array.isArray(features) && features.length) {
            const f = (features[0].properties && features[0].properties.fields) || features[0].fields || {};
            const owner = f.owner || f.owner2 || null;
            if (owner) {
              const rawVal = String(f.parval || f.improvval || f.landval || '').replace(/[$,\s]/g, '');
              const assessedValue = rawVal ? (parseInt(rawVal, 10) || null) : null;
              const taxDelinquent = f.tax_delinquent != null
                ? (String(f.tax_delinquent).toUpperCase() === 'Y' || f.tax_delinquent === true) : null;
              return { owner, apn: f.parcelnumb || f.apn || null, assessed_value: assessedValue, tax_delinquent: taxDelinquent };
            }
          }
        }
      } catch(e) {}
    }

    return null;
  }

  let enriched = 0;
  const CONCURRENCY = 5;

  for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
    if (Date.now() > PHASE2_DEADLINE || overGlobal()) {
      stamp(`Phase 2: time limit at ${i}/${toEnrich.length}`);
      break;
    }
    const batch = toEnrich.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(lead => lookupOwner(lead.address).catch(() => null)));
    const updates = [];
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) {
        const r = results[j];
        const upd = { title_owner: r.owner, apn: r.apn };
        if (r.assessed_value) upd.assessed_value = r.assessed_value;
        if (r.tax_delinquent != null) upd.tax_delinquent = r.tax_delinquent;
        updates.push(supaUpdate(batch[j].id, upd));
      }
    }
    const oks = await Promise.all(updates);
    enriched += oks.filter(Boolean).length;
    await sleep(150);
  }

  stamp(`Phase 2 done: ${enriched} owner names added`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — TRACERFY SKIP-TRACE
  // Submit all no-contact leads, poll up to 4 min, write results back
  // ══════════════════════════════════════════════════════════════════════════
  stamp('=== Phase 3: Tracerfy skip-trace ===');

  const tracerfyKey = process.env.TRACERFY_API_KEY;
  let tracerfyResult = 'skipped — TRACERFY_API_KEY not set';
  let contactsAdded = 0;

  if (tracerfyKey) {
    const noContactRes = await supaFetch(
      '/customers?lead_source=eq.orphaned_list&sold_type=is.null&phone=is.null&email=is.null&select=id,address,install_year&limit=10000'
    );
    const allNoContact = (Array.isArray(noContactRes.data) ? noContactRes.data : []).filter(r => r.address);
    // Filter to complete addresses only, then sort newest install year first (highest value leads)
    const skipLeads = allNoContact
      .filter(l => addressQualityScore(l.address) >= 9)
      .sort((a, b) => (b.install_year || 0) - (a.install_year || 0));
    stamp(`Phase 3: ${skipLeads.length}/${allNoContact.length} leads pass address quality filter`);

    if (skipLeads.length === 0) {
      tracerfyResult = 'no leads needed skip-trace';
    } else {
      // Build CSV
      function parseAddr(s) {
        const m = s.match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})/);
        if (m) return { street: m[1].trim(), city: m[2].trim(), state: m[3], zip: m[4] };
        const parts = s.split(',');
        return { street: (parts[0] || s).trim(), city: (parts[1] || 'San Diego').trim(), state: 'CA', zip: '' };
      }
      function csvEsc(v) {
        const s = String(v == null ? '' : v);
        return (s.includes(',') || s.includes('"') || s.includes('\n'))
          ? '"' + s.replace(/"/g, '""') + '"' : s;
      }
      const rows = ['lead_id,street_address,city,state,zip'];
      for (const lead of skipLeads) {
        const a = parseAddr(lead.address);
        rows.push([csvEsc(lead.id), csvEsc(a.street), csvEsc(a.city), a.state, a.zip].join(','));
      }
      const csvContent = rows.join('\r\n');

      // Build multipart/form-data (same as tracerfy-submit.js)
      const boundary = '----Pipeline' + Date.now().toString(36);
      const CRLF = '\r\n';
      function textPart(name, value) {
        return '--' + boundary + CRLF
          + 'Content-Disposition: form-data; name="' + name + '"' + CRLF + CRLF
          + value + CRLF;
      }
      const multipartBody =
        '--' + boundary + CRLF
        + 'Content-Disposition: form-data; name="csv_file"; filename="leads.csv"' + CRLF
        + 'Content-Type: text/csv' + CRLF + CRLF
        + csvContent + CRLF
        + textPart('address_column', 'street_address')
        + textPart('city_column', 'city')
        + textPart('state_column', 'state')
        + textPart('zip_column', 'zip')
        + textPart('trace_type', 'advanced')
        + '--' + boundary + '--' + CRLF;

      // Submit
      let queueId = null;
      try {
        const resp = await fetchWithTimeout('https://tracerfy.com/v1/api/trace/', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + tracerfyKey,
            'Content-Type': 'multipart/form-data; boundary=' + boundary
          },
          body: multipartBody
        }, 30000);
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch(e) {
          stamp(`Phase 3: Tracerfy non-JSON: ${text.slice(0, 200)}`);
          data = {};
        }
        if (data.queue_id || data.id) {
          queueId = String(data.queue_id || data.id);
          stamp(`Phase 3: submitted ${skipLeads.length} leads — queue_id=${queueId}`);
        } else if (data.error || data.detail) {
          stamp(`Phase 3: Tracerfy error: ${data.error || data.detail}`);
          tracerfyResult = 'submit failed: ' + (data.error || data.detail);
        }
      } catch(e) {
        stamp(`Phase 3: submit exception: ${e.message}`);
        tracerfyResult = 'submit exception: ' + e.message;
      }

      // Poll for results (up to 4 minutes, every 30s)
      if (queueId) {
        const POLL_DEADLINE = Date.now() + (4 * 60 * 1000);
        let applied = 0;
        let attempt = 0;
        tracerfyResult = `submitted ${skipLeads.length} leads — queue_id=${queueId} — still processing`;

        while (Date.now() < POLL_DEADLINE && !overGlobal()) {
          await sleep(attempt === 0 ? 25000 : 30000);
          attempt++;
          stamp(`Phase 3: poll #${attempt}...`);

          try {
            const authHdr = { Authorization: 'Bearer ' + tracerfyKey, Accept: 'application/json' };
            let queueData = null;
            for (let page = 1; page <= 2 && !queueData; page++) {
              const r = await fetchWithTimeout(
                `https://tracerfy.com/v1/api/queues/?page=${page}`,
                { headers: authHdr }, 10000
              );
              if (!r.ok) break;
              const list = await r.json();
              if (Array.isArray(list)) {
                queueData = list.find(q => String(q.id) === queueId) || null;
                if (list.length < 100) break;
              }
            }

            if (!queueData) { stamp('Phase 3: queue not yet visible'); continue; }
            if (queueData.pending || !queueData.download_url) { stamp('Phase 3: still processing'); continue; }

            // Results ready — download CSV
            const csvResp = await fetchWithTimeout(queueData.download_url, {}, 20000);
            if (!csvResp.ok) { stamp(`Phase 3: CSV download HTTP ${csvResp.status}`); break; }
            const csvText = await csvResp.text();

            // Parse results CSV (same logic as tracerfy-results.js)
            const lines = csvText.trim().split('\n');
            if (lines.length < 2) { stamp('Phase 3: empty results'); break; }

            function parseCsvLine(line) {
              const result = []; let inQ = false, cur = '';
              for (let ci = 0; ci < line.length; ci++) {
                const ch = line[ci];
                if (ch === '"') {
                  if (inQ && line[ci + 1] === '"') { cur += '"'; ci++; }
                  else inQ = !inQ;
                } else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
                else cur += ch;
              }
              result.push(cur);
              return result;
            }

            const headers = parseCsvLine(lines[0]).map(h =>
              h.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
            );

            const updateQueue = [];
            for (let li = 1; li < lines.length; li++) {
              if (!lines[li].trim()) continue;
              const vals = parseCsvLine(lines[li]);
              const row = {};
              headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });

              const leadId = row['lead_id'] || null;
              if (!leadId) continue;
              const phone = row['primary_phone'] || row['mobile_1'] || row['landline_1'] || null;
              const email = row['email_1'] || null;
              const firstName = row['first_name'] || row['owner_1_first_name'] || '';
              const lastName  = row['last_name']  || row['owner_1_last_name']  || '';
              const ownerName = [firstName, lastName].filter(Boolean).join(' ') || null;
              const dncRaw = row['do_not_call'] || row['dnc'] || row['primary_phone_dnc'] || '';
              const dnc = ['true', 'yes', '1', 'y'].includes((dncRaw || '').toLowerCase().trim());
              if (phone || email || ownerName) {
                updateQueue.push({ leadId, phone, email, ownerName, dnc });
              }
            }

            stamp(`Phase 3: applying ${updateQueue.length} results...`);
            // Write updates 10 at a time
            for (let ui = 0; ui < updateQueue.length; ui += 10) {
              if (overGlobal()) break;
              const chunk = updateQueue.slice(ui, ui + 10);
              const writes = chunk.map(u => {
                const updates = { enrichment_source: 'tracerfy' };
                if (u.phone) updates.phone = u.phone;
                if (u.email) updates.email = u.email;
                if (u.ownerName) updates.title_owner = u.ownerName;
                if (u.dnc) updates.dnc = u.dnc;
                return supaUpdate(u.leadId, updates);
              });
              const oks = await Promise.all(writes.map(p => p.catch(() => false)));
              applied += oks.filter(Boolean).length;
              await sleep(50);
            }

            stamp(`Phase 3 done: ${applied} leads updated with contact info`);
            tracerfyResult = `${applied} contacts applied from ${skipLeads.length}-lead batch (queue_id=${queueId}, credits=${queueData.credits_deducted || '?'})`;
            contactsAdded = applied;
            break;

          } catch(e) {
            stamp(`Phase 3: poll error: ${e.message}`);
          }
        }

        if (contactsAdded === 0) {
          tracerfyResult = `submitted ${skipLeads.length} leads (queue_id=${queueId}) — results still processing. Use Check Results in portal.`;
          stamp(`Phase 3: results still pending — queue_id=${queueId}`);
        }
      }
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  const summary = {
    run_at: new Date().toISOString(),
    phase1_new_permits: inserted,
    phase1_by_installer: pullSummary.filter(s => s.new > 0),
    phase2_owners_added: enriched,
    phase3_tracerfy: tracerfyResult,
    log
  };

  stamp('=== Pipeline complete ===');
  console.log('Summary:', JSON.stringify(summary, null, 2));

  return { statusCode: 200, headers: cors, body: JSON.stringify(summary, null, 2) };
};
