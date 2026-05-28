const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  var payload;
  try { payload = JSON.parse(event.body || '{}'); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var firstName = payload.firstName || null;
  var lastName = payload.lastName || null;
  var email = payload.email || null;
  var phone = payload.phone || null;
  var rep_id = payload.rep_id;

  if (!rep_id) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing rep_id' }) };
  }

  var SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  var body = JSON.stringify({
    first_name: firstName,
    last_name: lastName,
    email: email,
    phone: phone,
    rep_id: rep_id,
    lead_source: 'qr_canvass',
    lead_category: 'fixmy',
    step: 1,
    created_at: new Date().toISOString()
  });

  var resp = await fetch(SUPA_URL + '/rest/v1/customers', {
    method: 'POST',
    headers: {
      'apikey': SUPA_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: body
  });

  if (!resp.ok) {
    var errText = await resp.text();
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: errText }) };
  }

  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
};
