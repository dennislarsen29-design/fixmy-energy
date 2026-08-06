// tracerfy-results.js
// Accepts { queue_id }, checks Tracerfy job status via GET /v1/api/queues/,
// then downloads the CSV and parses lead_id + contact fields when complete.
// Returns { status: 'pending' } or { status: 'complete', records, credits_deducted }
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

  const authHeaders = { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' };

  try {
    // GET /v1/api/queues/ returns queue status (pending, download_url).
    // GET /v1/api/queue/:id returns person records only — no status fields.
    // We check page 1 (most recent 100) then page 2 as fallback.
    let queueData = null;
    for (let page = 1; page <= 2 && !queueData; page++) {
      const r = await fetch(`https://tracerfy.com/v1/api/queues/?page=${page}`, { headers: authHeaders });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Queues HTTP ' + r.status, raw: t.slice(0, 200) }) };
      }
      const list = await r.json();
      if (Array.isArray(list)) {
        queueData = list.find(q => String(q.id) === String(queueId)) || null;
        if (list.length < 100) break; // no more pages
      }
    }

    if (!queueData) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'pending', note: 'Queue not yet visible — check back in a moment' }) };
    }

    // Still processing
    if (queueData.pending || !queueData.download_url) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'pending' }) };
    }

    // Complete — download the CSV
    const csvResp = await fetch(queueData.download_url);
    if (!csvResp.ok) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'CSV download failed: HTTP ' + csvResp.status }) };
    }
    const csvText = await csvResp.text();
    const records = parseResultsCsv(csvText);

    return { statusCode: 200, headers: cors, body: JSON.stringify({
      status: 'complete',
      records,
      rows_uploaded: queueData.rows_uploaded || records.length,
      credits_deducted: queueData.credits_deducted || null
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

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });

    const leadId = row['lead_id'] || null;
    // Tracerfy advanced trace does not echo back custom columns — fall back to street address matching
    const streetAddr = (row['street_address'] || row['address'] || '').trim();
    if (!leadId && !streetAddr) continue;

    const phone = row['primary_phone'] || row['mobile_1'] || row['landline_1'] || null;
    const email = row['email_1'] || null;

    // Advanced trace returns first_name + last_name for the property owner
    const firstName = row['first_name'] || row['owner_1_first_name'] || '';
    const lastName  = row['last_name']  || row['owner_1_last_name']  || '';
    const ownerName = [firstName, lastName].filter(Boolean).join(' ') || null;

    // DNC flag — Tracerfy may use any of these field names across CSV versions
    const dncRaw = row['do_not_call'] || row['dnc'] || row['primary_phone_dnc'] || row['mobile_1_dnc'] || row['phone_dnc'] || '';
    const dnc = ['true', 'yes', '1', 'y'].includes(dncRaw.toLowerCase().trim());

    if (phone || email || ownerName) {
      // zip is carried through so the client can match on street+zip — street alone is
      // ambiguous across a multi-county batch.
      records.push({ lead_id: leadId, street_address: streetAddr,
                     zip: row['zip'] || row['zip_code'] || row['zipcode'] || '',
                     phone, email, owner_name: ownerName, dnc });
    }
  }
  return records;
}
