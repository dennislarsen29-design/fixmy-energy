// tracerfy-results.js
// Accepts { queue_id }, checks Tracerfy job status.
// Returns { status: 'pending', estimated_wait_seconds? }
//      or { status: 'complete', records: [{lead_id, phone, email, owner_name}], credits_deducted }
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
  const apiKey = process.env.TRACERFY_API_KEY;
  if (!apiKey) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'TRACERFY_API_KEY not set' }) };

  let queueId;
  try {
    const body = JSON.parse(event.body || '{}');
    queueId = body.queue_id;
  } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!queueId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'queue_id required' }) };

  try {
    const statusResp = await fetch(`https://tracerfy.com/v1/api/queue/${queueId}/`, {
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' }
    });
    if (!statusResp.ok) {
      const t = await statusResp.text().catch(() => '');
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Tracerfy status HTTP ' + statusResp.status, raw: t.slice(0, 200) }) };
    }
    const statusData = await statusResp.json();

    if (!statusData.download_url || statusData.status === 'pending') {
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        status: 'pending',
        estimated_wait_seconds: statusData.estimated_wait_seconds || null
      }) };
    }

    // Download results CSV
    const csvResp = await fetch(statusData.download_url);
    if (!csvResp.ok) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Download failed: HTTP ' + csvResp.status }) };
    }
    const csvText = await csvResp.text();
    const records = parseResultsCsv(csvText);

    return { statusCode: 200, headers: cors, body: JSON.stringify({
      status: 'complete',
      records,
      rows_uploaded: statusData.rows_uploaded || records.length,
      credits_deducted: statusData.credits_deducted || null
    }) };
  } catch(e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};

function parseResultsCsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  function parseLine(line) {
    const result = [];
    let inQuotes = false, current = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current); current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_'));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });

    const phones = [];
    const emails = [];
    for (let j = 1; j <= 8; j++) {
      const p = row['phone' + j] || row['phone_' + j] || '';
      if (p) phones.push(p);
    }
    for (let j = 1; j <= 5; j++) {
      const e = row['email' + j] || row['email_' + j] || '';
      if (e) emails.push(e);
    }

    const leadId = row['lead_id'];
    if (!leadId) continue;

    const ownerName = row['owner_name'] || row['full_name'] || row['name'] ||
      [row['first_name'], row['last_name']].filter(Boolean).join(' ') || null;

    records.push({
      lead_id: leadId,
      phone: phones[0] || null,
      email: emails[0] || null,
      owner_name: ownerName || null
    });
  }
  return records;
}
