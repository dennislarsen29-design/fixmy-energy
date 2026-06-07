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

// Ordered zip expansion queue: 5 new zips added per nightly run after SD County saturates.
// SD County is already covered by the isTarget() regex. This queue grows coverage into
// Orange County (south/coastal first — highest solar density) then SW Riverside County.
const EXPANSION_QUEUE = [
  // Orange County — south/coastal (Irvine, Mission Viejo, Laguna Niguel, Lake Forest, Dana Point)
  '92620','92630','92637','92646','92647','92648','92649','92657','92660',
  '92661','92662','92663','92675','92676','92683','92688','92691','92692',
  '92694','92697',
  // OC central / inland (Anaheim, Santa Ana, Garden Grove, Orange, Fullerton)
  '92701','92703','92704','92705','92706','92707','92708','92780','92782',
  '92801','92802','92804','92805','92806','92807','92808','92821','92831',
  '92832','92833','92835','92840','92841','92843','92844','92845',
  '92856','92861','92865','92866','92867','92868','92869','92870',
  // SW Riverside County — Temecula/Murrieta basin (highest-growth solar area)
  '92590','92591','92592','92595','92596',
  // Riverside metro + Moreno Valley
  '92501','92503','92504','92505','92506','92507','92508','92509',
  '92551','92553','92555','92557',
  // Hemet / San Jacinto / Perris
  '92543','92544','92545','92570','92571',
  // Coachella Valley / Palm Springs desert
  '92234','92236','92240','92241','92260','92262','92264','92270'
];

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

  // ── Expansion zip set — populated in Phase 0 from Supabase pipeline_state ──
  let activeExpansionZips = new Set();

  // ── Helpers shared with permitstack-pull.js ────────────────────────────────

  function isTarget(street, city, state, zip) {
    const z = String(zip || '');
    const c = String(city || '').toUpperCase().trim();
    const s = String(state || '').toUpperCase().trim();
    if (s && s !== 'CA') return false;
    if (/^919\d{2}$/.test(z)) return true;
    if (/^92[012]\d{2}$/.test(z)) return true;
    if (OC_ZIPS.has(z.slice(0, 5))) return true;
    if (activeExpansionZips.has(z.slice(0, 5))) return true;
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
  // PHASE 0 — AI INTELLIGENCE ANALYSIS + ZIP EXPANSION INIT
  // Runs before Phase 1: reads expansion index, loads active zips, calls
  // Claude Haiku to analyze the current lead DB and store strategic insights.
  // ══════════════════════════════════════════════════════════════════════════
  stamp('=== Phase 0: Intelligence + expansion init ===');
  let expansionIndex = 0;
  try {
    const stateResp = await fetch(
      SUPA_REST + '/pipeline_state?key=in.(expansion_index,phase0_insights)&select=key,value',
      { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey, Accept: 'application/json' } }
    );
    if (stateResp.ok) {
      const rows = await stateResp.json();
      const idxRow = rows.find(r => r.key === 'expansion_index');
      expansionIndex = idxRow ? (parseInt(idxRow.value, 10) || 0) : 0;
    }
  } catch(e) { stamp('Phase 0: expansion_index fetch error — ' + e.message); }
  activeExpansionZips = new Set(EXPANSION_QUEUE.slice(0, expansionIndex));
  stamp(`Phase 0: expansion index=${expansionIndex}, active extra zips=${activeExpansionZips.size}`);
  if (expansionIndex < EXPANSION_QUEUE.length) {
    stamp(`Phase 0: next 5 zips tonight — ${EXPANSION_QUEUE.slice(expansionIndex, expansionIndex + 5).join(', ')}`);
  }

  // ── Phase 0 AI analysis ───────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_KEY;
  if (anthropicKey) {
    try {
      // Get accurate total count via Content-Range (avoids Supabase's 1,000-row default cap)
      const totalCountResp = await fetch(
        SUPA_REST + '/customers?lead_source=eq.orphaned_list&sold_type=is.null&select=id',
        { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey,
          Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }
      );
      let totalLeads = 0;
      if (totalCountResp.ok) {
        const cr = totalCountResp.headers.get('Content-Range') || '';
        const m = cr.match(/\/(\d+)$/);
        if (m) totalLeads = parseInt(m[1], 10);
      }

      // Sample up to 1,000 rows for installer breakdown (representative for ratios)
      const sampleResp = await fetch(
        SUPA_REST + '/customers?lead_source=eq.orphaned_list&sold_type=is.null&select=title_owner,original_installer',
        { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey, Accept: 'application/json',
          'Range-Unit': 'items', Range: '0-999' } }
      );
      let enrichedLeads = 0;
      const byInstaller = {};
      if (sampleResp.ok) {
        const sample = await sampleResp.json();
        sample.forEach(r => {
          if (r.title_owner) enrichedLeads++;
          const inst = r.original_installer || 'unknown';
          byInstaller[inst] = (byInstaller[inst] || 0) + 1;
        });
      }

      // Contact stats — exact counts via server-side filtering
      let leadsWithPhone = 0, leadsWithEmail = 0, leadsNoContact = 0;
      try {
        const phoneCountResp = await fetch(
          SUPA_REST + '/customers?lead_source=eq.orphaned_list&sold_type=is.null&phone=not.is.null&phone=not.like.*%40pending.fixmy.energy&select=id',
          { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey,
            Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }
        );
        if (phoneCountResp.ok) {
          const cr = phoneCountResp.headers.get('Content-Range') || '';
          const m = cr.match(/\/(\d+)$/);
          if (m) leadsWithPhone = parseInt(m[1], 10);
        }
        const emailCountResp = await fetch(
          SUPA_REST + '/customers?lead_source=eq.orphaned_list&sold_type=is.null&email=not.is.null&email=not.like.*%40pending.fixmy.energy&select=id',
          { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey,
            Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' } }
        );
        if (emailCountResp.ok) {
          const cr = emailCountResp.headers.get('Content-Range') || '';
          const m = cr.match(/\/(\d+)$/);
          if (m) leadsWithEmail = parseInt(m[1], 10);
        }
        leadsNoContact = Math.max(0, totalLeads - leadsWithPhone);
      } catch(e) { stamp('Phase 0: contact stats error — ' + e.message); }

      const topInstallers = Object.entries(byInstaller)
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, count]) => `${name}: ${count}`).join(', ');
      const sampleSize = Object.values(byInstaller).reduce((a, b) => a + b, 0);
      const enrichPct = sampleSize ? Math.round(enrichedLeads / sampleSize * 100) : 0;
      const contactPct = totalLeads ? Math.round(leadsWithPhone / totalLeads * 100) : 0;
      const emailPct = totalLeads ? Math.round(leadsWithEmail / totalLeads * 100) : 0;
      const noContactPct = totalLeads ? Math.round(leadsNoContact / totalLeads * 100) : 0;
      const prompt = `You are a solar lead generation analyst for FIXMy.Energy in San Diego.
Current database snapshot: ${totalLeads} orphaned solar leads (${enrichPct}% enriched with owner name).
Contact coverage: ${leadsWithPhone} have phone (${contactPct}%), ${leadsWithEmail} have email (${emailPct}%), ${leadsNoContact} have neither (${noContactPct}% unreachable — skip-trace candidates).
Top installers: ${topInstallers || 'unknown'}.
Active geographic coverage: San Diego County + ${activeExpansionZips.size} expansion zips (growing into Orange County then Riverside).

Respond ONLY with raw JSON, no markdown, no code fences:
{"summary":"one sentence status","topOpportunity":"which segment to focus on and why","missingVariants":["up to 3 alternate installer name spellings to try"],"marketingAngle":"fresh outreach angle based on data","zipFocus":"any zip patterns worth targeting more","importInsight":"one actionable suggestion to improve contact rates or import completeness"}`;

      const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500,
          messages: [{ role: 'user', content: prompt }] })
      });
      if (aiResp.ok) {
        const aiData = await aiResp.json();
        let analysis = (aiData.content && aiData.content[0] && aiData.content[0].text) || '{}';
        // Strip markdown code fences if model wraps response despite instructions
        analysis = analysis.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        await fetch(SUPA_REST + '/pipeline_state', {
          method: 'POST',
          headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ key: 'phase0_insights', value: analysis, updated_at: new Date().toISOString() })
        });
        const parsed = JSON.parse(analysis);
        stamp('Phase 0 AI: ' + (parsed.summary || analysis.slice(0, 80)));
      } else {
        stamp('Phase 0 AI: HTTP ' + aiResp.status);
      }
    } catch(e) {
      stamp('Phase 0 AI: skipped — ' + e.message);
    }
  } else {
    stamp('Phase 0 AI: skipped — ANTHROPIC_KEY not set');
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

  // ── Advance zip expansion index +5 after successful Phase 1 ──────────────
  if (expansionIndex < EXPANSION_QUEUE.length) {
    const newIndex = Math.min(expansionIndex + 5, EXPANSION_QUEUE.length);
    try {
      await fetch(SUPA_REST + '/pipeline_state', {
        method: 'POST',
        headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: 'expansion_index', value: String(newIndex), updated_at: new Date().toISOString() })
      });
      const nextZips = EXPANSION_QUEUE.slice(newIndex, newIndex + 5).join(', ');
      stamp(`Zip expansion: index advanced to ${newIndex}${nextZips ? ' — next: ' + nextZips : ' (fully expanded)'}`);
    } catch(e) { stamp('Zip expansion: failed to save index — ' + e.message); }
  } else {
    stamp('Zip expansion: fully expanded (' + EXPANSION_QUEUE.length + ' extra zips active)');
  }

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

  // Mirrors regrid-lookup.js logic: Regrid lat/lon → Regrid search → SANDAG → SD City GIS
  function parseRegridFeature(feat) {
    if (!feat) return null;
    const f = (feat.properties && feat.properties.fields) || feat.fields || {};
    const owner = f.owner || f.owner2 || f.mail_name || null;
    if (!owner) return null;
    const rawVal = String(f.parval || f.improvval || f.landval || '').replace(/[$,\s]/g, '');
    return {
      owner,
      apn: f.parcelnumb || f.parcelnumb_formatted || f.apn || null,
      assessed_value: rawVal ? (parseInt(rawVal, 10) || null) : null,
      tax_delinquent: f.tax_delinquent != null ? (String(f.tax_delinquent).toUpperCase() === 'Y' || f.tax_delinquent === true) : null
    };
  }
  function regridFeatures(d) {
    return (d.parcels && d.parcels.features) || (d.results && d.results.features) || d.results || d.features || [];
  }

  async function lookupOwner(address) {
    function arcgisPoint(qlat, qlng, outFields) {
      return '&geometry=' + encodeURIComponent(JSON.stringify({ x: qlng, y: qlat }))
        + '&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&inSR=4326'
        + '&outFields=' + outFields + '&f=json&resultRecordCount=1';
    }
    function sandagOwner(a) {
      return a.OWN_NAME1 || a.OWNER_NAME || a.OWNER || a.OWN_NAME || a.OWNERNME1 || a.OWN1 || a.OWNER1 || a.PARCEL_OWNER || null;
    }
    function sandagApn(a) { return a.APN_8 || a.APN || a.PARCEL_NBR || a.ASSESSOR_PARCEL_NUMBER || null; }
    const regridHdrs = { Authorization: 'Bearer ' + regridKey, Accept: 'application/json' };

    // Step 1: Census geocode (required for spatial queries; provides lat/lng for record)
    const censusAddr = address.replace(/, ([A-Z]{2}), (\d{5})/, ', $1 $2');
    let lat = null, lng = null;
    try {
      const r = await fetchWithTimeout(
        'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address='
          + encodeURIComponent(censusAddr) + '&benchmark=Public_AR_Current&format=json',
        { headers: { Accept: 'application/json' } }, 10000);
      if (r.ok) {
        const gd = await r.json();
        const m = gd.result && gd.result.addressMatches;
        if (Array.isArray(m) && m.length) { lat = m[0].coordinates.y; lng = m[0].coordinates.x; }
      }
    } catch(e) { stamp('Phase 2: geocode err: ' + e.message); }

    // Step 2a (PRIMARY): Regrid lat/lon — most precise, requires geocoded coords
    if (regridKey && lat != null) {
      try {
        const r = await fetchWithTimeout(
          'https://app.regrid.com/api/v1/search.json?lat=' + lat + '&lon=' + lng + '&radius=0',
          { headers: regridHdrs }, 8000);
        if (r.ok) {
          const d = await r.json();
          const parsed = parseRegridFeature((regridFeatures(d) || [])[0]);
          if (parsed) {
            const geoLat = lat || ((regridFeatures(d)[0] && regridFeatures(d)[0].geometry && regridFeatures(d)[0].geometry.coordinates) || [])[1] || null;
            const geoLng = lng || ((regridFeatures(d)[0] && regridFeatures(d)[0].geometry && regridFeatures(d)[0].geometry.coordinates) || [])[0] || null;
            return { ...parsed, lat: geoLat, lng: geoLng };
          }
        } else { stamp('Phase 2: Regrid lat/lon HTTP ' + r.status); }
      } catch(e) { stamp('Phase 2: Regrid lat/lon err: ' + e.message); }
    }

    // Step 2b: Regrid address search fallback
    if (regridKey) {
      try {
        const r = await fetchWithTimeout(
          'https://app.regrid.com/api/v1/search.json?query=' + encodeURIComponent(address) + '&limit=3',
          { headers: regridHdrs }, 8000);
        if (r.ok) {
          const d = await r.json();
          const feats = regridFeatures(d);
          const parsed = parseRegridFeature(Array.isArray(feats) ? feats[0] : null);
          if (parsed) {
            const geo = Array.isArray(feats) && feats[0] && feats[0].geometry && feats[0].geometry.coordinates;
            return { ...parsed, lat: lat || (geo && geo[1]) || null, lng: lng || (geo && geo[0]) || null };
          }
        } else { stamp('Phase 2: Regrid search HTTP ' + r.status); }
      } catch(e) { stamp('Phase 2: Regrid search err: ' + e.message); }
    }

    // Step 3: SANDAG Parcels (free, spatial)
    if (lat != null) try {
      const q = 'where=1%3D1' + arcgisPoint(lat, lng, '*');
      const r = await fetchWithTimeout(
        'https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0/query?' + q,
        { headers: { Accept: 'application/json', Referer: 'https://sdgis.sandag.org/' } }, 5000);
      if (r.ok) {
        const d = await r.json();
        if (!d.error && d.features && d.features.length) {
          const owner = sandagOwner(d.features[0].attributes);
          if (owner) return { owner, apn: sandagApn(d.features[0].attributes), lat, lng };
        }
      }
    } catch(e) { stamp('Phase 2: SANDAG err: ' + e.message); }

    // Step 4: SANDAG Parcels_South (free, spatial)
    if (lat != null) try {
      const q = 'where=1%3D1' + arcgisPoint(lat, lng, '*');
      const r = await fetchWithTimeout(
        'https://geo.sandag.org/server/rest/services/Hosted/Parcels_South/FeatureServer/0/query?' + q,
        { headers: { Accept: 'application/json', Referer: 'https://sdgis.sandag.org/' } }, 5000);
      if (r.ok) {
        const d = await r.json();
        if (!d.error && d.features && d.features.length) {
          const owner = sandagOwner(d.features[0].attributes);
          if (owner) return { owner, apn: sandagApn(d.features[0].attributes), lat, lng };
        }
      }
    } catch(e) { stamp('Phase 2: SANDAG_South err: ' + e.message); }

    // Step 5: City of SD GeocoderMerged (free, spatial)
    if (lat != null) try {
      const q = 'where=1%3D1' + arcgisPoint(lat, lng, 'SITUS_STREET,OWN_NAME1,APN_8');
      const r = await fetchWithTimeout(
        'https://webmaps.sandiego.gov/arcgis/rest/services/GeocoderMerged/MapServer/1/query?' + q,
        { headers: { Accept: 'application/json' } }, 5000);
      if (r.ok) {
        const d = await r.json();
        if (!d.error && d.features && d.features.length) {
          const owner = d.features[0].attributes.OWN_NAME1 || null;
          if (owner) return { owner, apn: d.features[0].attributes.APN_8 || null, lat, lng };
        }
      }
    } catch(e) { stamp('Phase 2: SD City GIS err: ' + e.message); }

    // Geocode succeeded but no owner found — save coords anyway for distance sorting
    if (lat != null) return { owner: null, apn: null, lat, lng };
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
        const upd = {};
        if (r.owner) { upd.title_owner = r.owner; upd.apn = r.apn; }
        if (r.assessed_value) upd.assessed_value = r.assessed_value;
        if (r.tax_delinquent != null) upd.tax_delinquent = r.tax_delinquent;
        if (r.lat != null) upd.lat = r.lat;
        if (r.lng != null) upd.lng = r.lng;
        if (Object.keys(upd).length) updates.push(supaUpdate(batch[j].id, upd));
        if (r.owner) enriched++;
      }
    }
    await Promise.all(updates);
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

  // ── Write last_run_at + last_run_summary so the portal can show when pipeline ran ──
  try {
    const runTs = new Date().toISOString();
    const runSummary = JSON.stringify({
      phase1_new_permits: summary.phase1_new_permits,
      phase1_by_installer: summary.phase1_by_installer,
      phase2_owners_added: summary.phase2_owners_added,
      phase3_tracerfy: summary.phase3_tracerfy,
      log: (summary.log || []).slice(-80)
    });
    await Promise.all([
      fetch(SUPA_REST + '/pipeline_state', {
        method: 'POST',
        headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: 'last_run_at', value: runTs, updated_at: runTs })
      }),
      fetch(SUPA_REST + '/pipeline_state', {
        method: 'POST',
        headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ key: 'last_run_summary', value: runSummary, updated_at: runTs })
      })
    ]);
    stamp('Pipeline: last_run_at saved');
  } catch(e) { stamp('Pipeline: failed to save last_run_at — ' + e.message); }

  stamp('=== Pipeline complete ===');
  console.log('Summary:', JSON.stringify(summary, null, 2));

  return { statusCode: 200, headers: cors, body: JSON.stringify(summary, null, 2) };
};
