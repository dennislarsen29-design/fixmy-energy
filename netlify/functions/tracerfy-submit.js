// tracerfy-submit.js
// Accepts { leads: [{id, address}, ...] }, POSTs to Tracerfy skip-trace API.
// Builds multipart/form-data manually — avoids FormData/Blob issues in Node.js 18.
// Returns { queue_id, estimated_wait_seconds, count } on success.
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

  let leads;
  try {
    const body = JSON.parse(event.body || '{}');
    leads = Array.isArray(body.leads) ? body.leads : [];
  } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!leads.length) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No leads provided' }) };

  function parseFullAddress(fullAddr) {
    const s = String(fullAddr || '').trim();
    const m = s.match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?$/);
    if (m) return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
    const m2 = s.match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2})$/);
    if (m2) return { street: m2[1].trim(), city: m2[2].trim(), state: m2[3].toUpperCase(), zip: '' };
    const parts = s.split(',');
    return { street: (parts[0] || s).trim(), city: (parts[1] || 'San Diego').trim(), state: 'CA', zip: '' };
  }

  function csvEsc(v) {
    const s = String(v == null ? '' : v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // Build CSV content
  const rows = ['lead_id,street_address,city,state,zip'];
  for (const lead of leads) {
    const a = parseFullAddress(lead.address);
    rows.push([csvEsc(lead.id), csvEsc(a.street), csvEsc(a.city), a.state, a.zip].join(','));
  }
  const csvContent = rows.join('\r\n');

  // Build multipart/form-data body manually (avoids FormData+Blob Node.js 18 issues)
  const boundary = '----TracerfyBoundary' + Date.now().toString(36);
  const CRLF = '\r\n';

  function textPart(name, value) {
    return '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="' + name + '"' + CRLF + CRLF +
      value + CRLF;
  }

  const multipartBody =
    '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="csv_file"; filename="leads.csv"' + CRLF +
    'Content-Type: text/csv' + CRLF + CRLF +
    csvContent + CRLF +
    textPart('address_column', 'street_address') +
    textPart('city_column', 'city') +
    textPart('state_column', 'state') +
    textPart('zip_column', 'zip') +
    textPart('trace_type', 'normal') +
    '--' + boundary + '--' + CRLF;

  try {
    const resp = await fetch('https://tracerfy.com/v1/api/trace/', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      body: multipartBody
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch(e) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Tracerfy non-JSON: ' + text.slice(0, 300) }) };
    }
    if (!resp.ok) {
      const detail = (typeof data === 'object' && data !== null)
        ? (data.detail || data.message || data.error || JSON.stringify(data).slice(0, 300))
        : text.slice(0, 300);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Tracerfy HTTP ' + resp.status + ': ' + detail }) };
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({
      queue_id: data.queue_id || data.id,
      estimated_wait_seconds: data.estimated_wait_seconds || 120,
      count: leads.length
    }) };
  } catch(e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
