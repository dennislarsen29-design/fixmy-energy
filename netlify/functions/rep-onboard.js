const SUPA_URL       = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const GHL_LOCATION_ID = 'gXWwbOVymY0iRfj7c1It';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function randomCode(len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var result = '';
  for (var i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function toE164(raw) {
  if (!raw) return undefined;
  var digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return '+' + digits;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  const GHL_API_KEY      = process.env.GHL_API_KEY;

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { full_name, preferred_name, email, phone, market, role_type, source, ec_name, ec_phone } = body;

  if (!full_name || !email || !phone || !market) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'full_name, email, phone, and market are required' }) };
  }

  const supaHeaders = {
    'apikey':        SUPA_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation'
  };

  // Check for duplicate email
  const dupResp = await fetch(SUPA_URL + '/rest/v1/team_members?email=eq.' + encodeURIComponent(email) + '&select=id', { headers: supaHeaders });
  const dupData = dupResp.ok ? await dupResp.json() : [];
  if (Array.isArray(dupData) && dupData.length > 0) {
    return { statusCode: 409, headers: CORS, body: JSON.stringify({ error: 'An account with this email already exists. Contact dennis@fixmy.energy if you need help logging in.' }) };
  }

  // Generate credentials
  var repId   = 'tech_' + randomCode(6).toLowerCase();
  var repCode = randomCode(8);
  var displayName = preferred_name || full_name.split(' ')[0];

  // 1. Insert into team_members
  const insertResp = await fetch(SUPA_URL + '/rest/v1/team_members', {
    method:  'POST',
    headers: supaHeaders,
    body:    JSON.stringify({
      id:         repId,
      name:       full_name,
      email:      email,
      code:       repCode,
      role:       'tech',
      active:     true,
      phone:      phone,
      market:     market,
      role_type:  role_type,
      source:     source || 'onboarding',
      ec_name:    ec_name  || null,
      ec_phone:   ec_phone || null
    })
  });

  if (!insertResp.ok) {
    const err = await insertResp.text();
    console.error('team_members insert error:', err);
    // If column doesn't exist (schema mismatch), retry with minimal fields
    const retryResp = await fetch(SUPA_URL + '/rest/v1/team_members', {
      method:  'POST',
      headers: supaHeaders,
      body:    JSON.stringify({ id: repId, name: full_name, email, code: repCode, role: 'tech', active: true })
    });
    if (!retryResp.ok) {
      const retryErr = await retryResp.text();
      console.error('team_members retry error:', retryErr);
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to create account. Please email dennis@fixmy.energy.' }) };
    }
  }

  // 2. Mark matching candidate as hired (non-fatal)
  try {
    await fetch(SUPA_URL + '/rest/v1/candidates?email=eq.' + encodeURIComponent(email), {
      method:  'PATCH',
      headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
      body:    JSON.stringify({ status: 'hired' })
    });
  } catch(e) {
    console.warn('Could not update candidate status:', e.message);
  }

  // 3. GHL upsert + tag (non-fatal)
  if (GHL_API_KEY) {
    try {
      const nameParts = full_name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName  = nameParts.slice(1).join(' ') || undefined;

      const ghlResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + GHL_API_KEY,
          'Content-Type':  'application/json',
          'Version':       '2021-07-28'
        },
        body: JSON.stringify({
          locationId: GHL_LOCATION_ID,
          firstName,
          lastName,
          email,
          phone:      toE164(phone),
          source:     'rep-onboarding',
          tags:       ['rep-onboarded', 'send-rep-welcome'],
          customField: {
            rep_id:    repId,
            rep_code:  repCode,
            market:    market,
            role_type: role_type
          }
        })
      });

      if (!ghlResp.ok) {
        const ghlErr = await ghlResp.text();
        console.warn('GHL upsert warning:', ghlErr);
      }
    } catch(e) {
      console.warn('GHL upsert exception (non-fatal):', e.message);
    }
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({
      success:    true,
      id:         repId,
      portal_url: 'https://fixmy.energy/portal'
    })
  };
};
