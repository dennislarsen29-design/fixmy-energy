// Sends an SMS to the assigned rep when a customer uploads photos via the customer portal.
// Uses GHL outbound SMS via the conversations API (same GHL_API_KEY already in Netlify env).
// Required env vars: GHL_API_KEY, GHL_LOCATION_ID
// Optional (falls back to anon key): SUPA_SERVICE_KEY

const SUPA_URL  = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidG9ieW91bXZiY3hmYnVnc2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjY5MDcsImV4cCI6MjA5MDE0MjkwN30.nLE0TlMu43E4dNRxxjoc6P1OQMjfwXgonbA2MrCCrhk';
const GHL_BASE  = 'https://services.leadconnectorhq.com';

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const GHL_KEY    = process.env.GHL_API_KEY;
  const GHL_LOC    = process.env.GHL_LOCATION_ID;
  const supaKey    = process.env.SUPA_SERVICE_KEY || SUPA_ANON;

  if (!GHL_KEY || !GHL_LOC) {
    console.warn('[notify-photo-upload] GHL env vars not set');
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'ghl_not_configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: 'Bad JSON' };
  }

  const { customerId, customerName } = body;
  if (!customerId) return { statusCode: 400, headers: cors, body: 'Missing customerId' };

  const supaHeaders = { 'apikey': supaKey, 'Authorization': `Bearer ${supaKey}` };
  const ghlHeaders  = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GHL_KEY}`, 'Version': '2021-07-28' };

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
    console.warn('[notify-photo-upload] no rep_id for customer', customerId, '— falling back to tech4 (admin)');
    repId = 'tech4';
  }

  // 2 — Look up rep's phone + name from team_members
  let repPhone, repName;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/team_members?id=eq.${repId}&select=phone,name`, { headers: supaHeaders });
    const rows = await r.json();
    repPhone = rows[0] && rows[0].phone;
    repName  = rows[0] && rows[0].name;
  } catch(e) {
    console.error('[notify-photo-upload] team_members lookup failed', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'supabase_error' }) };
  }

  if (!repPhone) {
    console.warn('[notify-photo-upload] no phone for rep', repId);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'no_rep_phone' }) };
  }

  const digits  = repPhone.replace(/\D/g, '');
  const e164    = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  const message = `${(customerName || 'A customer').trim()} just uploaded photos — fixmy.energy/portal`;

  // 3 — Upsert rep as GHL contact to get a contactId
  let contactId;
  try {
    const r = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({ firstName: repName || repId, phone: e164, locationId: GHL_LOC })
    });
    const data = await r.json();
    contactId = data.contact && data.contact.id;
  } catch(e) {
    console.error('[notify-photo-upload] GHL contact upsert failed', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'ghl_contact_error' }) };
  }

  if (!contactId) {
    console.error('[notify-photo-upload] no contactId returned from GHL upsert');
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'ghl_no_contact_id' }) };
  }

  // 4 — Send outbound SMS via GHL conversations
  try {
    const r = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({ type: 'SMS', contactId, message, locationId: GHL_LOC })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('[notify-photo-upload] GHL SMS send failed', JSON.stringify(data));
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'ghl_sms_error', detail: data }) };
    }
    console.log('[notify-photo-upload] SMS sent to', repId, repPhone);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, messageId: data.id }) };
  } catch(e) {
    console.error('[notify-photo-upload] GHL SMS request failed', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'ghl_fetch_error' }) };
  }
};
