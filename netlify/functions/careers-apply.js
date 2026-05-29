const { createClient } = require('@supabase/supabase-js');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function toE164(raw) {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return '+' + digits;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const SUPA_URL         = 'https://kbtobyoumvbcxfbugsid.supabase.co';
  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  const GHL_API_KEY      = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID  = 'gXWwbOVymY0iRfj7c1It';

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { first_name, last_name, email, phone, city, zip, sales_experience, why_solar, source } = body;

  if (!first_name || !email || !phone) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'first_name, email, and phone are required' }) };
  }

  // 1. Save to Supabase
  const supa = createClient(SUPA_URL, SUPA_SERVICE_KEY);
  const { data: candidate, error: supaErr } = await supa
    .from('candidates')
    .insert({ first_name, last_name, email, phone, city, zip, sales_experience, why_solar, source: source || 'website' })
    .select('id')
    .single();

  if (supaErr) {
    console.error('Supabase insert error:', supaErr);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to save application' }) };
  }

  // 2. Upsert to GHL + tag as candidate
  if (GHL_API_KEY) {
    try {
      const ghlHeaders = {
        'Authorization': 'Bearer ' + GHL_API_KEY,
        'Content-Type':  'application/json',
        'Version':       '2021-07-28'
      };

      const upsertResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method:  'POST',
        headers: ghlHeaders,
        body:    JSON.stringify({
          locationId: GHL_LOCATION_ID,
          firstName:  first_name,
          lastName:   last_name   || undefined,
          email:      email,
          phone:      toE164(phone),
          city:       city        || undefined,
          postalCode: zip         || undefined,
          source:     'careers-page',
          tags:       ['candidate-applied']
        })
      });

      const ghlData = await upsertResp.json();
      const contactId = ghlData?.contact?.id;

      if (contactId) {
        await supa.from('candidates').update({ ghl_contact_id: contactId }).eq('id', candidate.id);
      }
    } catch(e) {
      console.error('GHL upsert error (non-fatal):', e.message);
    }
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ success: true, id: candidate.id })
  };
};
