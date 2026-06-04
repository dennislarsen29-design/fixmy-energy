// permitstack-pull.js
// Pulls solar permits from PermitStack API for a single defunct installer.
// POST body: { installer: "SunPower", names: ["SunPower", "Complete Solar", ...] }
// Returns: { installer, records: [{address, installer, install_year, system_size_kw, notes}], log }

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
      body: ''
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const apiKey = process.env.PERMITSTACK_KEY;
  if (!apiKey) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'PERMITSTACK_KEY not set', records: [] }) };

  let installer, names;
  try {
    const body = JSON.parse(event.body || '{}');
    installer = body.installer || '';
    names = Array.isArray(body.names) ? body.names : [installer];
  } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const BASE         = 'https://api.permit-stack.com/v1';
  const BASE_SD_CITY = 'https://data.sandiego.gov/resource/nt65-c7a7.json';
  const BASE_SD_CTY  = 'https://data.sandiegocounty.gov/resource/dyzh-7eat.json';
  const psHeaders = { 'X-API-Key': apiKey, 'Accept': 'application/json' };
  const log = [];
  const records = [];
  const seenAddresses = new Set();

  // Hard stop 4 seconds before Netlify's 26-second function timeout
  const DEADLINE = Date.now() + 22000;
  function overBudget() { return Date.now() > DEADLINE; }
  function msLeft() { return DEADLINE - Date.now(); }

  // All fetch calls go through here — aborts if per-request timeout OR global deadline hit
  async function fetchWithTimeout(url, opts, perRequestMs) {
    const remaining = msLeft();
    const timeoutMs = Math.min(perRequestMs || 7000, remaining - 300);
    if (timeoutMs <= 0) throw new Error('over_budget');
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...(opts || {}), signal: ctrl.signal });
    } finally {
      clearTimeout(tid);
    }
  }

  const TARGET_CITIES = ['SAN DIEGO','CHULA VISTA','EL CAJON','SANTEE','LA MESA','LEMON GROVE',
    'NATIONAL CITY','POWAY','LAKESIDE','SPRING VALLEY','RAMONA','ESCONDIDO','VISTA',
    'CARLSBAD','OCEANSIDE','ENCINITAS','DEL MAR','SOLANA BEACH','CORONADO','IMPERIAL BEACH',
    'ALPINE','BONITA','CAMPO','DESCANSO','DULZURA','JAMUL','PINE VALLEY','POTRERO',
    'RANCHO SANTA FE','SAN MARCOS','VALLEY CENTER',
    'SAN CLEMENTE','DANA POINT','LAGUNA BEACH','LAGUNA NIGUEL','LAGUNA HILLS',
    'ALISO VIEJO','LAGUNA WOODS','MISSION VIEJO'];

  const OC_ZIPS = new Set(['92629','92651','92652','92653','92656','92672','92673','92677','92618']);

  function isTargetTerritory(street, city, state, zip) {
    const z = String(zip || '');
    const c = String(city || '').toUpperCase().trim();
    const s = String(state || '').toUpperCase().trim();
    if (s && s !== 'CA') return false;
    if (/^919\d{2}$/.test(z)) return true;
    if (/^92[012]\d{2}$/.test(z)) return true;
    if (OC_ZIPS.has(z.slice(0,5))) return true;
    if (TARGET_CITIES.includes(c)) return true;
    const combined = `${street} ${city} ${state} ${zip}`.toUpperCase();
    if (TARGET_CITIES.some(n => combined.includes(n))) return true;
    return false;
  }

  const isSanDiegoCounty = isTargetTerritory;

  function extractKw(text) {
    if (!text) return null;
    const m = text.match(/(\d+\.?\d*)\s*k[Ww]/);
    return m ? parseFloat(m[1]) : null;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function parseRecord(p) {
    const street = (p.address_street || p.street_address || p.address || p.site_address || p.property_address || p.location || '').trim();
    const city   = (p.address_city   || p.city   || '').trim();
    const state  = (p.address_state  || p.state  || '').trim();
    const zip    = (p.address_zip    || p.zip    || p.postal_code || p.zipcode || '').trim();
    const desc   = p.description || p.work_description || p.scope_of_work || p.permit_description || '';
    const systemSizeKw = p.system_size || p.kw || p.kilowatts || p.pv_size || extractKw(desc) || '';
    const rawDate = p.issue_date || p.issued_date || p.permit_date || p.filed_date || p.application_date || '';
    const installYear = rawDate ? new Date(rawDate).getFullYear() : '';
    const fullAddress = [street, city, state, zip].filter(Boolean).join(', ');
    return { street, city, state, zip, fullAddress, desc, systemSizeKw, installYear,
             permitId: p.id || p.permit_id || p.permit_number || '' };
  }

  function extractSocrataAddress(p, defaultCity) {
    const num   = String(p.address_number || p.address_number_start || p.street_number || '').trim();
    const dir   = String(p.address_direction || p.address_street_direction || p.direction || '').trim();
    const sname = String(p.address_street_name || p.street_name || '').trim();
    const sfx   = String(p.address_sfx || p.address_street_type || p.street_type || p.address_suffix || '').trim();
    const street = [num, dir, sname, sfx].filter(Boolean).join(' ')
      || String(p.address || p.site_address || p.property_address || '').split(',')[0].trim();
    const city  = String(p.address_city || p.city || defaultCity || 'San Diego').trim();
    const state = 'CA';
    const zip   = String(p.address_zip || p.zipcode || p.zip_code || p.zip || '').replace(/\D/g,'').slice(0, 5);
    const fullAddress = [street, city, state, zip].filter(Boolean).join(', ');
    const rawDate = p.date_issued || p.issue_date || p.issued_date || p.applied_date || '';
    const installYear = rawDate ? new Date(rawDate).getFullYear() : '';
    const desc = p.work_description || p.project_description || p.description || p.scope_of_work || '';
    const systemSizeKw = extractKw(desc) || '';
    return { street, city, state, zip, fullAddress, installYear, systemSizeKw,
             permitId: p.permit_number || p.permit_id || p.record_id || p.project_id || '' };
  }

  // ── Strategy 0a: City of San Diego Open Data (Socrata) ──
  async function trySDOpenData(name) {
    let found = 0, sampleLogged = false;
    try {
      let offset = 0;
      while (offset < 2000) {
        if (overBudget()) { log.push(`SD city open data: time budget exceeded at offset ${offset}`); break; }
        const url = BASE_SD_CITY + '?$q=' + encodeURIComponent(name) + '&$limit=1000&$offset=' + offset;
        let resp;
        try {
          resp = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, 7000);
        } catch(e) {
          log.push(`SD city open data: fetch error (${e.message})`);
          break;
        }
        if (resp.status === 404) { log.push(`SD city open data: 404`); return 0; }
        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          log.push(`SD city open data: HTTP ${resp.status} ${t.slice(0,60)}`);
          break;
        }
        const batch = await resp.json();
        if (!Array.isArray(batch) || !batch.length) break;

        if (!sampleLogged) {
          sampleLogged = true;
          const s = batch[0];
          log.push(`[SD-city keys] ${Object.keys(s).slice(0,12).join(', ')}`);
          const { street: ss, city: sc, zip: sz } = extractSocrataAddress(s, 'San Diego');
          log.push(`[SD-city addr sample] street="${ss}" city="${sc}" zip="${sz}"`);
        }

        found += batch.length;
        for (const p of batch) {
          const { street, city, state, zip, fullAddress, installYear, systemSizeKw, permitId } = extractSocrataAddress(p, 'San Diego');
          if (!street || !isSanDiegoCounty(street, city, state, zip)) continue;
          const key = fullAddress.toLowerCase().replace(/\s+/g, ' ');
          if (seenAddresses.has(key)) continue;
          seenAddresses.add(key);
          records.push({ address: fullAddress, installer,
            install_year: installYear || '', system_size_kw: systemSizeKw || '',
            notes: `${installer}${systemSizeKw ? ` · ${systemSizeKw}kW` : ''}${installYear ? ` · Installed ${installYear}` : ''}`,
            permit_id: permitId, source: 'sd_city_open_data' });
        }
        if (batch.length < 1000) break;
        offset += 1000;
        await sleep(50);
      }
      log.push(`SD city open data "${name}": ${found} fetched, ${records.length} SD matches so far`);
    } catch(e) {
      log.push(`SD city open data error: ${e.message}`);
    }
    return found;
  }

  // ── Strategy 0b: SD County Open Data ──
  async function trySDCountyOpenData(name) {
    let found = 0, sampleLogged = false;
    try {
      let offset = 0;
      while (offset < 2000) {
        if (overBudget()) { log.push(`SD county open data: time budget exceeded at offset ${offset}`); break; }
        const url = BASE_SD_CTY + '?$q=' + encodeURIComponent(name) + '&$limit=1000&$offset=' + offset;
        let resp;
        try {
          resp = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, 7000);
        } catch(e) {
          log.push(`SD county open data: fetch error (${e.message})`);
          break;
        }
        if (resp.status === 404) { log.push(`SD county open data: 404`); return 0; }
        if (!resp.ok) {
          const t = await resp.text().catch(() => '');
          log.push(`SD county open data: HTTP ${resp.status} ${t.slice(0,60)}`);
          break;
        }
        const batch = await resp.json();
        if (!Array.isArray(batch) || !batch.length) break;

        if (!sampleLogged) {
          sampleLogged = true;
          const s = batch[0];
          log.push(`[SD-county keys] ${Object.keys(s).slice(0,12).join(', ')}`);
          const { street: ss, city: sc, zip: sz } = extractSocrataAddress(s, 'San Diego');
          log.push(`[SD-county addr sample] street="${ss}" city="${sc}" zip="${sz}"`);
        }

        found += batch.length;
        for (const p of batch) {
          const { street, city, state, zip, fullAddress, installYear, systemSizeKw, permitId } = extractSocrataAddress(p, '');
          if (!street || !isSanDiegoCounty(street, city, state, zip)) continue;
          const key = fullAddress.toLowerCase().replace(/\s+/g, ' ');
          if (seenAddresses.has(key)) continue;
          seenAddresses.add(key);
          records.push({ address: fullAddress, installer,
            install_year: installYear || '', system_size_kw: systemSizeKw || '',
            notes: `${installer}${systemSizeKw ? ` · ${systemSizeKw}kW` : ''}${installYear ? ` · Installed ${installYear}` : ''}`,
            permit_id: permitId, source: 'sd_county_open_data' });
        }
        if (batch.length < 1000) break;
        offset += 1000;
        await sleep(50);
      }
      log.push(`SD county open data "${name}": ${found} fetched, ${records.length} SD matches so far`);
    } catch(e) {
      log.push(`SD county open data error: ${e.message}`);
    }
    return found;
  }

  // ── Strategy 1: Direct permits/search endpoint ──
  async function tryDirectSearch(name) {
    let found = 0;
    // Top 8 SD cities only — keep within time budget
    const cities = ['San Diego','Chula Vista','El Cajon','La Mesa','Santee','Escondido','Poway','Oceanside'];
    try {
      for (const city of cities) {
        if (overBudget()) { log.push(`direct search: time budget exceeded at city "${city}"`); break; }
        let page = 1, retries429 = 0;
        while (page <= 5) {
          if (overBudget()) break;
          const url = `${BASE}/permits/search?city=${encodeURIComponent(city)}&keyword=${encodeURIComponent(name)}&per_page=100&page=${page}`;
          let resp;
          try {
            resp = await fetchWithTimeout(url, { headers: psHeaders }, 6000);
          } catch(e) {
            log.push(`direct search ${city} p${page}: fetch error (${e.message})`);
            break;
          }
          if (resp.status === 404) { log.push(`direct search: 404 (endpoint not available)`); return -1; }
          if (resp.status === 429) {
            retries429++;
            if (retries429 > 2) { log.push(`direct search ${city}: 429 rate limit, skipping city`); break; }
            await sleep(500);
            continue;
          }
          if (!resp.ok) { log.push(`direct search ${city}: HTTP ${resp.status}`); break; }
          const data = await resp.json();
          const batch = data.permits || data.results || data.data || [];

          if (found === 0 && page === 1 && batch.length > 0) {
            const s = batch[0];
            log.push(`[DIRECT keys] ${Object.keys(s).join(', ')}`);
            const parsed = parseRecord(s);
            log.push(`[DIRECT addr] street="${parsed.street}" city="${parsed.city}" state="${parsed.state}" zip="${parsed.zip}"`);
          }

          if (!batch.length) break;
          found += batch.length;
          for (const p of batch) {
            const { street, city: c, state, zip, fullAddress, systemSizeKw, installYear, permitId } = parseRecord(p);
            if (!fullAddress || !isSanDiegoCounty(street, c, state, zip)) continue;
            const key = fullAddress.toLowerCase().replace(/\s+/g, ' ');
            if (seenAddresses.has(key)) continue;
            seenAddresses.add(key);
            records.push({ address: fullAddress, installer, install_year: installYear || '',
              system_size_kw: systemSizeKw || '',
              notes: `${installer}${systemSizeKw ? ` · ${systemSizeKw}kW` : ''}${installYear ? ` · Installed ${installYear}` : ''}`,
              permit_id: permitId });
          }
          if (batch.length < 100) break;
          page++;
          await sleep(50);
        }
      }
      log.push(`direct search "${name}": ${found} total fetched, ${records.length} SD matches`);
    } catch(e) {
      log.push(`direct search error: ${e.message}`);
      return -1;
    }
    return found;
  }

  // ── Strategy 2: Contractor search → permit pages ──
  async function searchContractor(name) {
    if (overBudget()) return [];
    try {
      const url = `${BASE}/contractors/search?name=${encodeURIComponent(name)}&per_page=20`;
      let resp;
      try {
        resp = await fetchWithTimeout(url, { headers: psHeaders }, 6000);
      } catch(e) {
        log.push(`contractor search "${name}": fetch error (${e.message})`);
        return [];
      }
      if (!resp.ok) { log.push(`contractor search "${name}": HTTP ${resp.status}`); return []; }
      const data = await resp.json();
      const results = data.contractors || data.results || data.data || [];
      log.push(`contractor search "${name}": ${results.length} matches`);
      return results;
    } catch(e) {
      log.push(`contractor search "${name}": ${e.message}`);
      return [];
    }
  }

  async function pullContractorPermits(contractorId) {
    let page = 1, totalFetched = 0, sampleLogged = false;
    while (true) {
      if (overBudget()) { log.push(`id=${contractorId}: time budget exceeded at page ${page}`); break; }
      const url = `${BASE}/contractors/${contractorId}/permits?per_page=100&page=${page}`;
      let resp;
      try {
        resp = await fetchWithTimeout(url, { headers: psHeaders }, 6000);
      } catch(e) {
        log.push(`id=${contractorId} p${page}: fetch error (${e.message})`); break;
      }
      if (resp.status === 429) { log.push(`id=${contractorId} p${page}: 429 — skipping`); break; }
      if (!resp.ok) { log.push(`id=${contractorId} p${page}: HTTP ${resp.status}`); break; }
      const data = await resp.json();
      const batch = data.permits || data.results || data.data || [];
      if (!batch.length) break;
      totalFetched += batch.length;

      if (!sampleLogged && batch.length > 0) {
        sampleLogged = true;
        const s = batch[0];
        log.push(`[CONTR keys] ${Object.keys(s).join(', ')}`);
        const parsed = parseRecord(s);
        log.push(`[CONTR addr] street="${parsed.street}" city="${parsed.city}" state="${parsed.state}" zip="${parsed.zip}"`);
        if (parsed.permitId && !overBudget()) {
          try {
            const dr = await fetchWithTimeout(`${BASE}/permits/${parsed.permitId}`, { headers: psHeaders }, 5000);
            if (dr.ok) {
              const dd = await dr.json();
              const dp = parseRecord(dd.permit || dd);
              log.push(`[DETAIL keys] ${Object.keys(dd.permit||dd).join(', ')}`);
              log.push(`[DETAIL addr] street="${dp.street}" city="${dp.city}" state="${dp.state}" zip="${dp.zip}"`);
            }
          } catch(e2) { log.push(`[DETAIL] error: ${e2.message}`); }
        }
      }

      for (const p of batch) {
        const { street, city, state, zip, fullAddress, systemSizeKw, installYear, permitId } = parseRecord(p);
        if (!fullAddress || !isSanDiegoCounty(street, city, state, zip)) continue;
        const key = fullAddress.toLowerCase().replace(/\s+/g, ' ');
        if (seenAddresses.has(key)) continue;
        seenAddresses.add(key);
        records.push({ address: fullAddress, installer, install_year: installYear || '',
          system_size_kw: systemSizeKw || '',
          notes: `${installer}${systemSizeKw ? ` · ${systemSizeKw}kW` : ''}${installYear ? ` · Installed ${installYear}` : ''}`,
          permit_id: permitId });
      }
      if (batch.length < 100) break;
      page++;
      if (page > 20) { log.push(`id=${contractorId}: page cap (2000)`); break; }
      await sleep(50);
    }
    return totalFetched;
  }

  // ── Run strategies in order ──
  for (const name of names) {
    if (overBudget()) { log.push(`Skipping "${name}" — over budget`); break; }
    await trySDOpenData(name);
    if (overBudget()) break;
    await sleep(50);
    if (overBudget()) break;
    await trySDCountyOpenData(name);
    if (overBudget()) break;
    await sleep(50);
  }

  let directResult = -1;
  if (!overBudget()) {
    for (const name of names) {
      if (overBudget()) break;
      directResult = await tryDirectSearch(name);
      if (directResult >= 0) break;
      await sleep(50);
    }
  }

  if (directResult < 0 && !overBudget()) {
    log.push(`falling back to contractor search`);
    const contractorIds = new Set();
    for (const name of names) {
      if (overBudget()) break;
      const contractors = await searchContractor(name);
      for (const c of contractors) {
        const id = c.id || c.contractor_id;
        if (id) contractorIds.add(String(id));
      }
      await sleep(50);
    }
    log.push(`${installer}: found ${contractorIds.size} contractor(s)`);
    for (const cid of contractorIds) {
      if (overBudget()) break;
      const fetched = await pullContractorPermits(cid);
      log.push(`${installer} id=${cid}: ${fetched} fetched, ${records.length} SD matches`);
    }
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ installer, count: records.length, records, log })
  };
};
