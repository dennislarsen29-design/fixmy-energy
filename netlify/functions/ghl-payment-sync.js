// Real-time GHL → portal payment sync.
// Wire in GHL: Automations → New workflow → Trigger: "Payment Received"
// (or "Invoice Paid") → Action: Webhook → POST
// https://fixmy.energy/.netlify/functions/ghl-payment-sync
// GHL webhook payloads vary by trigger; this parses defensively and matches
// the customer by email, then last-10-digit phone (same as ghl-dialer-sync).
//
// Writes one row to the payments ledger (deduped on ghl_transaction_id, so the
// nightly reconcile sweep can safely see the same transaction again) and
// recomputes the customer's invoice_status: paid / partial.
//
// ENV vars required: SUPA_SERVICE_KEY

const SUPA_URL  = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function last10(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  let p;
  try { p = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  console.log('ghl-payment-sync payload keys:', Object.keys(p).join(','));

  // GHL shapes vary: contact fields may be top-level or nested under contact/customer.
  const contact = p.contact || p.customer || p;
  const email = String(contact.email || p.email || '').toLowerCase().trim() || null;
  const phone = last10(contact.phone || p.phone);

  // Amount may arrive as number, string, or cents. Heuristic: GHL sends major units.
  let amount = parseFloat(p.amount || p.amountPaid || p.total || p.payment_amount || (p.invoice && p.invoice.total) || 0);
  if (!isFinite(amount) || amount <= 0) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ skipped: 'no positive amount in payload' }) };
  }

  const txnId = String(p.transactionId || p.transaction_id || p.paymentId || p.payment_id || p._id || p.id || '').trim()
    || ('ghl-webhook-' + (email || phone || 'unknown') + '-' + amount + '-' + new Date().toISOString().slice(0, 10));
  const invoiceNumber = p.invoiceNumber || p.invoice_number || (p.invoice && p.invoice.invoiceNumber) || null;
  const paidAt = p.paidAt || p.paid_at || p.date || new Date().toISOString();

  if (!email && !phone) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ skipped: 'no email or phone to match customer', txnId, amount }) };
  }

  // ── Match customer ──
  async function findCustomer(filter) {
    const r = await fetch(SUPA_REST + '/customers?' + filter + '&select=id,first_name,last_name,invoice_amount&limit=1', { headers: H });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows && rows[0] || null;
  }
  let cust = null;
  if (email) cust = await findCustomer('email=eq.' + encodeURIComponent(email));
  if (!cust && phone) cust = await findCustomer('access_code=eq.' + phone);
  if (!cust && phone) cust = await findCustomer('phone=ilike.*' + phone.slice(0, 3) + '*' + phone.slice(3, 6) + '*' + phone.slice(6) + '*');

  // ── Insert ledger row (idempotent on ghl_transaction_id) ──
  const row = {
    customer_id: cust ? cust.id : null,
    amount, currency: 'usd',
    paid_at: new Date(paidAt).toISOString(),
    method: (p.paymentMethod || p.method || 'card'),
    source: 'ghl',
    ghl_transaction_id: txnId,
    invoice_number: invoiceNumber,
    note: cust ? null : ('UNMATCHED — ' + (email || '') + ' ' + (phone || '')).trim(),
    recorded_by: 'ghl-payment-sync'
  };
  const ins = await fetch(SUPA_REST + '/payments?on_conflict=ghl_transaction_id', {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
  const insBody = await ins.text();
  if (!ins.ok) {
    console.error('ghl-payment-sync: ledger insert failed', ins.status, insBody.slice(0, 300));
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'ledger insert failed', detail: insBody.slice(0, 200) }) };
  }
  const inserted = insBody && insBody !== '[]';

  // ── Recompute invoice_status from ledger vs invoice_amount ──
  if (cust) {
    const payResp = await fetch(SUPA_REST + '/payments?customer_id=eq.' + cust.id + '&select=amount', { headers: H });
    const pays = payResp.ok ? await payResp.json() : [];
    const paidSum = pays.reduce((t, r) => t + (parseFloat(r.amount) || 0), 0);
    const target = parseFloat(cust.invoice_amount) || 0;
    const status = (!target || paidSum >= target) ? 'paid' : (paidSum > 0 ? 'partial' : undefined);
    if (status) {
      await fetch(SUPA_REST + '/customers?id=eq.' + cust.id, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ invoice_status: status })
      });
    }
    console.log('ghl-payment-sync:', inserted ? 'recorded' : 'duplicate-skipped', '$' + amount, 'for', cust.first_name, cust.last_name, '→', status || 'no-status-change');
  } else {
    console.warn('ghl-payment-sync: UNMATCHED payment $' + amount, email || phone, '— recorded to ledger with no customer');
  }

  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, matched: !!cust, recorded: inserted, txnId }) };
};
