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
  { name: 'SunPower',              names: ['Complete Solar Inc', 'BRS Field Ops', 'SunPower Corporation', 'SunPower', 'Sun Power', 'Sunpower Corp'] },
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
  { name: 'OneRoof Energy',        names: ['OneRoof Energy Inc', 'OneRoof Energy'] },
  { name: 'Sunworks',              names: ['Sunworks Inc', 'Sunworks United Inc'] },
  { name: 'SunPro Solar',          names: ['SunPro Solar Inc', 'SunPro Solar LLC'] },
  { name: 'Infinity Energy',       names: ['Infinity Energy Inc', 'Infinity Energy'] },
  { name: 'Suntuity Renewables',   names: ['Suntuity Renewables', 'Suntuity'] }
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
  '92234','92236','92240','92241','92260','92262','92264','92270',
  // San Bernardino County — West Valley (Rancho Cucamonga, Ontario, Fontana, Chino,
  // Chino Hills, Upland, Montclair) + Redlands/Highland. Added 2026-08-01: county-level
  // residential solar capacity is 35.0 kW/100 residents — higher than Orange County (24.3)
  // and LA (10.1), comparable to the already-covered Riverside (46.2) — and it's the direct
  // geographic continuation of the Riverside zips above. Zip list web-verified per-city
  // (not exhaustive — San Bernardino County has ~122 zips total; this is a first batch).
  '92336', // Fontana
  '91761','91762','91764', // Ontario
  '92376', // Rialto
  '91708', // Chino
  '91709', // Chino Hills
  '91701','91729','91730','91737','91739', // Rancho Cucamonga
  '91784','91786', // Upland
  '91763', // Montclair
  '92373','92374', // Redlands
  '92346' // Highland
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

  let bodyParams = {};
  try { bodyParams = JSON.parse(event.body || '{}'); } catch(e) {}
  const enrichOnly = !!bodyParams.enrich_only;

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
  // Phase 1c rotation cursor — see Phase 1c below. Persisted the same way as expansionIndex
  // so the (installer × city) matrix advances night over night instead of restarting at the
  // same SunPower/San-Diego-first units every run.
  let phase1cCursor = 0;
  try {
    const stateResp = await fetch(
      SUPA_REST + '/pipeline_state?key=in.(expansion_index,phase0_insights,phase1c_cursor)&select=key,value',
      { headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey, Accept: 'application/json' } }
    );
    if (stateResp.ok) {
      const rows = await stateResp.json();
      const idxRow = rows.find(r => r.key === 'expansion_index');
      expansionIndex = idxRow ? (parseInt(idxRow.value, 10) || 0) : 0;
      const cursorRow = rows.find(r => r.key === 'phase1c_cursor');
      phase1cCursor = cursorRow ? (parseInt(cursorRow.value, 10) || 0) : 0;
    }
  } catch(e) { stamp('Phase 0: expansion_index fetch error — ' + e.message); }
  activeExpansionZips = new Set(EXPANSION_QUEUE.slice(0, expansionIndex));
  stamp(`Phase 0: expansion index=${expansionIndex}, active extra zips=${activeExpansionZips.size}, phase1c cursor=${phase1cCursor}`);
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
      const prompt = `You are a solar lead generation analyst for FIXMy.Energy serving Southern California.
Current database snapshot: ${totalLeads} orphaned solar leads (${enrichPct}% enriched with owner name).
Contact coverage: ${leadsWithPhone} have phone (${contactPct}%), ${leadsWithEmail} have email (${emailPct}%), ${leadsNoContact} have neither (${noContactPct}% unreachable — skip-trace candidates).
Top installers: ${topInstallers || 'unknown'}.
Active geographic coverage: San Diego County + ${activeExpansionZips.size} expansion zips (growing into Orange County then Riverside).

Respond ONLY with raw JSON, no markdown, no code fences:
{"summary":"one sentence status","topOpportunity":"which segment to focus on and why","missingVariants":[{"installer":"exact installer name from list","variants":["alternate spelling 1","alternate spelling 2"]}],"marketingAngle":"fresh outreach angle based on data","zipFocus":"any zip patterns worth targeting more","importInsight":"one actionable suggestion to improve contact rates or import completeness"}
Installer names to use: SunPower, Titan Solar, Sullivan Solar, Sunnova, Freedom Forever, Petersen Dean, Sungevity, Lumio, ADT Solar, Pink Energy, Vision Solar, RGS Energy, Verengo, Kota Energy, American Solar Direct, OneRoof Energy.`;

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
  // PHASE 0b — GEOCODE MISSING LAT/LNG (Nominatim / OpenStreetMap)
  // Geocodes up to 300 orphaned leads per run that are missing lat/lng.
  // Free — no API key needed. Nominatim ToS requires 1 req/sec + User-Agent.
  // At 300/night, ~10K remaining leads geocoded in ~33 nightly runs.
  // ══════════════════════════════════════════════════════════════════════════
  stamp('=== Phase 0b: Geocode missing lat/lng ===');
  let geocodedCount = 0;
  if (!enrichOnly) {
    try {
      const geoRes = await fetch(
        SUPA_REST + '/customers?lead_source=eq.orphaned_list&lat=is.null&address=not.is.null&select=id,address&limit=300',
        { headers: supaHeaders }
      );
      const geoBatch = geoRes.ok ? await geoRes.json() : [];
      stamp(`Phase 0b: ${geoBatch.length} leads to geocode`);
      const GEOCODE_DEADLINE = Date.now() + (5.5 * 60 * 1000); // 5.5 min budget
      for (const lead of geoBatch) {
        if (Date.now() > GEOCODE_DEADLINE || overGlobal()) break;
        try {
          const gUrl = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(lead.address) + '&format=json&limit=1';
          const gResp = await fetch(gUrl, { headers: { 'User-Agent': 'fixmy.energy/1.0 (dennis@fixmy.energy)' } });
          const hits = gResp.ok ? await gResp.json() : [];
          if (hits && hits[0] && hits[0].lat) {
            await fetch(SUPA_REST + '/customers?id=eq.' + lead.id, {
              method: 'PATCH',
              headers: { ...supaHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: parseFloat(hits[0].lat), lng: parseFloat(hits[0].lon) })
            });
            geocodedCount++;
          }
        } catch(e) { /* skip individual failures */ }
        await sleep(1100); // Nominatim rate limit: 1 req/sec
      }
      stamp(`Phase 0b: geocoded ${geocodedCount} leads`);
    } catch(e) { stamp('Phase 0b error: ' + e.message); }
  } else {
    stamp('Phase 0b: skipped (enrich_only mode)');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — PERMIT PULL
  // Pull all 16 installers, insert records not already in Supabase
  // ══════════════════════════════════════════════════════════════════════════
  stamp('=== Phase 1: Permit pull ===');

  const psKey = process.env.PERMITSTACK_KEY;
  const PS_BASE = 'https://api.permit-stack.com/v1';

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

  // Apply AI-suggested missing name variants from previous Phase 0 run
  try {
    const insightsRes = await supaFetch('/pipeline_state?key=eq.phase0_insights&select=value&limit=1');
    if (insightsRes.ok && Array.isArray(insightsRes.data) && insightsRes.data[0]) {
      const insights = JSON.parse(insightsRes.data[0].value);
      if (Array.isArray(insights.missingVariants)) {
        for (const mv of insights.missingVariants) {
          if (!mv || typeof mv !== 'object' || !mv.installer || !Array.isArray(mv.variants)) continue;
          const target = INSTALLERS.find(i => i.name === mv.installer);
          if (!target) continue;
          for (const v of mv.variants) {
            if (v && !target.names.includes(v)) {
              target.names.push(v);
              stamp(`Phase 1: AI variant applied — ${mv.installer}: "${v}"`);
            }
          }
        }
      }
    }
  } catch(e) { stamp('Phase 1: AI variant load skipped — ' + e.message); }

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

  // Phase 1a — Socrata (legacy, saturated). Skip when PermitStack is available since 1c is a superset.
  let inserted = 0;
  if (psKey) {
    stamp('Phase 1a: skipped — PermitStack available (Phase 1c covers superset)');
  } else if (!enrichOnly) {
    for (const installer of sortedInstallers) {
      if (overGlobal()) { stamp('Phase 1a: global deadline — stopping installer loop'); break; }
      const found = await pullInstaller(installer);
      pullSummary.push({ name: installer.name, new: found.length });
      if (found.length) stamp(`  ${installer.name}: ${found.length} new`);
      allNewRecords = allNewRecords.concat(found);
      await sleep(80);
    }

    stamp(`Phase 1a pull done: ${allNewRecords.length} new records to insert`);

    for (let i = 0; i < allNewRecords.length; i += 100) {
      if (overGlobal()) break;
      const batch = allNewRecords.slice(i, i + 100);
      const ok = await supaInsertBatch(batch);
      if (ok) {
        inserted += batch.length;
        batch.forEach(r => existingAddrs.add(normAddr(r.address)));
      } else {
        stamp(`  Phase 1a insert batch ${Math.floor(i / 100) + 1} failed`);
      }
      await sleep(50);
    }
    stamp(`Phase 1a inserted: ${inserted} records`);
  } else {
    stamp('Phase 1a: skipped (enrich_only mode)');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1c — PermitStack SD Cities
  // City-by-city permit pull for 16 San Diego cities. Primary source for SD
  // permits — aggregates DSD + all incorporated city permit portals that
  // Socrata misses. Expected yield: 60k–100k total over multiple nightly runs.
  //
  // Rotation cursor (fixed 2026-08-01 — see phase1cCursor in Phase 0): the
  // (installer × city) matrix is flattened into one ordered array and each run
  // starts from wherever the PREVIOUS run left off, wrapping around. Without
  // this, the nested-loop order (SunPower first with 6 name variants, San
  // Diego first among cities) plus the single 5-minute phase budget meant
  // late-list cities — Carlsbad (#9 of 16), Encinitas, National City, Vista,
  // San Marcos, Lemon Grove — could go unqueried indefinitely, every single
  // night, even with PERMITSTACK_KEY correctly set. Root-caused from a "why
  // does 92008 have 0 leads" report.
  // ══════════════════════════════════════════════════════════════════════════
  let inserted1c = 0;
  {
    if (enrichOnly) {
      stamp('Phase 1c: skipped (enrich_only mode)');
    } else if (!psKey) {
      stamp('Phase 1c: skipped — PERMITSTACK_KEY not set');
    } else {
      const SD_PS_CITIES = [
        'San Diego','Chula Vista','El Cajon','La Mesa','Santee',
        'Escondido','Poway','Oceanside','Carlsbad','Encinitas',
        'National City','Vista','San Marcos','Lemon Grove','Spring Valley','Lakeside'
      ];
      stamp(`=== Phase 1c: PermitStack SD cities (${SD_PS_CITIES.length} cities) ===`);
      const PHASE1C_DEADLINE = Date.now() + (5 * 60 * 1000);
      const psHeaders = { 'X-API-Key': psKey, 'Accept': 'application/json' };
      const seenLocal1c = new Set();

      const extractPSAddress1c = (p, defaultCity) => {
        const street = String(
          p.address_street || p.street_address || p.address || p.site_address || ''
        ).split(',')[0].trim();
        const city  = String(p.city || defaultCity || '').trim();
        const state = 'CA';
        const zip   = String(p.zip || p.zip_code || p.postal_code || '').replace(/\D/g, '').slice(0, 5);
        const full  = [street, city, state, zip].filter(Boolean).join(', ');
        const rawDate = p.issue_date || p.issued_date || p.permit_date || p.filed_date || '';
        const installYear = rawDate ? (new Date(rawDate).getFullYear() || null) : null;
        const desc = p.work_description || p.description || p.scope_of_work || '';
        return { street, city, state, zip, fullAddress: full, installYear, systemSizeKw: extractKw(desc) };
      };

      // Flatten installer × city into one ordered rotation matrix — priority installers
      // (SunPower etc.) still lead the very first pass (cursor 0), but every combination
      // gets its turn across multiple nightly runs instead of the same handful forever.
      const phase1cUnits = [];
      for (const installer of sortedInstallers) {
        for (const city of SD_PS_CITIES) phase1cUnits.push({ installer, city });
      }
      const startCursor = phase1cUnits.length ? (phase1cCursor % phase1cUnits.length) : 0;
      stamp(`Phase 1c: ${phase1cUnits.length} (installer×city) units, starting at cursor ${startCursor}`);
      let unitsCovered = 0;
      const coveredLabels = [];

      outer1c: for (let u = 0; u < phase1cUnits.length; u++) {
        if (Date.now() > PHASE1C_DEADLINE || overGlobal()) break;
        const { installer, city } = phase1cUnits[(startCursor + u) % phase1cUnits.length];
        for (const qname of installer.names) {
          if (Date.now() > PHASE1C_DEADLINE || overGlobal()) break outer1c;
          let page = 1;
          while (page <= 30) {
            if (Date.now() > PHASE1C_DEADLINE || overGlobal()) break;
            const url = `${PS_BASE}/permits/search?city=${encodeURIComponent(city)}&keyword=${encodeURIComponent(qname)}&per_page=100&page=${page}`;
            let resp;
            try {
              resp = await fetchWithTimeout(url, { headers: psHeaders }, 10000);
            } catch(e) {
              stamp(`  1c ${city}/"${qname}" fetch err: ${e.message}`);
              break;
            }
            if (!resp.ok) {
              if (resp.status === 429) await sleep(2000);
              break;
            }
            let body;
            try { body = await resp.json(); } catch(e) { break; }
            const batch = body.permits || body.results || body.data || [];
            if (!Array.isArray(batch) || !batch.length) break;

            const batchRecs = [];
            for (const p of batch) {
              const { street, fullAddress, installYear, systemSizeKw } =
                extractPSAddress1c(p, city);
              if (!street || !/^\d/.test(street)) continue;
              const key = normAddr(fullAddress);
              if (!key || seenLocal1c.has(key) || existingAddrs.has(key)) continue;
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
              seenLocal1c.add(key);
              candidate.lead_score = calcLeadScore(candidate);
              batchRecs.push(candidate);
            }

            if (batchRecs.length) {
              const ok = await supaInsertBatch(batchRecs);
              if (ok) {
                inserted1c += batchRecs.length;
                batchRecs.forEach(r => existingAddrs.add(normAddr(r.address)));
              }
            }

            if (batch.length < 100) break;
            page++;
            await sleep(80);
          }
        }
        unitsCovered++;
        coveredLabels.push(`${installer.name}/${city}`);
        await sleep(50);
      }

      const nextCursor = phase1cUnits.length ? (startCursor + unitsCovered) % phase1cUnits.length : 0;
      stamp(`Phase 1c inserted: ${inserted1c} records — covered ${unitsCovered}/${phase1cUnits.length} units `
        + `(cursor ${startCursor}→${nextCursor}): ${coveredLabels.slice(0, 8).join(', ')}${coveredLabels.length > 8 ? ', …' : ''}`);
      try {
        await fetch(SUPA_REST + '/pipeline_state', {
          method: 'POST',
          headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ key: 'phase1c_cursor', value: String(nextCursor), updated_at: new Date().toISOString() })
        });
      } catch(e) { stamp('Phase 1c: cursor persist error — ' + e.message); }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1d — SD COUNTY OPEN DATA (Socrata / unincorporated areas)
  // Runs regardless of PermitStack availability — covers unincorporated SD County
  // (Alpine, Spring Valley, Lakeside, Ramona, Valley Center, Rancho Santa Fe, etc.)
  // which PermitStack city-name queries miss entirely.
  // ══════════════════════════════════════════════════════════════════════════
  let inserted1d = 0;
  if (enrichOnly) {
    stamp('Phase 1d: skipped (enrich_only mode)');
  } else {
    stamp('=== Phase 1d: SD County open data (unincorporated areas) ===');
    const PHASE1D_DEADLINE = Date.now() + (3 * 60 * 1000);
    const seenLocal1d = new Set();

    outer1d: for (const installer of sortedInstallers) {
      for (const qname of installer.names) {
        if (Date.now() > PHASE1D_DEADLINE || overGlobal()) break outer1d;
        let offset = 0;
        while (offset < 3000) {
          if (Date.now() > PHASE1D_DEADLINE || overGlobal()) break;
          const url = `${BASE_SD_CTY}?$q=${encodeURIComponent(qname)}&$limit=1000&$offset=${offset}`;
          let resp;
          try {
            resp = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000);
          } catch(e) {
            stamp(`  1d "${qname}" fetch err: ${e.message}`);
            break;
          }
          if (!resp.ok || resp.status === 404) {
            if (resp.status === 404) { stamp('Phase 1d: SD County endpoint 404 — skipping'); break outer1d; }
            break;
          }
          let batch;
          try { batch = await resp.json(); } catch(e) { break; }
          if (!Array.isArray(batch) || !batch.length) break;

          const batchRecs = [];
          for (const p of batch) {
            const { street, city, state, zip, fullAddress, installYear, systemSizeKw } =
              extractSocrataAddress(p, '');
            if (!street || !isTarget(street, city, state, zip)) continue;
            const key = normAddr(fullAddress);
            if (!key || seenLocal1d.has(key) || existingAddrs.has(key)) continue;
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
            seenLocal1d.add(key);
            candidate.lead_score = calcLeadScore(candidate);
            batchRecs.push(candidate);
          }
          if (batchRecs.length) {
            const ok = await supaInsertBatch(batchRecs);
            if (ok) {
              inserted1d += batchRecs.length;
              batchRecs.forEach(r => existingAddrs.add(normAddr(r.address)));
            }
          }
          if (batch.length < 1000) break;
          offset += 1000;
          await sleep(50);
        }
      }
    }
    stamp(`Phase 1d inserted: ${inserted1d} records`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1b — OC / RIVERSIDE PERMIT PULL (via PermitStack)
  // Activated when expansion index ≥ 20 (OC) or ≥ 54 (Riverside).
  // Queries PermitStack city-by-city so no geographic filter is needed —
  // the city query is already precise. Shares seenLocal1b + existingAddrs for dedup.
  // ══════════════════════════════════════════════════════════════════════════
  let inserted1b = 0;
  {
    if (enrichOnly) {
      stamp('Phase 1b: skipped (enrich_only mode)');
    } else {
    const OC_PS_CITIES = expansionIndex >= 20 ? [
      'Irvine','Anaheim','Santa Ana','Garden Grove','Orange','Fullerton',
      'Laguna Niguel','Mission Viejo','Lake Forest','Dana Point',
      'Laguna Beach','Laguna Hills','Aliso Viejo','San Clemente','Laguna Woods'
    ] : [];
    const RIV_PS_CITIES = expansionIndex >= 54 ? [
      'Temecula','Murrieta','Riverside','Moreno Valley','Hemet','Perris'
    ] : [];
    const activePSCities = [...OC_PS_CITIES, ...RIV_PS_CITIES];

    if (!psKey) {
      stamp('Phase 1b: skipped — PERMITSTACK_KEY not set');
    } else if (!activePSCities.length) {
      stamp(`Phase 1b: skipped — expansion index ${expansionIndex} below OC threshold (need ≥20)`);
    } else {
      stamp(`=== Phase 1b: PermitStack — ${activePSCities.length} cities (OC:${OC_PS_CITIES.length} RIV:${RIV_PS_CITIES.length}) ===`);
      const PHASE1B_DEADLINE = Date.now() + (4 * 60 * 1000);
      const psHeaders = { 'X-API-Key': psKey, 'Accept': 'application/json' };
      const seenLocal1b = new Set();

      const extractPSAddress = (p, defaultCity) => {
        const street = String(
          p.address_street || p.street_address || p.address || p.site_address || ''
        ).split(',')[0].trim();
        const city  = String(p.city || defaultCity || '').trim();
        const state = 'CA';
        const zip   = String(p.zip || p.zip_code || p.postal_code || '').replace(/\D/g, '').slice(0, 5);
        const full  = [street, city, state, zip].filter(Boolean).join(', ');
        const rawDate = p.issue_date || p.issued_date || p.permit_date || p.filed_date || '';
        const installYear = rawDate ? (new Date(rawDate).getFullYear() || null) : null;
        const desc = p.work_description || p.description || p.scope_of_work || '';
        return { street, city, state, zip, fullAddress: full, installYear, systemSizeKw: extractKw(desc) };
      };

      outer1b: for (const installer of sortedInstallers) {
        if (Date.now() > PHASE1B_DEADLINE || overGlobal()) break;
        for (const city of activePSCities) {
          if (Date.now() > PHASE1B_DEADLINE || overGlobal()) break outer1b;
          for (const qname of installer.names) {
            if (Date.now() > PHASE1B_DEADLINE || overGlobal()) break outer1b;
            let page = 1;
            while (page <= 30) {
              if (Date.now() > PHASE1B_DEADLINE || overGlobal()) break;
              const url = `${PS_BASE}/permits/search?city=${encodeURIComponent(city)}&keyword=${encodeURIComponent(qname)}&per_page=100&page=${page}`;
              let resp;
              try {
                resp = await fetchWithTimeout(url, { headers: psHeaders }, 10000);
              } catch(e) {
                stamp(`  1b ${city}/"${qname}" fetch err: ${e.message}`);
                break;
              }
              if (!resp.ok) {
                if (resp.status === 429) await sleep(2000);
                break;
              }
              let body;
              try { body = await resp.json(); } catch(e) { break; }
              const batch = body.permits || body.results || body.data || [];
              if (!Array.isArray(batch) || !batch.length) break;

              const batchRecs = [];
              for (const p of batch) {
                const { street, city: pCity, state, zip, fullAddress, installYear, systemSizeKw } =
                  extractPSAddress(p, city);
                if (!street || !/^\d/.test(street)) continue;
                const key = normAddr(fullAddress);
                if (!key || seenLocal1b.has(key) || existingAddrs.has(key)) continue;
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
                seenLocal1b.add(key);
                candidate.lead_score = calcLeadScore(candidate);
                batchRecs.push(candidate);
              }

              if (batchRecs.length) {
                const ok = await supaInsertBatch(batchRecs);
                if (ok) {
                  inserted1b += batchRecs.length;
                  batchRecs.forEach(r => existingAddrs.add(normAddr(r.address)));
                }
              }

              if (batch.length < 100) break;
              page++;
              await sleep(80);
            }
          }
          await sleep(50);
        }
      }
      stamp(`Phase 1b inserted: ${inserted1b} records`);
    }
    } // end !enrichOnly
  }

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

  const PHASE2_DEADLINE = Date.now() + ((enrichOnly ? 10 : 6) * 60 * 1000);

  // Fetch leads needing owner lookup — include already-geocoded leads so SANDAG can be retried
  const unenrichedRes = await supaFetch(
    '/customers?lead_source=eq.orphaned_list&title_owner=is.null&select=id,address,lat,lng&limit=2000'
  );
  const toEnrich = (Array.isArray(unenrichedRes.data) ? unenrichedRes.data : [])
    .filter(r => r.address && addressQualityScore(r.address) >= 4);
  stamp(`Phase 2: ${toEnrich.length} leads need geocoding/owner lookup`);

  const regridKey = process.env.REGRID_KEY;
  // Rate-limit state for Regrid (shared across all lookupOwner calls in this run)
  let regridPausedUntil = 0;   // epoch ms — skip Regrid until this time after a 429
  let lastRegridAt = 0;        // epoch ms of last Regrid request
  const REGRID_GAP_MS = 1500;  // ≥1.5s between requests → ≤40/min (well under Regrid's limit)

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

  async function lookupOwner(address, existingLat, existingLng) {
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

    // Step 1: Census geocode — skip if caller already has coords from a prior run
    const censusAddr = address.replace(/, ([A-Z]{2}), (\d{5})/, ', $1 $2');
    let lat = (existingLat != null) ? existingLat : null;
    let lng = (existingLng != null) ? existingLng : null;
    if (lat == null) {
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
    }

    // Step 2a (PRIMARY): Regrid lat/lon lookup — skipped when key returns 403
    if (regridKey && lat != null && Date.now() > regridPausedUntil) {
      const rWait = (lastRegridAt + REGRID_GAP_MS) - Date.now();
      if (rWait > 0) await sleep(rWait);
      lastRegridAt = Date.now();
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
        } else {
          stamp('Phase 2: Regrid lat/lon HTTP ' + r.status);
          if (r.status === 429) { regridPausedUntil = Date.now() + 120000; stamp('Phase 2: Regrid rate-limited — pausing 2 min'); }
          if (r.status === 403) { regridPausedUntil = Date.now() + 999999999; stamp('Phase 2: Regrid 403 — disabling for this run'); }
        }
      } catch(e) { stamp('Phase 2: Regrid lat/lon err: ' + e.message); }
    }

    // Step 2b: Regrid address search fallback
    if (regridKey && Date.now() > regridPausedUntil) {
      const rWait = (lastRegridAt + REGRID_GAP_MS) - Date.now();
      if (rWait > 0) await sleep(rWait);
      lastRegridAt = Date.now();
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
        } else {
          stamp('Phase 2: Regrid search HTTP ' + r.status);
          if (r.status === 429) { regridPausedUntil = Date.now() + 120000; stamp('Phase 2: Regrid rate-limited — pausing 2 min'); }
          if (r.status === 403) { regridPausedUntil = Date.now() + 999999999; stamp('Phase 2: Regrid 403 — disabling for this run'); }
        }
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
  let geoSaved = 0;
  const GEO_BATCH = 20;

  for (let i = 0; i < toEnrich.length; i += GEO_BATCH) {
    if (Date.now() > PHASE2_DEADLINE || overGlobal()) {
      stamp(`Phase 2: time limit at ${i}/${toEnrich.length}`);
      break;
    }
    const batch = toEnrich.slice(i, i + GEO_BATCH);
    const results = await Promise.all(batch.map(async lead => {
      try { return { lead, result: await lookupOwner(lead.address, lead.lat, lead.lng) }; }
      catch(e) { return { lead, result: null }; }
    }));
    for (const { lead, result } of results) {
      if (!result) continue;
      const upd = {};
      if (result.owner) { upd.title_owner = result.owner; upd.apn = result.apn; }
      if (result.assessed_value) upd.assessed_value = result.assessed_value;
      if (result.tax_delinquent != null) upd.tax_delinquent = result.tax_delinquent;
      if (result.lat != null) upd.lat = result.lat;
      if (result.lng != null) upd.lng = result.lng;
      if (Object.keys(upd).length) {
        await supaUpdate(lead.id, upd);
        if (result.owner) enriched++;
        if (result.lat != null) geoSaved++;
      }
    }
  }

  stamp(`Phase 2 done: ${enriched} owner names added, ${geoSaved} coordinates saved`);

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — TRACERFY SKIP-TRACE
  // Submit all no-contact leads, poll up to 4 min, write results back.
  // If results aren't ready in time, queue_id is saved to pipeline_state and
  // picked up automatically on the next run.
  // ══════════════════════════════════════════════════════════════════════════
  stamp('=== Phase 3: Tracerfy skip-trace ===');

  const tracerfyKey = process.env.TRACERFY_API_KEY;
  let tracerfyResult = 'skipped — TRACERFY_API_KEY not set';
  let contactsAdded = 0;

  // Shared helper: parse a Tracerfy results CSV and write updates to DB.
  // Returns count of leads updated.
  async function applyTracerfyCSV(csvText, queueId) {
    function parseLine(line) {
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
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) { stamp(`Phase 3: empty results CSV for queue_id=${queueId}`); return 0; }
    const hdrs = parseLine(lines[0]).map(h =>
      h.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    );
    const updateQueue = [];
    for (let li = 1; li < lines.length; li++) {
      if (!lines[li].trim()) continue;
      const vals = parseLine(lines[li]);
      const row = {};
      hdrs.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
      const leadId = row['lead_id'] || null;
      if (!leadId) continue;
      const phone = row['primary_phone'] || row['mobile_1'] || row['landline_1'] || null;
      const email = row['email_1'] || null;
      const firstName = row['first_name'] || row['owner_1_first_name'] || '';
      const lastName  = row['last_name']  || row['owner_1_last_name']  || '';
      const ownerName = [firstName, lastName].filter(Boolean).join(' ') || null;
      const dncRaw = row['do_not_call'] || row['dnc'] || row['primary_phone_dnc'] || '';
      const dnc = ['true', 'yes', '1', 'y'].includes((dncRaw || '').toLowerCase().trim());
      if (phone || email || ownerName) updateQueue.push({ leadId, phone, email, ownerName, dnc });
    }
    stamp(`Phase 3: applying ${updateQueue.length} results from queue_id=${queueId}...`);
    let applied = 0;
    for (let ui = 0; ui < updateQueue.length; ui += 10) {
      if (overGlobal()) break;
      const chunk = updateQueue.slice(ui, ui + 10);
      const writes = chunk.map(u => {
        const upd = { enrichment_source: 'tracerfy' };
        if (u.phone) upd.phone = u.phone;
        if (u.email) upd.email = u.email;
        if (u.ownerName) upd.title_owner = u.ownerName;
        if (u.dnc) upd.dnc = u.dnc;
        return supaUpdate(u.leadId, upd);
      });
      const oks = await Promise.all(writes.map(p => p.catch(() => false)));
      applied += oks.filter(Boolean).length;
      await sleep(50);
    }
    stamp(`Phase 3: ${applied} leads updated from queue_id=${queueId}`);
    return applied;
  }

  // Shared helper: look up a queue by ID across pages of the Tracerfy queue list.
  async function fetchTracerfyQueue(queueId, authHdr) {
    for (let page = 1; page <= 5; page++) {
      try {
        const r = await fetchWithTimeout(
          `https://tracerfy.com/v1/api/queues/?page=${page}`,
          { headers: authHdr }, 10000
        );
        if (!r.ok) break;
        const list = await r.json();
        if (Array.isArray(list)) {
          const found = list.find(q => String(q.id) === String(queueId));
          if (found) return found;
          if (list.length < 100) break;
        }
      } catch(e) { break; }
    }
    return null;
  }

  const TRACERFY_BATCH_CAP = enrichOnly ? 2000 : 500;

  if (tracerfyKey) {
    const authHdr = { Authorization: 'Bearer ' + tracerfyKey, Accept: 'application/json' };

    // ── Check for pending queue_id saved from a previous run ────────────────
    let pendingQueueId = null;
    try {
      const pqRes = await supaFetch('/pipeline_state?key=eq.tracerfy_pending_queue&select=value,updated_at&limit=1');
      if (pqRes.ok && Array.isArray(pqRes.data) && pqRes.data[0]) {
        const row = pqRes.data[0];
        const ageHrs = (Date.now() - new Date(row.updated_at).getTime()) / 3600000;
        if (ageHrs < 48) {
          pendingQueueId = row.value;
          stamp(`Phase 3: found pending queue_id=${pendingQueueId} from ${ageHrs.toFixed(1)}h ago — checking...`);
        } else {
          stamp(`Phase 3: pending queue_id=${row.value} is ${ageHrs.toFixed(0)}h old — discarding`);
          await fetch(SUPA_REST + '/pipeline_state?key=eq.tracerfy_pending_queue',
            { method: 'DELETE', headers: supaHeaders }).catch(() => {});
        }
      }
    } catch(e) { stamp('Phase 3: pending queue lookup error: ' + e.message); }

    if (pendingQueueId) {
      try {
        const queueData = await fetchTracerfyQueue(pendingQueueId, authHdr);
        if (!queueData) {
          stamp(`Phase 3: pending queue_id=${pendingQueueId} not found in queue list`);
        } else if (queueData.pending || !queueData.download_url) {
          stamp(`Phase 3: pending queue_id=${pendingQueueId} still processing — will retry next run`);
          tracerfyResult = `pending queue_id=${pendingQueueId} still processing`;
        } else {
          const csvResp = await fetchWithTimeout(queueData.download_url, {}, 20000);
          if (csvResp.ok) {
            const csvText = await csvResp.text();
            const applied = await applyTracerfyCSV(csvText, pendingQueueId);
            contactsAdded = applied;
            tracerfyResult = `${applied} contacts applied from pending queue_id=${pendingQueueId} (credits=${queueData.credits_deducted || '?'})`;
            // Clear the pending key now that results are applied
            await fetch(SUPA_REST + '/pipeline_state?key=eq.tracerfy_pending_queue',
              { method: 'DELETE', headers: supaHeaders }).catch(() => {});
            pendingQueueId = null;
          } else {
            stamp(`Phase 3: CSV download HTTP ${csvResp.status} for pending queue`);
          }
        }
      } catch(e) { stamp('Phase 3: pending queue apply error: ' + e.message); }
    }

    // ── Submit new batch only when no pending queue is outstanding ───────────
    if (!pendingQueueId) {
      const noContactRes = await supaFetch(
        '/customers?lead_source=eq.orphaned_list&sold_type=is.null&phone=is.null&email=is.null&enrichment_source=is.null&select=id,address,install_year&limit=10000'
      );
      const allNoContact = (Array.isArray(noContactRes.data) ? noContactRes.data : []).filter(r => r.address);
      const skipLeads = allNoContact
        .filter(l => addressQualityScore(l.address) >= 9)
        .sort((a, b) => (b.install_year || 0) - (a.install_year || 0))
        .slice(0, TRACERFY_BATCH_CAP);
      stamp(`Phase 3: ${skipLeads.length}/${allNoContact.length} leads pass address quality filter`);

      if (skipLeads.length === 0) {
        if (contactsAdded === 0) tracerfyResult = 'no leads needed skip-trace';
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
            // Mark submitted leads as tried to prevent re-submission on future runs
            for (let mi = 0; mi < skipLeads.length; mi += 50) {
              if (overGlobal()) break;
              const ids = skipLeads.slice(mi, mi + 50).map(l => l.id);
              await fetchWithTimeout(
                SUPA_REST + '/customers?id=in.(' + ids.map(encodeURIComponent).join(',') + ')',
                { method: 'PATCH', headers: supaHeaders, body: JSON.stringify({ enrichment_source: 'tracerfy' }) },
                10000
              ).catch(() => {});
              await sleep(50);
            }
            stamp(`Phase 3: marked ${skipLeads.length} leads as tracerfy-tried`);
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
          tracerfyResult = `submitted ${skipLeads.length} leads — queue_id=${queueId} — polling...`;

          while (Date.now() < POLL_DEADLINE && !overGlobal()) {
            await sleep(attempt === 0 ? 25000 : 30000);
            attempt++;
            stamp(`Phase 3: poll #${attempt}...`);
            try {
              const queueData = await fetchTracerfyQueue(queueId, authHdr);
              if (!queueData) { stamp('Phase 3: queue not yet visible'); continue; }
              if (queueData.pending || !queueData.download_url) { stamp('Phase 3: still processing'); continue; }

              const csvResp = await fetchWithTimeout(queueData.download_url, {}, 20000);
              if (!csvResp.ok) { stamp(`Phase 3: CSV download HTTP ${csvResp.status}`); break; }
              applied = await applyTracerfyCSV(await csvResp.text(), queueId);
              tracerfyResult = `${applied} contacts applied from ${skipLeads.length}-lead batch (queue_id=${queueId}, credits=${queueData.credits_deducted || '?'})`;
              contactsAdded = applied;
              break;
            } catch(e) { stamp(`Phase 3: poll error: ${e.message}`); }
          }

          if (contactsAdded === 0) {
            // Save queue_id so the next run can pick up results automatically
            stamp(`Phase 3: results still pending — saving queue_id=${queueId} for next run`);
            await fetch(SUPA_REST + '/pipeline_state', {
              method: 'POST',
              headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({ key: 'tracerfy_pending_queue', value: queueId, updated_at: new Date().toISOString() })
            }).catch(() => {});
            tracerfyResult = `submitted ${skipLeads.length} leads (queue_id=${queueId}) — will auto-apply on next run`;
          }
        }
      }
    }
  }

  // ── Phase 4: sync dialable Black Box leads into GHL (Power Dialer contacts) ──
  // Reuses ghl-bulk-sync.js in-process — same code path as the portal's manual
  // "Sync Queue to GHL" button. Idempotent: GHL upsert dedupes by phone/email.
  let ghlSyncResult = 'skipped';
  if (!enrichOnly && !overGlobal()) {
    try {
      stamp('Phase 4: GHL dialer sync starting');
      const bulkSync = require('./ghl-bulk-sync.js');
      const r = await bulkSync.handler({ httpMethod: 'POST', body: '{}' });
      const d = JSON.parse(r.body || '{}');
      ghlSyncResult = r.statusCode === 200
        ? 'synced ' + d.synced + '/' + d.total + ' contacts' + (d.failed ? ', ' + d.failed + ' failed' : '')
        : 'failed: ' + (d.error || r.statusCode);
      stamp('Phase 4: ' + ghlSyncResult);
    } catch(e) { ghlSyncResult = 'error: ' + e.message; stamp('Phase 4 error: ' + e.message); }
  } else {
    stamp('Phase 4: GHL sync skipped — ' + (enrichOnly ? 'enrich-only run' : 'global deadline reached'));
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  const summary = {
    run_at: new Date().toISOString(),
    phase0b_geocoded: geocodedCount,
    phase1_new_permits: inserted,
    phase1c_new_permits: inserted1c,
    phase1d_new_permits: inserted1d,
    phase1b_new_permits: inserted1b,
    phase1_by_installer: pullSummary.filter(s => s.new > 0),
    phase2_owners_added: enriched,
    phase3_tracerfy: tracerfyResult,
    phase4_ghl_sync: ghlSyncResult,
    log
  };

  // ── Write last_run_at + last_run_summary so the portal can show when pipeline ran ──
  try {
    const runTs = new Date().toISOString();
    const runSummary = JSON.stringify({
      phase0b_geocoded: summary.phase0b_geocoded,
      phase1_new_permits: summary.phase1_new_permits,
      phase1c_new_permits: summary.phase1c_new_permits,
      phase1d_new_permits: summary.phase1d_new_permits,
      phase1b_new_permits: summary.phase1b_new_permits,
      phase1_by_installer: summary.phase1_by_installer,
      phase2_owners_added: summary.phase2_owners_added,
      phase3_tracerfy: summary.phase3_tracerfy,
      phase4_ghl_sync: summary.phase4_ghl_sync,
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
