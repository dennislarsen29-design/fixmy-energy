// Called after Stripe payment succeeds — verifies payment, updates Supabase, fires GHL webhook.
// ENV vars required: STRIPE_SECRET_KEY, SUPA_SERVICE_KEY, GHL_API_KEY

const SUPA_URL        = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const GHL_LOCATION_ID = 'gXWwbOVymY0iRfj7c1It';
const GHL_FROM_NUMBER = process.env.GHL_SMS_FROM_NUMBER || undefined;

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const SUPA_SERVICE_KEY  = process.env.SUPA_SERVICE_KEY;
  const GHL_API_KEY       = process.env.GHL_API_KEY;

  if (!STRIPE_SECRET_KEY || !SUPA_SERVICE_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { token, paymentIntentId, signature, signedAt, repairAuthInitial, signingLocation } = body;
  if (!token || !paymentIntentId || !signature) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'token, paymentIntentId and signature required' }) };
  }

  // Capture signing IP and user-agent server-side (for audit trail / legal enforceability)
  const signingIp = (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
                 || event.headers['client-ip']
                 || 'unknown';
  const signingUserAgent = event.headers['user-agent'] || 'unknown';
  const actualSignedAt = signedAt || new Date().toISOString();

  // Verify Stripe PaymentIntent succeeded
  const piResp = await fetch('https://api.stripe.com/v1/payment_intents/' + paymentIntentId, {
    headers: { 'Authorization': 'Basic ' + Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64') }
  });
  const pi = await piResp.json();

  if (pi.status !== 'succeeded') {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Payment not confirmed: ' + pi.status }) };
  }

  // Verify PaymentIntent belongs to this token
  if (pi.metadata?.token !== token) {
    return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Token mismatch' }) };
  }

  const customerId = pi.metadata?.customer_id;
  if (!customerId) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No customer_id in payment metadata' }) };
  }

  const supaHeaders = {
    'apikey': SUPA_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    'Content-Type': 'application/json',
  };

  // Fetch customer record
  const cResp = await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + customerId + '&select=id,first_name,last_name,email,phone,address,invoice_amount,sold_type&limit=1', {
    headers: supaHeaders
  });
  const cRows = await cResp.json();
  const c = Array.isArray(cRows) && cRows[0];
  if (!c) {
    return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Customer not found' }) };
  }

  // Mark as paid + signed, record audit trail, clear sign token
  const updates = {
    invoice_status: 'paid',
    agreement_status: 'signed',
    sold_type: c.sold_type || 'diagnostic',
    sign_token: null,
    sign_token_expires_at: null,
    agreement_signed_at: actualSignedAt,
    agreement_signature: signature,
    repair_auth_initial: repairAuthInitial || null,
    agreement_ip: signingIp,
    agreement_user_agent: signingUserAgent,
  };

  // The payment is already captured in Stripe at this point. If this DB write
  // fails we must NOT report success to the client (it would show a certificate
  // claiming everything is recorded when invoice_status is still unpaid). Return
  // an error so the client can retry; this handler is idempotent (it re-verifies
  // the PaymentIntent every call), so retrying is safe.
  const patchResp = await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + customerId, {
    method: 'PATCH',
    headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(updates)
  });
  if (!patchResp.ok) {
    const detail = await patchResp.text().catch(function(){ return ''; });
    console.error('sign-complete: DB write FAILED after payment captured for', customerId, patchResp.status, detail.slice(0, 300));
    return { statusCode: 502, headers: cors, body: JSON.stringify({
      error: 'Payment captured but recording failed', paymentCaptured: true, customerId, detail: detail.slice(0, 200)
    }) };
  }

  console.log('sign-complete: paid+signed for', c.first_name, c.last_name, '(', customerId, ') from IP', signingIp);

  // Fire GHL webhook to notify agreement signed + invoice paid
  if (GHL_API_KEY) {
    const ghlHeaders = {
      'Authorization': 'Bearer ' + GHL_API_KEY,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };
    // Conversations API requires Version 2021-04-15 and trailing slash on create
    const ghlConvHeaders = Object.assign({}, ghlHeaders, { 'Version': '2021-04-15' });

    // Normalize phone to E.164 so GHL contact has a dialable number
    function toE164(raw) {
      if (!raw) return undefined;
      var digits = String(raw).replace(/\D/g, '');
      if (digits.length === 10) return '+1' + digits;
      if (digits.length === 11 && digits[0] === '1') return '+' + digits;
      return '+' + digits;
    }

    try {
      const upsertResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({
          locationId: GHL_LOCATION_ID,
          email: c.email || undefined,
          phone: toE164(c.phone),
          firstName: c.first_name || undefined,
          lastName: c.last_name || undefined,
        })
      });
      const upsert = await upsertResp.json();
      const contactId = upsert?.contact?.id;
      if (contactId) {
        await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/tags', {
          method: 'DELETE', headers: ghlHeaders,
          body: JSON.stringify({ tags: ['diag-signed-and-paid'] })
        });
        await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/tags', {
          method: 'POST', headers: ghlHeaders,
          body: JSON.stringify({ tags: ['diag-signed-and-paid'] })
        });

        // SMS confirmation to customer
        try {
          let conversationId = null;
          const searchResp = await fetch(
            'https://services.leadconnectorhq.com/conversations/search?locationId=' + GHL_LOCATION_ID + '&contactId=' + contactId,
            { headers: ghlConvHeaders }
          );
          const searchRaw2 = await searchResp.text();
          let searchData;
          try { searchData = JSON.parse(searchRaw2); } catch(e) { searchData = {}; }
          console.log('sign-complete: conversation search status:', searchResp.status, searchRaw2.slice(0, 200));
          if (searchResp.status >= 400) {
            console.warn('sign-complete: conversations search failed', searchResp.status);
            // skip SMS — non-fatal
          } else {
            conversationId = (searchData.conversations && searchData.conversations[0] && searchData.conversations[0].id) || null;
            if (!conversationId) {
              const createResp = await fetch('https://services.leadconnectorhq.com/conversations/', {
                method: 'POST', headers: ghlConvHeaders,
                body: JSON.stringify({ locationId: GHL_LOCATION_ID, contactId, type: 'SMS' })
              });
              const createRaw = await createResp.text();
              let createData;
              try { createData = JSON.parse(createRaw); } catch(e) { createData = {}; }
              conversationId = (createData.conversation && createData.conversation.id) || createData.id;
              console.log('sign-complete: create conversation status:', createResp.status, createRaw.slice(0, 300));
            }
          }
          if (conversationId) {
            const firstName = c.first_name || 'there';
            const smsConfirm =
              'Hi ' + firstName + '! Your Solar Review Diagnostic agreement is signed and payment confirmed. ' +
              "We'll reach out shortly to confirm your appointment. " +
              'Questions? Call (619) 777-6527. — Solar Review Corp';
            const smsMsgBody = { type: 'SMS', conversationId, message: smsConfirm };
            if (GHL_FROM_NUMBER) smsMsgBody.fromNumber = GHL_FROM_NUMBER;
            if (c.phone) smsMsgBody.toNumber = toE164(c.phone);
            const smsResp = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
              method: 'POST', headers: ghlConvHeaders,
              body: JSON.stringify(smsMsgBody)
            });
            const smsTxt = await smsResp.text();
            console.log('sign-complete: confirmation SMS status:', smsResp.status, smsTxt);
          }
        } catch(e) { console.error('GHL SMS confirmation error:', e.message); }

        // Email confirmation — fires GHL workflow: Tag Added "send-payment-confirmation"
        try {
          await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/tags', {
            method: 'DELETE', headers: ghlHeaders,
            body: JSON.stringify({ tags: ['send-payment-confirmation'] })
          });
          await fetch('https://services.leadconnectorhq.com/contacts/' + contactId + '/tags', {
            method: 'POST', headers: ghlHeaders,
            body: JSON.stringify({ tags: ['send-payment-confirmation'] })
          });
        } catch(e) { console.error('GHL email tag error:', e.message); }
      }
    } catch(e) { console.error('GHL post-payment tag error:', e.message); }
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({
      ok: true,
      customerId,
      signedAt: actualSignedAt,
      signingIp,
      customerName: ((c.first_name || '') + ' ' + (c.last_name || '')).trim(),
      email: c.email || '',
      paymentIntentId,
    })
  };
};
