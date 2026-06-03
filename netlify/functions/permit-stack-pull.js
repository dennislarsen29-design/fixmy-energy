const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const DEFUNCT_INSTALLER_RISK = {
  'sullivan solar': 12, 'sunpower': 15, 'titan solar': 15, 'titan solar power': 15,
  'sunnova': 10, 'mosaic solar loans': 8, 'mosaic': 8, 'petersen dean': 10,
  'sungevity': 8, 'freedom forever': 12, 'verengo solar': 8, 'verengo': 8,
  'american solar direct': 8, 'adt solar': 8, 'rgs energy': 8,
  'pink energy': 10, 'vision solar': 10, 'kota energy': 8, 'oneroof energy': 8
};

function calcLeadScore(lead) {
  let score = 0;
  const yr = parseInt(lead.install_year) || 0;
  const age = yr > 0 ? (new Date().getFullYear() - yr) : 0;
  if (age >= 10) score += 40;
  else if (age >= 8) score += 30;
  else if (age >= 6) score += 20;
  else if (age >= 1) score += 10;
  if (lead.phone) score += 15;
  if (lead.email) score += 15;
  if (lead.title_owner) score += 10;
  const inst = (lead.original_installer || '').toLowerCase();
  const risk = Object.entries(DEFUNCT_INSTALLER_RISK).find(([k]) => inst.includes(k));
  score += risk ? risk[1] : 8;
  return Math.max(0, Math.min(100, score));
}

function normAddress(addr) {
  return (addr || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const PERMIT_STACK_KEY = process.env.PERMIT_STACK_KEY;
  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;

  if (!PERMIT_STACK_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'PERMIT_STACK_KEY not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { installers = [], zip_codes = [] } = body;
  if (!installers.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No installers selected' }) };
  }

  const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY || process.env.SUPA_KEY);

  // Fetch existing addresses to deduplicate
  const { data: existing } = await supabase.from('customers').select('address').eq('lead_source', 'orphaned_list');
  const existingNorm = new Set((existing || []).map(r => normAddress(r.address)));

  let allPermits = [];
  try {
    // Call PermitStack API for each installer
    for (const installer of installers) {
      const params = new URLSearchParams({ contractor_name: installer, state: 'CA', limit: '500' });
      if (zip_codes.length) params.set('zip_codes', zip_codes.join(','));

      const resp = await fetch(`https://api.permitstack.com/v1/permits?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${PERMIT_STACK_KEY}`, 'Accept': 'application/json' }
      });
      if (!resp.ok) {
        console.warn(`PermitStack ${installer}: ${resp.status}`);
        continue;
      }
      const data = await resp.json();
      const permits = data.permits || data.results || data.data || [];
      permits.forEach(p => { p._installer = installer; });
      allPermits = allPermits.concat(permits);
    }
  } catch(e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'PermitStack API error: ' + e.message }) };
  }

  // Build records, skipping duplicates
  const toInsert = [];
  const seen = new Set();
  for (const permit of allPermits) {
    const addr = permit.address || permit.site_address || permit.property_address || '';
    if (!addr) continue;
    const norm = normAddress(addr);
    if (existingNorm.has(norm) || seen.has(norm)) continue;
    seen.add(norm);

    const installYear = permit.issue_year || permit.permit_year ||
      (permit.issue_date ? new Date(permit.issue_date).getFullYear() : null) ||
      (permit.permit_date ? new Date(permit.permit_date).getFullYear() : null);

    const rec = {
      address: addr,
      lead_source: 'orphaned_list',
      lead_category: 'fixmy',
      step: 1,
      original_installer: permit._installer,
      install_year: installYear || null,
      permit_date: permit.issue_date || permit.permit_date || null,
      notes: `${permit._installer} permit${installYear ? ' ' + installYear : ''}`
    };
    rec.lead_score = calcLeadScore(rec);
    toInsert.push(rec);
  }

  if (!toInsert.length) {
    return {
      statusCode: 200,
      body: JSON.stringify({ imported: 0, skipped: allPermits.length, message: 'No new leads (all duplicates or no results)' })
    };
  }

  // Batch insert in chunks of 100
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const { data: inserted, error } = await supabase.from('customers').insert(chunk).select('id');
    if (!error) imported += (inserted || []).length;
    else console.error('Insert error:', error.message);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imported,
      skipped: allPermits.length - toInsert.length,
      total_found: allPermits.length
    })
  };
};
