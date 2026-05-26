// Sends an SMS to the assigned rep when a customer uploads photos.
// Required Netlify env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
// Optional (falls back to anon key): SUPA_SERVICE_KEY

const SUPA_URL     = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidG9ieW91bXZiY3hmYnVnc2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjY5MDcsImV4cCI6MjA5MDE0MjkwN30.nLE0TlMu43E4dNRxxjoc6P1OQMjfwXgonbA2MrCCrhk';

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM  = process.env.TWILIO_FROM_NUMBER;
  const supaKey      = process.env.SUPA_SERVICE_KEY || SUPA_ANON;

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.warn('[notify-photo-upload] Twilio env vars not set — skipping SMS');
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'twilio_not_configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: 'Bad JSON' };
  }

  const { customerId, customerName } = body;
  if (!customerId) return { statusCode: 400, headers: cors, body: 'Missing customerId' };

  const supaHeaders = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` };

  // 1 — Look up customer's rep_id
  let repId;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/customers?id=eq.${customerId}&select=rep_id`, { headers: supaHeaders });
    const rows = await r.json();
    repId = rows[0] && rows[0].rep_id;
  } catch(e) {
    console.error('[notify-photo-upload] customer lookup failed', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'supabase_error' }) };
  }

  if (!repId) {
    console.warn('[notify-photo-upload] no rep_id for customer', customerId);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'no_rep_id' }) };
  }

  // 2 — Look up rep's phone from team_members
  let repPhone;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/team_members?id=eq.${repId}&select=phone,name`, { headers: supaHeaders });
    const rows = await r.json();
    repPhone = rows[0] && rows[0].phone;
  } catch(e) {
    console.error('[notify-photo-upload] team_members lookup failed', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'supabase_error' }) };
  }

  if (!repPhone) {
    console.warn('[notify-photo-upload] no phone for rep', repId);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'no_rep_phone' }) };
  }

  // 3 — Send SMS via Twilio
  const name    = (customerName || 'A customer').trim();
  const message = `${name} just uploaded photos — fixmy.energy/portal`;
  const digits  = repPhone.replace(/\D/g, '');
  const toE164  = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  const fromE164 = TWILIO_FROM.startsWith('+') ? TWILIO_FROM : `+1${TWILIO_FROM.replace(/\D/g,'')}`;

  const params = new URLSearchParams({ To: toE164, From: fromE164, Body: message });
  const auth   = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

  try {
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      { method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
    );
    const data = await r.json();
    if (data.error_code) {
      console.error('[notify-photo-upload] Twilio error', data.error_code, data.message);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'twilio_error', detail: data.message }) };
    }
    console.log('[notify-photo-upload] SMS sent to', repId, '- SID', data.sid);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, sid: data.sid }) };
  } catch(e) {
    console.error('[notify-photo-upload] Twilio request failed', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'twilio_fetch_error' }) };
  }
};
