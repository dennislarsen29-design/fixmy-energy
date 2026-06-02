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

    // 4. Admin SMS notification to Dennis (non-fatal)
    try {
      const ADMIN_PHONE = '+18012328301';
      const marketLabels = { san_diego_ca: 'San Diego CA', augusta_ga: 'Augusta GA', north_augusta_sc: 'North Augusta SC', travel_team: 'Travel Team' };
      const roleLabels   = { local_full_time: 'Full-Time Local', local_part_time: 'Part-Time Local', travel_team: 'Travel Team' };
      const mktLabel  = marketLabels[market]  || market  || 'Unknown Market';
      const roleLabel = roleLabels[role_type] || role_type || 'Unknown Role';

      // Upsert Dennis as GHL contact to get contactId
      const adminUpsert = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + GHL_API_KEY, 'Content-Type': 'application/json', 'Version': '2021-07-28' },
        body: JSON.stringify({ locationId: GHL_LOCATION_ID, firstName: 'Dennis', lastName: 'Larsen', phone: ADMIN_PHONE })
      });
      const adminContact = adminUpsert.ok ? await adminUpsert.json() : null;
      const adminContactId = adminContact && (adminContact.id || (adminContact.contact && adminContact.contact.id));

      if (adminContactId) {
        await fetch('https://services.leadconnectorhq.com/conversations/messages', {
          method:  'POST',
          headers: { 'Authorization': 'Bearer ' + GHL_API_KEY, 'Content-Type': 'application/json', 'Version': '2021-07-28' },
          body: JSON.stringify({
            type:       'SMS',
            contactId:  adminContactId,
            message:    '⚡ New rep onboarded: ' + full_name + ' — ' + mktLabel + ' / ' + roleLabel + '. Visit fixmy.energy/portal → Team & Hiring to complete their setup checklist.'
          })
        });
        console.log('[rep-onboard] Admin SMS sent for', full_name);
      }
    } catch(e) {
      console.warn('Admin SMS exception (non-fatal):', e.message);
    }
  }

  // 5. Welcome email via Resend (non-fatal)
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    try {
      const marketLabels = { san_diego_ca: 'San Diego, CA', augusta_ga: 'Augusta, GA', north_augusta_sc: 'North Augusta, SC', travel_team: 'Travel Team' };
      const mktLabel = marketLabels[market] || market || '';

      await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    'FixMy.Energy <dennis@fixmy.energy>',
          to:      [email],
          subject: 'Welcome to the Team — Your Portal Login',
          html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Helvetica Neue',Arial,sans-serif;color:#f0f0f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr><td style="background:#8DC63F;padding:6px 32px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0f0f0f;">FixMy.Energy</p>
        </td></tr>
        <tr><td style="padding:40px 32px;">
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:700;color:#ffffff;">Welcome, ${displayName}.</h1>
          <p style="margin:0 0 32px;font-size:15px;color:#888;">${mktLabel ? 'Market: ' + mktLabel : ''}</p>

          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#ccc;">Your portal account is ready. Use the credentials below to log in and access your training, leads, and dashboard.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #2a2a2a;border-radius:8px;margin-bottom:32px;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #2a2a2a;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#555;">Portal URL</p>
                <p style="margin:0;font-size:15px;color:#8DC63F;">fixmy.energy/portal</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #2a2a2a;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#555;">Email</p>
                <p style="margin:0;font-size:15px;color:#fff;">${email}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#555;">Access Code</p>
                <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:0.15em;color:#fff;font-family:monospace;">${repCode}</p>
              </td>
            </tr>
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr><td align="center">
              <a href="https://fixmy.energy/portal" style="display:inline-block;background:#8DC63F;color:#0f0f0f;font-weight:700;font-size:15px;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.03em;">Log In to Your Portal →</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:13px;color:#555;line-height:1.6;">Questions? Call or text: <a href="tel:8012328301" style="color:#8DC63F;text-decoration:none;">801-232-8301</a> or email <a href="mailto:info@fixmy.energy" style="color:#8DC63F;text-decoration:none;">info@fixmy.energy</a></p>
          <p style="margin:0;font-size:12px;color:#333;">Solar Review Corp · FixMy.Energy</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
        })
      });
      console.log('[rep-onboard] Welcome email sent to', email);
    } catch(e) {
      console.warn('Resend welcome email exception (non-fatal):', e.message);
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
