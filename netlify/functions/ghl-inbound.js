// Receives GHL webhook on new booking/contact and upserts into Supabase customers table.
// Wire this up in GHL: Automations → Webhook → POST https://<site>/.netlify/functions/ghl-inbound
exports.handler = async function(event) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
  const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPA_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidG9ieW91bXZiY3hmYnVnc2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjY5MDcsImV4cCI6MjA5MDE0MjkwN30.nLE0TlMu43E4dNRxxjoc6P1OQMjfwXgonbA2MrCCrhk';

  let payload;
  try { payload = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // ── Normalise GHL payload ─────────────────────────────────────────────────
  // GHL sends different shapes: AppointmentCreate wraps contact under payload.contact,
  // ContactCreate/ContactUpdate puts fields at the top level.
  const contact = payload.contact || payload;

  const firstName = (contact.firstName || contact.first_name || '').trim();
  const lastName  = (contact.lastName  || contact.last_name  || '').trim();
  const email     = (contact.email || '').toLowerCase().trim();
  const rawPhone  = contact.phone || contact.phone_raw || '';

  // Clean phone to 10 digits (used as access_code)
  let digits = rawPhone.replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);

  // Build address string
  const addrParts = [
    contact.address1 || contact.address || '',
    contact.city  || '',
    contact.state || '',
    contact.postalCode || contact.postal_code || ''
  ].map(s => s.trim()).filter(Boolean);
  const address = addrParts.join(', ') || null;

  // Appointment date/time from booking event
  let diagnosticDate = null;
  let arrivalEnd = null;
  const slotRaw = payload.selectedSlot || payload.startTime || contact.appointmentStartTime || null;
  const slotEnd = payload.selectedSlotEndTime || payload.endTime || contact.appointmentEndTime || null;
  if (slotRaw) {
    try { diagnosticDate = new Date(slotRaw).toISOString(); } catch(e) {}
  }
  if (slotEnd) {
    try {
      const d = new Date(slotEnd);
      arrivalEnd = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    } catch(e) {}
  }

  if (!email && !digits) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ skipped: 'no email or phone' }) };
  }

  // ── Check for existing record ─────────────────────────────────────────────
  // Match on email first, then phone, to avoid duplicates
  const supaHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY
  };

  let existingId = null;
  if (email) {
    const checkResp = await fetch(
      SUPA_URL + '/rest/v1/customers?email=eq.' + encodeURIComponent(email) + '&select=id&limit=1',
      { headers: supaHeaders }
    );
    if (checkResp.ok) {
      const rows = await checkResp.json();
      if (rows && rows.length) existingId = rows[0].id;
    }
  }
  if (!existingId && digits) {
    const checkResp = await fetch(
      SUPA_URL + '/rest/v1/customers?access_code=eq.' + digits + '&select=id&limit=1',
      { headers: supaHeaders }
    );
    if (checkResp.ok) {
      const rows = await checkResp.json();
      if (rows && rows.length) existingId = rows[0].id;
    }
  }

  // ── Build the customer record ─────────────────────────────────────────────
  const now = new Date().toISOString();
  const record = {
    first_name:      firstName || null,
    last_name:       lastName  || null,
    email:           email     || null,
    phone:           rawPhone  || null,
    address:         address,
    access_code:     digits    || null,
    step:            1,
    lead_category:   'fixmy',
    lead_source:     'inbound_web',
    lead_temp:       'cold',
    diagnostic_date: diagnosticDate,
    arrival_end:     arrivalEnd
  };

  let result, method, supaUrl;
  if (existingId) {
    // Update existing — fill in any blanks, update appt if provided
    const patch = {};
    if (diagnosticDate) patch.diagnostic_date = diagnosticDate;
    if (arrivalEnd)     patch.arrival_end = arrivalEnd;
    if (address && !existingId.address) patch.address = address;
    method  = 'PATCH';
    supaUrl = SUPA_URL + '/rest/v1/customers?id=eq.' + existingId;
    result  = await fetch(supaUrl, {
      method,
      headers: { ...supaHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify(patch)
    });
  } else {
    // Insert new lead
    method  = 'POST';
    supaUrl = SUPA_URL + '/rest/v1/customers';
    result  = await fetch(supaUrl, {
      method,
      headers: { ...supaHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify(record)
    });
  }

  const resultBody = await result.text();
  if (!result.ok) {
    console.error('Supabase error', result.status, resultBody);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Supabase write failed', detail: resultBody })
    };
  }

  console.log(existingId ? 'Updated' : 'Created', 'customer:', email || digits);
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ok: true, action: existingId ? 'updated' : 'created' })
  };
};
