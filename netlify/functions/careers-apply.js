const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

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

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  const GHL_API_KEY      = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID  = 'gXWwbOVymY0iRfj7c1It';

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { first_name, last_name, email, phone, city, zip, sales_experience, why_solar, source } = body;
  const position = body.position === 'setter' ? 'setter' : 'consultant';

  if (!first_name || !email || !phone) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'first_name, email, and phone are required' }) };
  }

  const supaHeaders = {
    'apikey': SUPA_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // 1. Save to Supabase candidates table
  const insertResp = await fetch(SUPA_URL + '/rest/v1/candidates', {
    method: 'POST',
    headers: supaHeaders,
    body: JSON.stringify({ first_name, last_name, email, phone, city, zip, sales_experience, why_solar, position, source: source || 'website' })
  });

  if (!insertResp.ok) {
    const err = await insertResp.text();
    console.error('Supabase insert error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to save application' }) };
  }

  const inserted = await insertResp.json();
  const candidateId = (inserted[0] || {}).id;

  // 2. Upsert to GHL + tag as candidate (non-fatal if fails)
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
          tags:       position === 'setter' ? ['candidate-applied', 'candidate-applied-setter'] : ['candidate-applied']
        })
      });

      const ghlData = await upsertResp.json();
      const contactId = ghlData && ghlData.contact && ghlData.contact.id;

      if (contactId && candidateId) {
        await fetch(SUPA_URL + '/rest/v1/candidates?id=eq.' + candidateId, {
          method: 'PATCH',
          headers: supaHeaders,
          body: JSON.stringify({ ghl_contact_id: contactId })
        });
      }
    } catch(e) {
      console.error('GHL upsert error (non-fatal):', e.message);
    }
  }

  // 3. Tell Dennis right away — SMS (to his team_members phone) + email. Awaited so the function
  //    can't be frozen before they send; failures are logged and never fail the application.
  //    (2026-10-16, per Dennis — Robert Larson applied and nobody was notified.)
  try {
    const notify = require('./lib/notify');
    const name = (first_name + ' ' + (last_name || '')).trim();
    const roleLbl = position === 'setter' ? 'Setter' : 'Consultant';
    const where = [city, zip].filter(Boolean).join(' ');
    let dennisPhone = null;
    try {
      const tr = await fetch(SUPA_URL + '/rest/v1/team_members?id=eq.tech4&select=phone&limit=1', { headers: supaHeaders });
      const tj = await tr.json().catch(function () { return []; });
      dennisPhone = tj && tj[0] && tj[0].phone;
    } catch (e) { console.error('careers notify phone lookup:', e.message); }
    const smsText = 'New ' + roleLbl + ' applicant: ' + name + (where ? ' (' + where + ')' : '') + ' — ' + phone + '. Open Administration > Hiring to review.';
    const jobs = [];
    if (dennisPhone) jobs.push(notify.sendSms({ phone: dennisPhone, first_name: 'Dennis' }, smsText).then(function (r) { if (!r.ok) console.error('careers sms failed:', r.reason); return r; }));
    else console.error('careers sms skipped: no phone on file for tech4');
    const to = process.env.AGENT_REPORT_EMAIL || 'dennislarsen29@gmail.com';
    const esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
    jobs.push(notify.sendEmail({ email: to }, 'New ' + roleLbl + ' applicant: ' + name, 'New ' + roleLbl + ' application',
      ['<b>' + esc(name) + '</b>' + (where ? ' &middot; ' + esc(where) : ''), 'Email: ' + esc(email) + '<br>Phone: ' + esc(phone),
       sales_experience ? 'Experience: ' + esc(sales_experience) : '', why_solar ? 'In their words: &ldquo;' + esc(why_solar) + '&rdquo;' : ''].filter(Boolean),
      { url: 'https://fixmy.energy/portal', label: 'Open Hiring in the portal' }).then(function (r) { if (!r.ok) console.error('careers email failed:', r.reason); return r; }));
    await Promise.all(jobs);
  } catch (e) { console.error('careers notify error (non-fatal):', e.message); }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ success: true, id: candidateId })
  };
};
