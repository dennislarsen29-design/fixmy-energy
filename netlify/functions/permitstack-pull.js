// permitstack-pull.js
// Pulls solar permits from PermitStack API for a single defunct installer.
// Called once per installer from the portal Import tab pullFromPermitStack() loop.
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

  const BASE = 'https://api.permit-stack.com/v1';
  const psHeaders = { 'X-API-Key': apiKey, 'Accept': 'application/json' };
  const log = [];
  const records = [];
  const seenAddresses = new Set();

  // SD County zip prefix ranges: 919xx and 920xx
  function isSanDiegoCounty(address) {
    if (!address) return false;
    const a = address.toUpperCase();
    // Match zip codes 91901-91980 and 92001-92199
    const zipMatch = address.match(/\b(919[0-9]{2}|92[01][0-9]{2})\b/);
    if (zipMatch) return true;
    // Fallback: known SD County city names
    return /\b(SAN DIEGO|CHULA VISTA|EL CAJON|SANTEE|LA MESA|LEMON GROVE|NATIONAL CITY|POWAY|LAKESIDE|SPRING VALLEY|SANTEE|RAMONA|ESCONDIDO|VISTA|CARLSBAD|OCEANSIDE|ENCINITAS|DEL MAR|SOLANA BEACH|CORONADO)\b/.test(a);
  }

  // Extract kW from permit description text
  function extractKw(text) {
    if (!text) return null;
    const m = text.match(/(\d+\.?\d*)\s*k[Ww]/);
    return m ? parseFloat(m[1]) : null;
  }

  // Search PermitStack for a contractor name, return array of contractor objects
  async function searchContractor(name) {
    try {
      const url = `${BASE}/contractors/search?name=${encodeURIComponent(name)}&per_page=20`;
      const resp = await fetch(url, { headers: psHeaders });
      if (!resp.ok) { log.push(`search "${name}": HTTP ${resp.status}`); return []; }
      const data = await resp.json();
      const results = data.contractors || data.results || data.data || [];
      log.push(`search "${name}": ${results.length} matches`);
      return results;
    } catch(e) {
      log.push(`search "${name}": error ${e.message}`);
      return [];
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Pull all permits for a contractor ID, filter to SD County, deduplicate
  async function pullPermits(contractorId) {
    let page = 1;
    const perPage = 100;
    let totalFetched = 0;
    let sampleLogged = false;

    while (true) {
      try {
        const url = `${BASE}/contractors/${contractorId}/permits?per_page=${perPage}&page=${page}`;
        const resp = await fetch(url, { headers: psHeaders });
        if (resp.status === 429) {
          log.push(`id=${contractorId} page=${page}: rate limited, pausing 3s`);
          await sleep(3000);
          continue; // retry same page
        }
        if (!resp.ok) { log.push(`permits id=${contractorId} page=${page}: HTTP ${resp.status}`); break; }
        const data = await resp.json();
        const batch = data.permits || data.results || data.data || [];
        if (!batch.length) break;
        totalFetched += batch.length;

        // Log raw keys + sample address on first page to diagnose filter issues
        if (!sampleLogged && batch.length > 0) {
          sampleLogged = true;
          const sample = batch[0];
          const addrFields = ['address','site_address','property_address','location','street_address'];
          const foundAddr = addrFields.map(f => `${f}=${JSON.stringify(sample[f]||'')}`).join(' | ');
          log.push(`id=${contractorId} sample: ${foundAddr}`);
          // Also log first 3 full address values so we can see the format
          const addrs = batch.slice(0,3).map(p => p.address || p.site_address || p.property_address || p.location || '(none)');
          log.push(`id=${contractorId} first 3 addrs: ${addrs.join(' || ')}`);
        }

        for (const p of batch) {
          const address = (p.address || p.site_address || p.property_address || p.location || p.street_address || '').trim();
          if (!address || !isSanDiegoCounty(address)) continue;

          const addrKey = address.toLowerCase().replace(/\s+/g, ' ');
          if (seenAddresses.has(addrKey)) continue;
          seenAddresses.add(addrKey);

          const desc = p.description || p.work_description || p.scope_of_work || '';
          const systemSizeKw = p.system_size || p.kw || p.kilowatts || p.pv_size || extractKw(desc) || '';
          const rawDate = p.issue_date || p.issued_date || p.permit_date || '';
          const installYear = rawDate ? new Date(rawDate).getFullYear() : '';

          records.push({
            address,
            installer,
            install_year: installYear || '',
            system_size_kw: systemSizeKw || '',
            notes: `${installer}${systemSizeKw ? ` · ${systemSizeKw}kW` : ''}${installYear ? ` · Installed ${installYear}` : ''}`,
            permit_id: p.id || p.permit_number || ''
          });
        }

        if (batch.length < perPage) break;
        page++;
        if (page > 30) { log.push(`id=${contractorId}: page cap reached (3000 permits)`); break; }
        await sleep(200); // rate limit: 5 req/s
      } catch(e) {
        log.push(`permits id=${contractorId} page=${page}: error ${e.message}`);
        break;
      }
    }
    return totalFetched;
  }

  // Collect unique contractor IDs across all name variations
  const contractorIds = new Set();
  for (const name of names) {
    const contractors = await searchContractor(name);
    for (const c of contractors) {
      const id = c.id || c.contractor_id;
      if (id) contractorIds.add(String(id));
    }
    await sleep(300);
  }

  log.push(`${installer}: found ${contractorIds.size} contractor record(s)`);

  // Pull permits for each contractor ID
  for (const cid of contractorIds) {
    const fetched = await pullPermits(cid);
    log.push(`${installer} id=${cid}: fetched ${fetched} total, ${records.length} SD matches so far`);
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ installer, count: records.length, records, log })
  };
};
