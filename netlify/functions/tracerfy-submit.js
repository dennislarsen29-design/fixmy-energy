// tracerfy-submit.js
// Accepts { leads: [{id, address}, ...] }, builds a CSV, POSTs to Tracerfy skip-trace API.
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

  function csvEsc(v) {
    const s = String(v == null ? '' : v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const rows = ['lead_id,street_address,city,state,zip'];
  for (const lead of leads) {
    const a = parseFullAddress(lead.address);
    rows.push([csvEsc(lead.id), csvEsc(a.street), csvEsc(a.city), a.state, a.zip].join(','));
  }
  const csvContent = rows.join('\n');

  const formData = new FormData();
  formData.append('csv_file', new Blob([csvContent], { type: 'text/csv' }), 'leads.csv');
  formData.append('address_column', 'street_address');
  formData.append('city_column', 'city');
  formData.append('state_column', 'state');
  formData.append('trace_type', 'normal');

  try {
    const resp = await fetch('https://tracerfy.com/v1/api/trace/', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: formData
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch(e) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'Tracerfy non-JSON response', raw: text.slice(0, 300) }) };
    }
    if (!resp.ok) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: data.detail || data.message || ('Tracerfy HTTP ' + resp.status), raw: data }) };
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
