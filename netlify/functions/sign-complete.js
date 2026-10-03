// Called after Stripe payment succeeds — verifies payment, updates Supabase, fires GHL webhook.
// ENV vars required: STRIPE_SECRET_KEY, SUPA_SERVICE_KEY, GHL_API_KEY

const { sendMetaEvent } = require('./lib/meta-capi');
const sigAudit = require('./lib/sig-audit');

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

  const { token, paymentIntentId, signature, repairAuthInitial, signingLocation, fbp, fbc } = body;
  if (!token || !paymentIntentId || !signature) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'token, paymentIntentId and signature required' }) };
  }

  // The drawn / typed-style signature mark (same shape as the portal's document signing).
  // Optional only so a page cached from before this deploy still works; the typed printed
  // name in `signature` is always required. A malformed mark is rejected outright.
  let signatureData = null;
  if (body.signatureData != null) {
    signatureData = sigAudit.validateSignatureData(body.signatureData);
    if (!signatureData) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  // Audit trail captured SERVER-side — values the browser cannot choose. The signing time is
  // the server clock; the old code trusted a client-supplied `signedAt`, which let a client
  // back- or forward-date its own signature (and so pick which version of the terms applied).
  const signingIp = sigAudit.clientIp(event);
  const signingUserAgent = sigAudit.userAgent(event);
  let actualSignedAt = new Date().toISOString();

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
  const cResp = await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + customerId + '&select=id,first_name,last_name,email,phone,address,invoice_amount,sold_type,sold_at,agreement_signed_at,agreement_audit&limit=1', {
    headers: supaHeaders
  });
  const cRows = await cResp.json();
  const c = Array.isArray(cRows) && cRows[0];
  if (!c) {
    return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Customer not found' }) };
  }

  // Idempotent retries: the client retries this call after cold starts / dropped responses. If THIS
  // PaymentIntent was already recorded, keep the original signing time instead of re-stamping it.
  if (c.agreement_audit && c.agreement_audit.payment_intent === paymentIntentId && c.agreement_signed_at) {
    const prior = new Date(c.agreement_signed_at);
    if (!isNaN(prior.getTime())) actualSignedAt = prior.toISOString();
  }

  // Mark as paid + signed, record audit trail, clear sign token
  const updates = {
    invoice_status: 'paid',
    agreement_status: 'signed',
    sold_type: c.sold_type || 'diagnostic',
    // sold_at feeds the payroll pay-date math — fill once, never overwrite.
    sold_at: c.sold_at || actualSignedAt,
    sign_token: null,
    sign_token_expires_at: null,
    agreement_signed_at: actualSignedAt,
    agreement_signature: signature,
    repair_auth_initial: repairAuthInitial || null,
    agreement_ip: signingIp,
    agreement_user_agent: signingUserAgent,
    agreement_signature_data: signatureData,
    agreement_audit: (function () {
      const terms = sigAudit.diagTermsFingerprint(actualSignedAt);
      return {
        method: 'card', signed_at: actualSignedAt, ip: signingIp, user_agent: signingUserAgent,
        location: signingLocation || null, printed_name: String(signature).slice(0, 120),
        terms_sha256: terms.sha256, repair_cap: terms.cap,
        signature_sha256: signatureData ? sigAudit.signatureFingerprint(signatureData) : null,
        payment_intent: paymentIntentId
      };
    })(),
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

  const chargedAmount = (pi.amount_received != null ? pi.amount_received : pi.amount) / 100;

  // Record the transaction in the payments ledger (idempotent on the
  // PaymentIntent id — safe across client retries). Non-fatal: the customer
  // flags above are already set, and the nightly reconcile catches gaps.
  try {
    const ledgerResp = await fetch(SUPA_URL + '/rest/v1/payments?on_conflict=stripe_payment_intent_id', {
      method: 'POST',
      headers: { ...supaHeaders, 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        customer_id: customerId,
        amount: chargedAmount,
        currency: pi.currency || 'usd',
        paid_at: new Date((pi.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        method: 'card',
        source: 'stripe_sign_page',
        stripe_payment_intent_id: paymentIntentId,
        note: 'Sign & Pay — includes 3.9% card surcharge',
        recorded_by: 'sign-complete'
      })
    });
    if (!ledgerResp.ok) console.warn('sign-complete: ledger insert failed', ledgerResp.status, (await ledgerResp.text()).slice(0, 200));
  } catch(e) { console.warn('sign-complete: ledger insert error —', e.message); }

  // Auto-seed the standard $300 Diagnostic COGS the moment THIS write is what
  // actually converts the lead (c.sold_type was falsy before the PATCH above —
  // an already-sold lead, e.g. an existing battery_retrofit job, must never get
  // a diagnostic COGS line stomped onto it). Mirrors portal.html's client-side
  // _seedDiagnosticCogs and lib/promote-paid-lead.js's server-side copy — a
  // Sign & Pay conversion is a THIRD path that sets sold_type but never seeded
  // the COGS that makes it (same "manual redline" gap reported for Stefano
  // Palminteri, who converted through one of these other two paths). Idempotent
  // (check-then-insert), non-fatal — the payment is already captured either way.
  if (!c.sold_type) {
    try {
      const existingResp = await fetch(SUPA_URL + '/rest/v1/job_costs?customer_id=eq.' + customerId + '&select=id&limit=1', { headers: supaHeaders });
      const existingCosts = await existingResp.json().catch(function(){ return []; });
      if (!(Array.isArray(existingCosts) && existingCosts.length)) {
        await fetch(SUPA_URL + '/rest/v1/job_costs', {
          method: 'POST',
          headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ customer_id: customerId, label: 'Diagnostic — COGS', amount: 300, status: 'pending', created_by: 'auto-diag-convert' })
        });
      }
    } catch(e) { console.warn('sign-complete: auto-seed diagnostic COGS error —', e.message); }
  }

  // Server-side Meta Conversions API — this is the real dollar-value
  // conversion (a paid, signed diagnostic), and the one worth optimizing ad
  // spend against. Uses the same event id as the client-side fbq('Purchase')
  // fired on sign.html so Meta dedupes rather than double-counting. Never
  // blocks or fails the response — payment is already captured and recorded
  // above by this point.
  try {
    await sendMetaEvent({
      eventName: 'Purchase',
      eventId: 'purchase_' + paymentIntentId,
      eventSourceUrl: 'https://fixmy.energy/sign',
      email: c.email, phone: c.phone, firstName: c.first_name, lastName: c.last_name,
      clientIp: signingIp, userAgent: signingUserAgent,
      fbp, fbc,
      value: chargedAmount, currency: pi.currency || 'usd',
    });
  } catch(e) { console.warn('meta-capi Purchase error:', e.message); }

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
