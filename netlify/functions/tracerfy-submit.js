// tracerfy-submit.js
// Accepts { leads: [{id, address}, ...] }, POSTs to Tracerfy via JSON body
// (avoids FormData/Blob issues in Node.js 18).
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
    // "123 Main St, San Diego, CA 92101"
    const m = s.match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?$/);
    if (m) return { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] };
    // "123 Main St, San Diego, CA"
    const m2 = s.match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2})$/);
    if (m2) return { street: m2[1].trim(), city: m2[2].trim(), state: m2[3].toUpperCase(), zip: '' };
    // fallback
    const parts = s.split(',');
    return { street: (parts[0] || s).trim(), city: (parts[1] || 'San Diego').trim(), state: 'CA', zip: '' };
  }

  // Build records array — json_data is the alternative to csv_file upload
  const records = leads.map(function(lead) {
    const a = parseFullAddress(lead.address);
    return { lead_id: String(lead.id), street_address: a.street, city: a.city, state: a.state, zip: a.zip };
  });

  try {
    const resp = await fetch('https://tracerfy.com/v1/api/trace/', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        json_data: records,
        address_column: 'street_address',
        city_column: 'city',
        state_column: 'state',
        zip_column: 'zip',
        trace_type: 'normal'
      })
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch(e) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Tracerfy non-JSON: ' + text.slice(0, 200) }) };
    }
    if (!resp.ok) {
      const detail = (typeof data === 'object' && data !== null)
        ? (data.detail || data.message || data.error || JSON.stringify(data).slice(0, 200))
        : text.slice(0, 200);
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
