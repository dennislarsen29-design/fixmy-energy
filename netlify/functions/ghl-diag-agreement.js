// Creates/updates the GHL contact directly via API, then adds a tag to trigger
// the "send-diag-agreement" workflow — bypasses the broken Inbound Webhook
// Mapping Reference that prevents trigger.body.* variables from resolving.
exports.handler = async function(event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const GHL_API_KEY    = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID = 'gXWwbOVymY0iRfj7c1It';
  const TRIGGER_TAG     = 'send-diag-agreement';

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
    const upsertBody = {
      locationId: GHL_LOCATION_ID,
      email:      payload.email      || undefined,
      phone:      phone                || undefined,
      firstName:  payload.firstName  || undefined,
      lastName:   payload.lastName   || undefined,
      address1:   payload.address1   || undefined,
      customFields: payload.diagnostic_fee ? [
        { key: 'diagnostic_fee', field_value: String(payload.diagnostic_fee) }
      ] : undefined
    };

    const upsertResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method:  'POST',
      headers: ghlHeaders,
      body:    JSON.stringify(upsertBody)
    });

    const upsertData = await upsertResp.json();
    console.log('GHL upsert status:', upsertResp.status, JSON.stringify(upsertData).slice(0, 200));

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

  // Step 2: Remove tag first so "Tag Added" fires even on re-runs for the same contact
  try {
    await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/tags', {
      method:  'DELETE',
      headers: ghlHeaders,
      body:    JSON.stringify({ tags: [TRIGGER_TAG] })
    });
  } catch(e) {
    console.warn('GHL tag removal (pre-clean) error (non-fatal):', e.message);
  }

  // Step 3: Add trigger tag — fires "Tag Added: send-diag-agreement" workflow in GHL
  let tagStatus;
  try {
    const tagResp = await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/tags', {
      method:  'POST',
      headers: ghlHeaders,
      body:    JSON.stringify({ tags: [TRIGGER_TAG] })
    });
    tagStatus = tagResp.status;
    const tagBody = await tagResp.text();
    console.log('GHL tag add status:', tagStatus, tagBody);
  } catch(e) {
    console.error('GHL tag add error:', e.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL tag add error', detail: e.message }) };
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ success: true, contactId, tagStatus })
  };
};
