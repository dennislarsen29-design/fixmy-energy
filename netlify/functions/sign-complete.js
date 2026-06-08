// Called after Stripe payment succeeds — verifies payment, updates Supabase, fires GHL webhook.
// ENV vars required: STRIPE_SECRET_KEY, SUPA_SERVICE_KEY, GHL_API_KEY

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const GHL_LOCATION_ID = 'gXWwbOVymY0iRfj7c1It';

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

  await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + customerId, {
    method: 'PATCH',
    headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify(updates)
  });

  console.log('sign-complete: paid+signed for', c.first_name, c.last_name, '(', customerId, ') from IP', signingIp);

  // Fire GHL webhook to notify agreement signed + invoice paid
  if (GHL_API_KEY) {
    const ghlHeaders = {
      'Authorization': 'Bearer ' + GHL_API_KEY,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    };
    try {
      const upsertResp = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({
          locationId: GHL_LOCATION_ID,
          email: c.email || undefined,
          phone: c.phone || undefined,
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
