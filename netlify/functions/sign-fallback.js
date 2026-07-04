// Sign & Pay resilience: called by sign.html when the card path fails.
// Two actions:
//
//  action: 'log_error'      — records a card/payment failure so admins SEE it
//                             in the Agent Inbox immediately (instead of weeks
//                             later via missing revenue).
//
//  action: 'agreement_only' — the fallback rail. Captures the customer's
//                             signature + audit trail WITHOUT payment, marks
//                             invoice_status='sent', and tags the GHL contact
//                             'send-ghl-invoice' so a GHL workflow (or staff)
//                             sends a GHL invoice for the fee. When that
//                             invoice is paid, ghl-payment-sync / the nightly
//                             reconcile books it to the ledger and flips the
//                             status to paid. The signature is never lost to a
//                             card problem again.
//
// ENV vars required: SUPA_SERVICE_KEY; GHL_API_KEY optional (tagging skipped without it).

const SUPA_URL        = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'gXWwbOVymY0iRfj7c1It';

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Server misconfigured' }) };
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const { action, token } = body;
  if (!token) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'token required' }) };

  // Validate token → customer (same lookup as sign-init)
  const lookupResp = await fetch(SUPA_URL + '/rest/v1/customers?sign_token=eq.' + encodeURIComponent(token) +
    '&select=id,first_name,last_name,email,phone,invoice_amount,sign_token_expires_at&limit=1', { headers: H });
  const rows = await lookupResp.json();
  const c = Array.isArray(rows) && rows[0];
  if (!c) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Invalid or expired link' }) };
  if (c.sign_token_expires_at && new Date(c.sign_token_expires_at) < new Date()) {
    return { statusCode: 410, headers: cors, body: JSON.stringify({ error: 'Link expired' }) };
  }
  const custName = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();

  // ── action: log_error — surface the failure in the Agent Inbox ──
  if (action === 'log_error') {
    const msg = String(body.message || 'unknown error').slice(0, 300);
    await fetch(SUPA_URL + '/rest/v1/agent_reports', {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent: 'crm-dev', priority: 'urgent',
        title: 'Sign & Pay card failure — ' + (custName || 'unknown customer'),
        body: 'Customer hit a payment error on the Sign & Pay page: "' + msg + '". ' +
          'Amount: $' + (c.invoice_amount || '?') + '. Phone: ' + (c.phone || '—') + '. ' +
          'If they don\'t complete in the next few minutes, call them or send a GHL invoice.'
      })
    }).catch(() => {});
    console.warn('sign-fallback: card failure for', custName, '—', msg);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  }

  // ── action: agreement_only — capture signature, queue GHL invoice ──
  if (action === 'agreement_only') {
    const { signature, repairAuthInitial, signedAt } = body;
    if (!signature || String(signature).trim().length < 2) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'signature required' }) };
    }
    const signingIp = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

    const patch = await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agreement_status: 'signed',
        agreement_signed_at: signedAt || new Date().toISOString(),
        agreement_signature: signature,
        repair_auth_initial: repairAuthInitial || null,
        agreement_ip: signingIp,
        agreement_user_agent: event.headers['user-agent'] || 'unknown',
        invoice_status: 'sent'   // fee owed — GHL invoice on its way
      })
    });
    if (!patch.ok) {
      const detail = await patch.text().catch(() => '');
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Could not record signature', detail: detail.slice(0, 200) }) };
    }

    // Tag the GHL contact so the 'send-ghl-invoice' workflow (or staff) sends the invoice
    let tagged = false;
    if (process.env.GHL_API_KEY) {
      try {
        const ghlHeaders = { Authorization: 'Bearer ' + process.env.GHL_API_KEY, 'Content-Type': 'application/json', Version: '2021-07-28' };
        const up = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
          method: 'POST', headers: ghlHeaders,
          body: JSON.stringify({
            locationId: GHL_LOCATION_ID,
            email: c.email || undefined,
            phone: c.phone ? ('+1' + String(c.phone).replace(/\D/g, '').slice(-10)) : undefined,
            firstName: c.first_name || undefined,
            lastName: c.last_name || undefined,
            tags: ['send-ghl-invoice']
          })
        });
        tagged = up.ok;
      } catch(e) { console.warn('sign-fallback: GHL tag failed —', e.message); }
    }

    // Tell the admin either way — this customer signed but hasn't paid yet
    await fetch(SUPA_URL + '/rest/v1/agent_reports', {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        agent: 'crm-dev', priority: 'urgent',
        title: 'Signed, payment pending — ' + custName + ' ($' + (c.invoice_amount || '?') + ')',
        body: custName + ' signed the agreement but the card payment failed, so they chose the invoice fallback. ' +
          (tagged ? 'The send-ghl-invoice tag fired — confirm the GHL invoice went out.' : 'GHL tagging was unavailable — send them a GHL invoice manually.') +
          ' Phone: ' + (c.phone || '—') + '. The payment will auto-book to the ledger when the invoice is paid.'
      })
    }).catch(() => {});

    console.log('sign-fallback: agreement-only recorded for', custName, '— GHL invoice', tagged ? 'queued' : 'NOT queued');
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, customerName: custName, invoiceQueued: tagged }) };
  }

  return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };
};
