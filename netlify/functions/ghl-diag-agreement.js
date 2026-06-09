// Creates/updates the GHL contact directly via API, then sends SMS to customer with sign link.
// NOTE: The old "send-diag-agreement" tag flow (GHL agreement workflow) has been removed.
// sign.html is the authoritative agreement; GHL agreement is retired.
exports.handler = async function(event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const GHL_API_KEY      = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID  = 'gXWwbOVymY0iRfj7c1It';
  const GHL_FROM_NUMBER  = process.env.GHL_SMS_FROM_NUMBER || undefined;

  if (!GHL_API_KEY) {
    console.error('GHL_API_KEY env var not set');
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'GHL_API_KEY not configured' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Normalize phone to E.164 (+1XXXXXXXXXX) so GHL SMS delivery works
  function toE164(raw) {
    if (!raw) return undefined;
    var digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits[0] === '1') return '+' + digits;
    return '+' + digits;
  }

  const phone = toE164(payload.phone);
  console.log('GHL diag-agreement → upserting contact:', payload.email, phone, 'fee:', payload.diagnostic_fee);

  const ghlHeaders = {
    'Authorization': 'Bearer ' + GHL_API_KEY,
    'Content-Type':  'application/json',
    'Version':       '2021-07-28'
  };

  // Step 1: Upsert contact
  let contactId;
  try {
    const customFields = [];
    if (payload.diagnostic_fee) customFields.push({ key: 'diagnostic_fee', field_value: String(payload.diagnostic_fee) });
    if (payload.signLink)       customFields.push({ key: 'sign_link_url',   field_value: payload.signLink });

    const upsertBody = {
      locationId:   GHL_LOCATION_ID,
      email:        payload.email      || undefined,
      phone:        phone              || undefined,
      firstName:    payload.firstName  || undefined,
      lastName:     payload.lastName   || undefined,
      address1:     payload.address1   || undefined,
      customFields: customFields.length ? customFields : undefined
    };

    const upsertResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method:  'POST',
      headers: ghlHeaders,
      body:    JSON.stringify(upsertBody)
    });

    const upsertData = await upsertResp.json();
    console.log('GHL upsert status:', upsertResp.status, JSON.stringify(upsertData));

    if (!upsertResp.ok) {
      return {
        statusCode: 502,
        headers: cors,
        body: JSON.stringify({ error: 'GHL contact upsert failed', detail: upsertData })
      };
    }

    contactId = upsertData.contact && upsertData.contact.id;
  } catch(e) {
    console.error('GHL upsert error:', e.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL upsert error', detail: e.message }) };
  }

  if (!contactId) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL upsert returned no contact id' }) };
  }

  // Step 2: Add tag to trigger GHL workflow → workflow sends SMS via LC Phone
  // This avoids the unreliable conversations API entirely.
  // Required GHL workflow: trigger = tag "send-sign-link-sms" → send SMS using
  //   {{contact.sign_link_url}} → then remove tag so re-sends re-trigger it.
  let tagStatus = null;
  let tagBody = '';
  if (payload.signLink) {
    try {
      const tagResp = await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/tags', {
        method:  'POST',
        headers: ghlHeaders,
        body:    JSON.stringify({ tags: ['send-sign-link-sms'] })
      });
      tagStatus = tagResp.status;
      tagBody   = (await tagResp.text()).slice(0, 200);
      console.log('GHL tag add:', tagStatus, tagBody);
    } catch(e) {
      console.warn('GHL tag error (non-fatal):', e.message);
      tagBody = e.message;
    }
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ success: true, contactId, tagStatus, tagBody })
  };
};
