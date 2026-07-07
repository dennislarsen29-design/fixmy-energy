// Receives GHL webhook on new booking/contact and upserts into Supabase customers table.
// Also the canonical intake for website lead capture (book.html + index.html), including
// partial captures (visitor started the form but never finished booking).
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

  // ── Normalise GHL payload ──────────────────────────────────────────────────────────────────────────────────────────
  // GHL sends different shapes: AppointmentCreate wraps contact under payload.contact,
  // ContactCreate/ContactUpdate puts fields at the top level.
  const contact = payload.contact || payload;

  let firstName = (contact.firstName || contact.first_name || '').trim();
  let lastName  = (contact.lastName  || contact.last_name  || '').trim();

  // GHL booking widget often sends a combined `name` field instead of split first/last.
  if (!firstName && !lastName) {
    const fullName = (contact.name || contact.full_name || payload.name || '').trim();
    if (fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] || '';
      lastName  = parts.slice(1).join(' ') || '';
    }
  }

  // GHL may use 'email', 'email_address', or top-level payload.email
  const email    = (contact.email || contact.email_address || payload.email || '').toLowerCase().trim();
  const rawPhone = contact.phone || contact.phone_raw || contact.phoneRaw || payload.phone || '';

  console.log('GHL inbound payload keys:', Object.keys(payload).join(','));
  console.log('Parsed name:', firstName, lastName, '| email:', email, '| phone:', rawPhone);

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

  // Ad attribution — captured client-side (UTM/gclid/fbclid), passed through in the payload.
  // These columns are added by 20260704_attribution_columns.sql; writes retry without them
  // if the migration hasn't been applied yet.
  const ATTR_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','landing_page'];
  const attribution = {};
  ATTR_KEYS.forEach(k => {
    const v = (payload[k] == null ? '' : String(payload[k])).trim();
    if (v) attribution[k] = v.slice(0, 500);
  });

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

  // The address alone is enough to keep a lead in this business — it can be canvassed,
  // mailed, and matched to ad audiences even before a phone or email arrives.
  if (!email && !digits && !address) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ skipped: 'no email, phone, or address' }) };
  }

  // When name is still blank after all fallbacks, log the raw payload so it's diagnosable
  // and store a note on the record so admins can see what GHL actually sent.
  const nameMissing = !firstName && !lastName;
  if (nameMissing) {
    console.warn('GHL inbound: name fields missing. Raw payload:', JSON.stringify(payload).slice(0, 500));
  }

  // ── Check for existing record ──────────────────────────────────────────────────────────────────────────────────────────
  // Match on email first, then phone. Finally match on address, but only against partial
  // records that have no contact info yet — this upgrades an address-only partial into the
  // full booking instead of creating a duplicate household.
  const supaHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY
  };

  async function findId(filter) {
    const resp = await fetch(SUPA_URL + '/rest/v1/customers?' + filter + '&select=id&limit=1', { headers: supaHeaders });
    if (!resp.ok) return null;
    const rows = await resp.json();
    return (rows && rows.length) ? rows[0].id : null;
  }

  let existingId = null;
  if (email)                 existingId = await findId('email=eq.' + encodeURIComponent(email));
  if (!existingId && digits) existingId = await findId('access_code=eq.' + digits);
  if (!existingId && address) {
    existingId = await findId(
      'address=eq.' + encodeURIComponent(address) +
      '&partial_capture=eq.true&phone=is.null&email=is.null'
    );
  }

  // Detect partial captures from the /book page or homepage forms
  const inboundSource = payload.source || 'inbound_web';
  const isPartial     = inboundSource === 'book_page_partial' || inboundSource === 'homepage_partial';

  // Human-readable capture note by source
  let noteText;
  if (isPartial) {
    noteText = 'Partial web capture (' + inboundSource + ') — visitor started the form but did not finish booking. Call back while it\'s warm.';
  } else if (inboundSource === 'homepage_submit' || inboundSource === 'book_page_submit') {
    noteText = 'Lead captured via website form (' + inboundSource + ').';
  } else {
    noteText = nameMissing
      ? 'Lead captured via GHL booking — name not provided. Check GHL contact record.'
      : 'Lead captured via GHL booking.';
  }
  // Extra context the customers table has no columns for
  const yearsInstalled = (payload.years_installed == null ? '' : String(payload.years_installed)).trim();
  const techNote       = (payload.tech_note       == null ? '' : String(payload.tech_note)).trim();
  if (yearsInstalled) noteText += ' Years installed: ' + yearsInstalled + '.';
  if (techNote)       noteText += ' Note for tech: ' + techNote;
  if (Object.keys(attribution).length) {
    noteText += ' [src: ' + (attribution.utm_source || (attribution.gclid ? 'google/gclid' : attribution.fbclid ? 'facebook/fbclid' : 'direct'))
      + (attribution.utm_campaign ? ' · ' + attribution.utm_campaign : '') + ']';
  }

  // ── Build the customer record ──────────────────────────────────────────────────────────────────────────────────────────────────
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
    // Someone who typed their name and address into a booking form is not a cold lead.
    lead_temp:       isPartial ? 'warm' : 'cold',
    partial_capture: isPartial,
    diagnostic_date: diagnosticDate,
    arrival_end:     arrivalEnd,
    notes:           JSON.stringify([{ts:new Date().toISOString(),by:'Web Capture',text:noteText}]),
    ...attribution
  };
  // Optional solar-profile fields from the homepage form (columns exist on customers)
  ['system_size','utility','monthly_bill'].forEach(k => {
    const v = (payload[k] == null ? '' : String(payload[k])).trim();
    if (v) record[k] = v;
  });

  // Write helper — retries without attribution columns when the migration hasn't run yet
  // (PostgREST rejects the whole row on an unknown column).
  async function supaWrite(method, url, bodyObj) {
    let resp = await fetch(url, {
      method,
      headers: { ...supaHeaders, 'Prefer': 'return=representation' },
      body: JSON.stringify(bodyObj)
    });
    let bodyText = await resp.text();
    const columnMissing = !resp.ok && resp.status === 400 && /column|PGRST204/i.test(bodyText);
    if (columnMissing && ATTR_KEYS.some(k => k in bodyObj)) {
      console.warn('Attribution columns missing — retrying without them. Run 20260704_attribution_columns.sql.');
      const stripped = { ...bodyObj };
      ATTR_KEYS.forEach(k => delete stripped[k]);
      resp = await fetch(url, {
        method,
        headers: { ...supaHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify(stripped)
      });
      bodyText = await resp.text();
    }
    return { resp, bodyText };
  }

  let result, resultBody;
  if (existingId) {
    // Update existing — stamp step/category, fill in any blanks, upgrade partial → full.
    // partial_capture only ever moves one way on an existing record: a full
    // submission clears it, but a PARTIAL never sets it. On /book, tapping a
    // time slot blurs the last field, firing a partial save and the booking
    // save nearly simultaneously — if the partial landed second it used to
    // re-flag a fully-booked customer as a "hot lead". Never downgrade.
    const patch = {
      step:            1,
      lead_category:   'fixmy',
      lead_source:     'inbound_web',
      ...attribution
    };
    if (!isPartial) patch.partial_capture = false;
    if (firstName)      patch.first_name = firstName;
    if (lastName)       patch.last_name  = lastName;
    if (rawPhone)       patch.phone = rawPhone;
    if (digits)         patch.access_code = digits;
    if (email)          patch.email = email;
    if (diagnosticDate) patch.diagnostic_date = diagnosticDate;
    if (arrivalEnd)     patch.arrival_end = arrivalEnd;
    if (address)        patch.address = address;
    ['system_size','utility','monthly_bill'].forEach(k => { if (record[k]) patch[k] = record[k]; });
    ({ resp: result, bodyText: resultBody } = await supaWrite(
      'PATCH', SUPA_URL + '/rest/v1/customers?id=eq.' + existingId, patch
    ));
  } else {
    ({ resp: result, bodyText: resultBody } = await supaWrite(
      'POST', SUPA_URL + '/rest/v1/customers', record
    ));
  }

  if (!result.ok) {
    console.error('Supabase error', result.status, resultBody);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Supabase write failed', detail: resultBody })
    };
  }

  // Detect silent RLS failure — Supabase returns 200 with empty array when INSERT is blocked by RLS
  if (!existingId && (resultBody === '[]' || resultBody === 'null' || resultBody === '')) {
    console.error('Supabase silent RLS failure — INSERT returned empty. email:', email, 'phone:', rawPhone);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Supabase insert silently blocked (RLS?)', email, phone: rawPhone })
    };
  }

  console.log(existingId ? 'Updated' : 'Created', 'customer:', email || digits || address);
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ok: true, action: existingId ? 'updated' : 'created' })
  };
};
