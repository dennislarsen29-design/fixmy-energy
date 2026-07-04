// Fired by the portal when a Black Box knock/dial outcome is 'interested' or
// 'callback'. Upserts the contact into GHL with the 'bb-followup' tag (plus a
// 'bb-interested' / 'bb-callback' outcome tag) so a GHL workflow can send the
// same-day follow-up SMS while the rep's visit is still fresh.
//
// The tags are deliberately NEW, dedicated tags — never reuse workflow-trigger
// tags like 'send-diag-agreement'. They do nothing until a GHL workflow is
// built on them: Automations → New → Trigger: Contact Tag Added → bb-followup
// → Send SMS (LC Phone).
//
// ENV vars required: GHL_API_KEY, GHL_LOCATION_ID
exports.handler = async function(event) {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const GHL_API_KEY     = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'gXWwbOVymY0iRfj7c1It';
  if (!GHL_API_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'GHL_API_KEY not configured' }) };
  }

  let p;
  try { p = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const outcome = (p.outcome || '').toLowerCase();
  if (outcome !== 'interested' && outcome !== 'callback') {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ skipped: 'outcome not followup-eligible' }) };
  }

  // A phone is required — the follow-up channel is SMS.
  let digits = String(p.phone || '').replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  if (digits.length !== 10) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ skipped: 'no valid phone' }) };
  }

  const body = {
    locationId: GHL_LOCATION_ID,
    phone:      '+1' + digits,
    email:      (p.email && !String(p.email).endsWith('@pending.fixmy.energy')) ? p.email : undefined,
    firstName:  p.firstName || p.first_name || undefined,
    lastName:   p.lastName  || p.last_name  || undefined,
    address1:   p.address   || undefined,
    source:     'Black Box Follow-Up',
    tags:       ['bb-followup', 'bb-' + outcome]
  };

  try {
    const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GHL_API_KEY,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify(body)
    });
    const detail = r.ok ? undefined : (await r.text()).slice(0, 300);
    if (!r.ok) console.error('ghl-bb-followup: upsert failed', r.status, detail);
    return { statusCode: r.ok ? 200 : 502, headers: cors, body: JSON.stringify({ ok: r.ok, status: r.status, detail }) };
  } catch(e) {
    console.error('ghl-bb-followup:', e.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
