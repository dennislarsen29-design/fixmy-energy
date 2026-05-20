// Notifies an ops partner via GHL when a payment milestone is marked paid.
// Upserts the partner contact in GHL, then adds 'ops-milestone-paid' tag to fire email workflow.
// Payload: { partnerId, partnerName, partnerEmail, customerName, customerAddress,
//            milestone, amount, portalLink }
exports.handler = async function(event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const GHL_API_KEY     = process.env.GHL_API_KEY;
  const GHL_LOCATION_ID = 'gXWwbOVymY0iRfj7c1It';
  const TRIGGER_TAG     = 'ops-milestone-paid';

  // Temporary test override — swap to real partner email in GHL once verified
  // To remove: delete this object and use payload.partnerEmail directly
  const TEST_EMAIL_OVERRIDE = {
    'ops3': 'DennisLarsen@solarpros.io'
  };

  if (!GHL_API_KEY) {
    console.error('GHL_API_KEY env var not set');
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'GHL_API_KEY not configured' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const notifyEmail = TEST_EMAIL_OVERRIDE[payload.partnerId] || payload.partnerEmail;
  const nameParts   = (payload.partnerName || '').split(' ');
  const ghlHeaders  = {
    'Authorization': 'Bearer ' + GHL_API_KEY,
    'Content-Type':  'application/json',
    'Version':       '2021-07-28'
  };

  // Build human-readable payment note stored as a GHL custom field (ops_payment_note).
  // Reference it in the GHL email template as {{contact.ops_payment_note}}.
  const amtStr = payload.amount
    ? '$' + parseFloat(payload.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })
    : '(amount TBD)';
  const paymentNote = [
    payload.milestone + ' — ' + amtStr,
    'Job: ' + (payload.customerName || 'Customer'),
    payload.customerAddress ? payload.customerAddress : '',
    'Your portal: ' + payload.portalLink
  ].filter(Boolean).join('\n');

  console.log('GHL ops-payment → notifying:', notifyEmail, 'for', payload.milestone, amtStr);

  // Step 1: Upsert partner contact with payment note in custom field
  let contactId;
  try {
    const upsertBody = {
      locationId:   GHL_LOCATION_ID,
      email:        notifyEmail,
      firstName:    nameParts[0] || payload.partnerName,
      lastName:     nameParts.slice(1).join(' ') || undefined,
      customFields: [
        { key: 'ops_payment_note', field_value: paymentNote }
      ]
    };
    const upsertResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
      method:  'POST',
      headers: ghlHeaders,
      body:    JSON.stringify(upsertBody)
    });
    const upsertData = await upsertResp.json();
    console.log('GHL upsert status:', upsertResp.status, JSON.stringify(upsertData).slice(0, 200));
    if (!upsertResp.ok) {
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL contact upsert failed', detail: upsertData }) };
    }
    contactId = upsertData.contact && upsertData.contact.id;
  } catch(e) {
    console.error('GHL upsert error:', e.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL upsert error', detail: e.message }) };
  }

  if (!contactId) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL upsert returned no contact id' }) };
  }

  // Step 2: Remove tag first so "Tag Added" fires even for repeat payments on same contact
  try {
    await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/tags', {
      method:  'DELETE',
      headers: ghlHeaders,
      body:    JSON.stringify({ tags: [TRIGGER_TAG] })
    });
  } catch(e) {
    console.warn('GHL pre-clean tag removal (non-fatal):', e.message);
  }

  // Step 3: Add trigger tag → fires "Tag Added: ops-milestone-paid" workflow in GHL
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
    body: JSON.stringify({ success: true, contactId, tagStatus, notifyEmail })
  };
};
