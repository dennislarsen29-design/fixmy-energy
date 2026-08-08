const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Admin-side counterpart to careers-apply.js: lets the Hiring tab log a
// candidate sourced outside the public careers form (Indeed, referral,
// LinkedIn, walk-in, etc.) where a phone number often isn't available.
exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  if (!SUPA_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { first_name, last_name, email, phone, city, zip, sales_experience, why_solar, notes, status } = body;
  const position = body.position === 'setter' ? 'setter' : 'consultant';

  if (!first_name) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'first_name is required' }) };
  }

  const supaHeaders = {
    'apikey': SUPA_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const insertResp = await fetch(SUPA_URL + '/rest/v1/candidates', {
    method: 'POST',
    headers: supaHeaders,
    body: JSON.stringify({
      first_name, last_name, email, phone, city, zip,
      sales_experience, why_solar, notes, position,
      status: status || 'applied',
      source: body.source || 'manual'
    })
  });

  if (!insertResp.ok) {
    const err = await insertResp.text();
    console.error('Supabase insert error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to save candidate' }) };
  }

  const inserted = await insertResp.json();
  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ success: true, id: (inserted[0] || {}).id })
  };
};
