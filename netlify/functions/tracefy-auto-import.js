const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

function normAddress(addr) {
  return (addr || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCsvLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
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

  // Validate shared secret (set TRACEFY_WEBHOOK_SECRET in Netlify env vars)
  const WEBHOOK_SECRET = process.env.TRACEFY_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET) {
    const provided = event.headers['x-webhook-secret'] || event.headers['x-tracefy-secret'];
    if (provided !== WEBHOOK_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY || process.env.SUPA_KEY);

  // Accept: raw CSV body, JSON { csv: "..." }, JSON { csv_url: "..." }, or base64 attachment
  let csvText = '';
  const contentType = (event.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(event.body || '{}');
      if (parsed.csv_url) {
        // Direct file URL — fetch content
        const urlResp = await fetch(parsed.csv_url);
        if (!urlResp.ok) {
          return { statusCode: 502, body: JSON.stringify({ error: 'Failed to fetch CSV from URL: ' + urlResp.status }) };
        }
        csvText = await urlResp.text();
      } else if (parsed.body_html) {
        // Tracerfy sends a Download button link in the email body — extract URL from HTML
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
    // Handle base64-encoded attachment from Zapier
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

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = (vals[j] || '').trim(); });
    if (obj.address) rows.push(obj);
  }

  if (!rows.length) {
    return { statusCode: 200, body: JSON.stringify({ matched: 0, updated: 0, skipped: 0 }) };
  }

  // Load all orphaned leads for address matching (batch to avoid timeout)
  const { data: existing } = await supabase
    .from('customers')
    .select('id,address')
    .eq('lead_source', 'orphaned_list')
    .limit(5000);

  const addrMap = {};
  (existing || []).forEach(e => { addrMap[normAddress(e.address)] = e.id; });

  let matched = 0, updated = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    const id = addrMap[normAddress(row.address)];
    if (!id) { skipped++; continue; }
    matched++;

    const upd = { enrichment_source: 'tracefy', enriched_at: now };
    if (row.phone) upd.phone = row.phone;
    if (row.email) upd.email = row.email;
    if (row.dnc !== undefined && row.dnc !== '') {
      upd.dnc = row.dnc === 'true' || row.dnc === '1' || row.dnc === 'yes' || row.dnc === 'TRUE';
    }

    const { error } = await supabase.from('customers').update(upd).eq('id', id);
    if (!error) updated++;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      total_rows: rows.length,
      matched,
      updated,
      skipped,
      message: `Matched ${matched} of ${rows.length} rows — updated ${updated} leads`
    })
  };
};
