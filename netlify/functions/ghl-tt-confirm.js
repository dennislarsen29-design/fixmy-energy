// Called by GHL workflow when a Top Tier customer confirms their appointment via SMS reply.
// GHL posts: { phone, contactId }
// Updates Supabase: tt_confirmed = true, step = 2

const SUPA_URL  = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidG9ieW91bXZiY3hmYnVnc2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjY5MDcsImV4cCI6MjA5MDE0MjkwN30.nLE0TlMu43E4dNRxxjoc6P1OQMjfwXgonbA2MrCCrhk';

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPA_SERVICE_KEY || SUPA_ANON;
  const supaHeaders = {
    'apikey': supaKey,
    'Authorization': `Bearer ${supaKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: 'Bad JSON' };
  }

  const { phone } = body;
  if (!phone) return { statusCode: 400, headers: cors, body: 'Missing phone' };

  // Normalize phone to last 10 digits for matching access_code
  const digits  = phone.replace(/\D/g, '');
  const phone10 = digits.slice(-10);

  // Look up TT customer by access_code (last 10 digits of phone)
  let customerId;
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/customers?access_code=eq.${phone10}&lead_category=eq.top_tier&select=id,step,tt_confirmed&limit=1`,
      { headers: supaHeaders }
    );
    const rows = await r.json();
    if (!rows || rows.length === 0) {
      console.warn('[ghl-tt-confirm] no TT customer found for phone10:', phone10);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'customer_not_found' }) };
    }
    customerId = rows[0].id;
  } catch(e) {
    console.error('[ghl-tt-confirm] supabase lookup failed', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'supabase_error' }) };
  }

  // Update: tt_confirmed = true, step = 2 (Appointment Confirmed)
  try {
    await fetch(`${SUPA_URL}/rest/v1/customers?id=eq.${customerId}`, {
      method: 'PATCH',
      headers: supaHeaders,
      body: JSON.stringify({ tt_confirmed: true, step: 2 }),
    });
    console.log('[ghl-tt-confirm] confirmed customer', customerId, 'phone10:', phone10);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, customerId }) };
  } catch(e) {
    console.error('[ghl-tt-confirm] supabase update failed', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'update_error' }) };
  }
};
