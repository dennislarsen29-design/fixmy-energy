const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  var payload;
  try { payload = JSON.parse(event.body || '{}'); } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  var { firstName, lastName, email, phone, rep_id } = payload;
  if (!rep_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing rep_id' }) };
  }

  var supabase = createClient(
    process.env.SUPA_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co',
    process.env.SUPA_SERVICE_KEY
  );

  var insertData = {
    first_name: firstName || null,
    last_name: lastName || null,
    email: email || null,
    phone: phone || null,
    rep_id: rep_id,
    lead_source: 'qr_canvass',
    lead_category: 'fixmy',
    step: 1,
    created_at: new Date().toISOString()
  };

  // Upsert by email if provided, otherwise insert new
  var result;
  if (email) {
    result = await supabase
      .from('customers')
      .upsert(insertData, { onConflict: 'email', ignoreDuplicates: false });
  } else {
    result = await supabase.from('customers').insert(insertData);
  }

  if (result.error) {
    console.error('qr-lead insert error:', result.error);
    return { statusCode: 500, body: JSON.stringify({ error: result.error.message }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: true })
  };
};
