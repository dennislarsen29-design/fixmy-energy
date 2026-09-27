const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

// Same street+zip normalization as tracerfy-backfill.js / bbApplyTracerfyCsv — a bare
// lowercase-and-strip match on the WHOLE address string ("normAddress", the original
// version of this function) can't tell "123 Main St, San Diego" from "123 Main St, Encinitas",
// and formatting drift ("123 Main Street" vs "123 MAIN ST") silently misses real matches.
const STREET_SUFFIX = {
  LANE:'LN', ROAD:'RD', STREET:'ST', DRIVE:'DR', AVENUE:'AVE', COURT:'CT', PLACE:'PL',
  BOULEVARD:'BLVD', CIRCLE:'CIR', TERRACE:'TER', TRAIL:'TRL', PARKWAY:'PKWY',
  HIGHWAY:'HWY', SQUARE:'SQ', NORTH:'N', SOUTH:'S', EAST:'E', WEST:'W'
};
function normStreet(a) {
  return String(a || '').split(',')[0]
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    .split(' ').map(w => STREET_SUFFIX[w] || w).join(' ');
}
function normZip(a) {
  const m = String(a || '').match(/\b(\d{5})(?:[-.]\d+)?\b(?![\s\S]*\b\d{5}\b)/);
  return m ? m[1] : '';
}

function parseCsvLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const WEBHOOK_SECRET = process.env.TRACEFY_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET) {
    const provided = event.headers['x-webhook-secret'] || event.headers['x-tracefy-secret'];
    if (provided !== WEBHOOK_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY || process.env.SUPA_KEY;
  const supaHeaders = {
    'apikey': SUPA_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

  // Accept: raw CSV body, JSON { csv }, { csv_url }, { body_html }, or base64 attachment
  let csvText = '';
  const contentType = (event.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(event.body || '{}');
      if (parsed.csv_url) {
        const urlResp = await fetch(parsed.csv_url);
        if (!urlResp.ok) {
          return { statusCode: 502, body: JSON.stringify({ error: 'Failed to fetch CSV from URL: ' + urlResp.status }) };
        }
        csvText = await urlResp.text();
      } else if (parsed.body_html) {
        // Tracerfy email body — extract the Download link URL
        const match = parsed.body_html.match(/href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?[Dd]ownload/i)
          || parsed.body_html.match(/href=["'](https?:\/\/(?:tracerfy|app\.tracerfy)[^"']+)["']/i)
          || parsed.body_html.match(/href=["'](https?:\/\/[^"']+\.csv[^"']*)["']/i);
        if (!match) {
          return { statusCode: 400, body: JSON.stringify({ error: 'No download URL found in email body' }) };
        }
        const dlResp = await fetch(match[1]);
        if (!dlResp.ok) {
          return { statusCode: 502, body: JSON.stringify({ error: 'Failed to fetch CSV from download link: ' + dlResp.status }) };
        }
        csvText = await dlResp.text();
      } else {
        csvText = parsed.csv || parsed.data || '';
      }
    } catch(e) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }
  } else {
    csvText = event.body || '';
    if (event.isBase64Encoded) {
      csvText = Buffer.from(csvText, 'base64').toString('utf8');
    }
  }

  if (!csvText.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No CSV data provided' }) };
  }

  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { statusCode: 400, body: JSON.stringify({ error: 'CSV needs header + at least one data row' }) };
  }

  // ⚠️ Real Tracerfy exports name columns primary_phone / Email-1 / Mobile-1 / Landline-1 /
  // first_name / last_name — never plain "phone"/"email". The header-normalize step below
  // must strip punctuation (not just whitespace), matching bbApplyTracerfyCsv's own fix for
  // this exact bug — "Email-1" has to become "email1", or the field is never read.
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = (vals[j] || '').trim(); });
    if (obj.address || obj.street_address) rows.push(obj);
  }

  if (!rows.length) {
    return { statusCode: 200, body: JSON.stringify({ matched: 0, updated: 0, skipped: 0 }) };
  }

  // Load orphaned leads for address matching — full contact fields too, so a write can be
  // scoped to only what's actually blank (never clobber a rep's own correction, and never
  // overwrite a name/number a different source already resolved for this lead).
  const existingResp = await fetch(
    SUPA_URL + '/rest/v1/customers?lead_source=eq.orphaned_list&select=id,address,phone,email,first_name,last_name&limit=20000',
    { headers: supaHeaders }
  );
  const existing = existingResp.ok ? await existingResp.json() : [];

  // Same street+zip-first, unambiguous-street-fallback index as tracerfy-backfill.js.
  const byStreetZip = {}, streetOnly = {}, dupe = {}, leadById = {};
  (existing || []).forEach(e => {
    leadById[e.id] = e;
    const st = normStreet(e.address);
    if (!st) return;
    const z = normZip(e.address);
    if (z) { const k = st + '|' + z; if (!byStreetZip[k]) byStreetZip[k] = e.id; }
    if (streetOnly[st] && streetOnly[st] !== e.id) dupe[st] = true;
    else if (!streetOnly[st]) streetOnly[st] = e.id;
  });
  Object.keys(dupe).forEach(k => delete streetOnly[k]);

  let matched = 0, updated = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    const streetAddr = row.street_address || row.address || '';
    const st = normStreet(streetAddr);
    if (!st) { skipped++; continue; }
    const zRaw = row.zip || row.zip_code || row.zipcode || '';
    const zm = String(zRaw).match(/\d{5}/);
    const id = (zm && byStreetZip[st + '|' + zm[0]]) || streetOnly[st] || null;
    if (!id) { skipped++; continue; }
    matched++;

    const lead = leadById[id];
    const phone = row.primary_phone || row.mobile_1 || row.landline_1 || null;
    const email = row.email_1 || row.email || null;
    const first = row.first_name || row.owner_1_first_name || '';
    const last  = row.last_name  || row.owner_1_last_name  || '';

    // Fill blanks only — same convention as every other Tracerfy apply path in this repo.
    const upd = {};
    if (phone && !lead.phone) upd.phone = phone;
    if (email && !lead.email) upd.email = email;
    if (first && !lead.first_name) upd.first_name = first;
    if (last  && !lead.last_name)  upd.last_name  = last;
    // Tracerfy's advanced trace carries no real DNC column (confirmed elsewhere in this
    // repo) — this only ever fires if a future export genuinely adds one.
    if (row.dnc !== undefined && row.dnc !== '') {
      upd.dnc = row.dnc === 'true' || row.dnc === '1' || row.dnc === 'yes' || row.dnc === 'TRUE';
    }
    if (!Object.keys(upd).length) continue;
    upd.enrichment_source = 'tracefy';
    upd.enriched_at = now;

    const patchResp = await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id, {
      method: 'PATCH',
      headers: supaHeaders,
      body: JSON.stringify(upd)
    });
    if (patchResp.ok || patchResp.status === 204) {
      updated++;
      // Keep the in-memory record in sync in case the same lead appears twice in one CSV.
      Object.assign(lead, upd);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      total_rows: rows.length, matched, updated, skipped,
      message: `Matched ${matched} of ${rows.length} rows — updated ${updated} leads`
    })
  };
};
