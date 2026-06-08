// Validates a sign_token, creates a Stripe PaymentIntent, returns client_secret.
// Called by sign.html on page load.
// ENV vars required: STRIPE_SECRET_KEY, SUPA_SERVICE_KEY

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const SUPA_SERVICE_KEY  = process.env.SUPA_SERVICE_KEY;

  if (!STRIPE_SECRET_KEY || !SUPA_SERVICE_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  let token;
  try { token = JSON.parse(event.body).token; } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  if (!token) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'token required' }) };

  // Look up customer by token
  const lookupUrl = SUPA_URL + '/rest/v1/customers?sign_token=eq.' + encodeURIComponent(token) +
    '&select=id,first_name,last_name,email,phone,address,invoice_amount,sign_token_expires_at,stripe_payment_intent_id,invoice_status,agreement_status&limit=1';

  const lookupResp = await fetch(lookupUrl, {
    headers: {
      'apikey': SUPA_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    }
  });
  const rows = await lookupResp.json();

  if (!Array.isArray(rows) || !rows.length) {
    return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Invalid or expired link' }) };
  }

  const c = rows[0];

  // Check expiry
  if (c.sign_token_expires_at && new Date(c.sign_token_expires_at) < new Date()) {
    return { statusCode: 410, headers: cors, body: JSON.stringify({ error: 'This link has expired. Please contact us for a new one.' }) };
  }

  // Already completed — let customer know
  if (c.invoice_status === 'paid' && c.agreement_status === 'signed') {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ alreadyComplete: true, customerName: ((c.first_name||'') + ' ' + (c.last_name||'')).trim() }) };
  }

  const amountCents = Math.round((c.invoice_amount || 349) * 100);
  const surchargeAmountCents = Math.round(amountCents * 0.039);
  const totalAmountCents = amountCents + surchargeAmountCents;

  // Reuse existing PaymentIntent if one exists and is still usable
  let clientSecret = null;
  if (c.stripe_payment_intent_id) {
    try {
      const piResp = await fetch('https://api.stripe.com/v1/payment_intents/' + c.stripe_payment_intent_id, {
        headers: { 'Authorization': 'Basic ' + Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64') }
      });
      const pi = await piResp.json();
      if (pi.error) {
        // Stale PI (wrong mode, wrong account, or expired) — clear it so a fresh one is created
        console.log('Stale PaymentIntent cleared:', pi.error.message);
        await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_SERVICE_KEY, 'Authorization': 'Bearer ' + SUPA_SERVICE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ stripe_payment_intent_id: null })
        });
      } else if ((pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation') && pi.amount === totalAmountCents) {
        clientSecret = pi.client_secret;
      }
    } catch(e) { /* fall through to create new */ }
  }

  // Create a new PaymentIntent
  if (!clientSecret) {
    const params = new URLSearchParams({
      amount: totalAmountCents,
      currency: 'usd',
      'payment_method_types[]': 'card',
      description: 'FixMy.Energy Diagnostic Fee — ' + ((c.first_name||'') + ' ' + (c.last_name||'')).trim(),
      'metadata[customer_id]': c.id,
      'metadata[token]': token,
    });
    if (c.email) params.set('receipt_email', c.email);

    const piResp = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString()
    });
    const pi = await piResp.json();
    if (!pi.client_secret) {
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Failed to create payment', detail: pi.error?.message }) };
    }
    clientSecret = pi.client_secret;

    // Store PaymentIntent ID so we can reuse it on reload
    await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ stripe_payment_intent_id: pi.id })
    });
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({
      clientSecret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      customerName: ((c.first_name||'') + ' ' + (c.last_name||'')).trim(),
      amountCents,
      surchargeAmountCents,
      totalAmountCents,
      address: c.address || '',
      customerId: c.id,
    })
  };
};
