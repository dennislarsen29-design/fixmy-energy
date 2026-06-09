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
    const upsertBody = {
      locationId: GHL_LOCATION_ID,
      email:      payload.email      || undefined,
      phone:      phone              || undefined,
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

  // Step 2: Find or create GHL conversation, then send SMS
  // Conversations API uses Version 2021-04-15
  const ghlConvHeaders = Object.assign({}, ghlHeaders, { 'Version': '2021-04-15' });

  let smsStatus = null;
  let convDebug = {};
  if (payload.signLink) {
    try {
      // Search for existing conversation for this contact
      const searchResp = await fetch(
        'https://services.leadconnectorhq.com/conversations/search?locationId=' + GHL_LOCATION_ID + '&contactId=' + contactId,
        { headers: ghlConvHeaders }
      );
      const searchRaw = await searchResp.text();
      let searchData; try { searchData = JSON.parse(searchRaw); } catch(e) { searchData = {}; }
      convDebug.searchStatus = searchResp.status;
      convDebug.searchSnippet = searchRaw.slice(0, 200);
      console.log('GHL conv search:', searchResp.status, searchRaw.slice(0, 300));

      let conversationId = (searchResp.ok && searchData.conversations && searchData.conversations[0] && searchData.conversations[0].id) || null;

      if (!conversationId) {
        // No existing conversation — create one
        const createResp = await fetch('https://services.leadconnectorhq.com/conversations/', {
          method: 'POST', headers: ghlConvHeaders,
          body: JSON.stringify({ locationId: GHL_LOCATION_ID, contactId })
        });
        const createRaw = await createResp.text();
        let createData; try { createData = JSON.parse(createRaw); } catch(e) { createData = {}; }
        conversationId = (createData.conversation && createData.conversation.id) || createData.id || createData.conversationId;
        convDebug.createStatus = createResp.status;
        convDebug.createSnippet = createRaw.slice(0, 200);
        console.log('GHL conv create:', createResp.status, createRaw.slice(0, 300));
      }

      if (conversationId) {
        const firstName  = payload.firstName || 'there';
        const feeDisplay = payload.diagnostic_fee ? ' ($' + payload.diagnostic_fee + ')' : '';
        const smsMessage =
          'Hi ' + firstName + '! Your Solar Review Diagnostic Agreement' + feeDisplay + ' is ready.\n\n' +
          'Tap here to review, sign, and pay:\n' + payload.signLink + '\n\n' +
          'Questions? Call (619) 777-6527. — Solar Review Corp';

        const smsMsgBody = { type: 'SMS', conversationId, message: smsMessage };
        if (GHL_FROM_NUMBER) smsMsgBody.fromNumber = GHL_FROM_NUMBER;
        if (phone) smsMsgBody.toNumber = phone;

        const smsResp = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
          method: 'POST', headers: ghlConvHeaders, body: JSON.stringify(smsMsgBody)
        });
        smsStatus = smsResp.status;
        const smsBody = await smsResp.text();
        convDebug.smsBody = smsBody.slice(0, 300);
        console.log('GHL SMS send:', smsStatus, smsBody.slice(0, 300));
      } else {
        convDebug.error = 'no conversationId from search or create';
        console.warn('GHL: could not get or create a conversation — SMS skipped');
      }
    } catch(e) {
      convDebug.error = e.message;
      console.warn('GHL SMS error (non-fatal):', e.message);
    }
  } else {
    console.log('No signLink in payload — SMS skipped');
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ success: true, contactId, smsStatus, convDebug })
  };
};
