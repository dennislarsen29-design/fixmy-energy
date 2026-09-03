// Receives status update webhooks from GHL and updates the customer record in Supabase.
// Trigger types:
//   'invoice_paid'     — customer paid invoice → set invoice_status = 'paid'
//   'invoice_created'  — invoice generated/sent to customer → set invoice_status = 'sent'
//   'agreement_signed' — customer signed agreement → set agreement_status = 'signed'
//   'agreement_sent'   — agreement sent to customer → set agreement_status = 'sent'
//
// ⚠️ 2026-09-03: found via the GHL "Send-Diag-Agreement" workflow's Execution logs
// showing 100% "Failed" on its Webhook step across many contacts/days. CLAUDE.md has
// documented all four trigger values above since this function was built, but the
// code itself only ever implemented 'invoice_paid'/'agreement_signed' — any call with
// 'invoice_created' or 'agreement_sent' hit the `return 400 'Unknown trigger'` branch
// below on every single request, which is exactly the failure shape reported (never
// intermittent, never one contact — every execution, for weeks). Added both.

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidG9ieW91bXZiY3hmYnVnc2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjY5MDcsImV4cCI6MjA5MDE0MjkwN30.nLE0TlMu43E4dNRxxjoc6P1OQMjfwXgonbA2MrCCrhk';

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  let payload;
  try { payload = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { trigger, email, phone } = payload;

  if (!trigger) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'trigger required' }) };
  if (!email && !phone) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'email or phone required' }) };

  // Determine which fields to update
  let updates = {};
  if (trigger === 'invoice_paid') {
    updates = { invoice_status: 'paid' };
  } else if (trigger === 'invoice_created') {
    updates = { invoice_status: 'sent' };
  } else if (trigger === 'agreement_signed') {
    updates = { agreement_status: 'signed' };
  } else if (trigger === 'agreement_sent') {
    updates = { agreement_status: 'sent' };
  } else {
    console.warn('ghl-status-update: unknown trigger', trigger, 'for', email || phone);
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown trigger: ' + trigger }) };
  }

  // Normalize phone for lookup
  function normalizePhone(raw) {
    if (!raw) return null;
    return String(raw).replace(/\D/g, '').slice(-10);
  }

  // Look up customer by email first, then phone
  async function supaFetch(path, options) {
    const resp = await fetch(SUPA_URL + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        ...(options.headers || {})
      }
    });
    return resp.json();
  }

  let customerId = null;
  let customerName = '';

  // Try email lookup
  if (email) {
    const emailLower = email.toLowerCase().trim();
    const rows = await supaFetch(
      '/rest/v1/customers?email=eq.' + encodeURIComponent(emailLower) + '&select=id,first_name,last_name,sold_type,invoice_status,agreement_status&order=created_at.desc&limit=1',
      { method: 'GET' }
    );
    if (Array.isArray(rows) && rows.length) {
      customerId = rows[0].id;
      customerName = (rows[0].first_name || '') + ' ' + (rows[0].last_name || '');
    }
  }

  // Fallback: phone lookup
  if (!customerId && phone) {
    const digits = normalizePhone(phone);
    const rows = await supaFetch(
      '/rest/v1/customers?select=id,first_name,last_name,phone&order=created_at.desc&limit=20',
      { method: 'GET' }
    );
    if (Array.isArray(rows)) {
      const match = rows.find(function(r) {
        return normalizePhone(r.phone) === digits;
      });
      if (match) {
        customerId = match.id;
        customerName = (match.first_name || '') + ' ' + (match.last_name || '');
      }
    }
  }

  if (!customerId) {
    console.warn('ghl-status-update: no customer found for', email, phone);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'Customer not found', email, phone }) };
  }

  // Apply the update
  const updateResp = await supaFetch(
    '/rest/v1/customers?id=eq.' + customerId,
    {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates)
    }
  );

  console.log('ghl-status-update:', trigger, 'for', customerName.trim(), '(', customerId, ')', updates);

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ ok: true, trigger, customerId, customerName: customerName.trim(), updates })
  };
};
