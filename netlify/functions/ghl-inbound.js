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
  // Callers that already know the row (book.html tracks the id this function returns
  // across a session's partial → submit → confirmed calls, 2026-09-03) pass customerId
  // directly, skipping the email/phone/address guess entirely so an ambiguous or
  // incomplete address can never create a duplicate or patch the wrong customer — same
  // pattern already used by createNewLead()/ghl-book.js elsewhere in this codebase.
  // Otherwise: match on email first, then phone, then address — but only against
  // partial records that have no contact info yet — upgrading an address-only partial
  // into the full booking instead of creating a duplicate household.
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

  const passedCustomerId = (payload.customerId == null ? '' : String(payload.customerId)).trim();
  let existingId = passedCustomerId || null;
  if (!existingId && email)                 existingId = await findId('email=eq.' + encodeURIComponent(email));
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
  } else if (inboundSource === 'homepage_submit' || inboundSource === 'book_page_submit' || inboundSource === 'book_page_confirmed') {
    noteText = inboundSource === 'book_page_confirmed'
      ? 'Evaluation booked on /book — appointment time recorded.'
      : 'Lead captured via website form (' + inboundSource + ').';
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

  // The row id — needed so the client can pass it back as customerId on every later
  // call in this same session (see above). Comes back on both INSERT and PATCH since
  // both requests carry Prefer: return=representation.
  let resultId = existingId || null;
  try {
    const rows = JSON.parse(resultBody);
    if (Array.isArray(rows) && rows[0] && rows[0].id) resultId = rows[0].id;
  } catch (e) { /* not JSON (e.g. return=minimal path) — resultId stays whatever existingId was */ }

  // ── Absorb orphan partials ─────────────────────────────────────────────────
  // A mid-typed partial ("3335 Laurashawn", no phone/email) never equals the
  // completed full address ("3335 Laurashawn Ave, La Mesa, CA"), so it lingers as
  // a duplicate flagged "Booking Incomplete — Call Back". When a real booking
  // (has contact info, not itself a partial) is processed, archive any contactless
  // partial that's a real prefix of this booking's address either way.
  //
  // ⚠️ 2026-09-03: the original version only checked `partial.address ILIKE
  // '<completion's first 2 tokens>%'` — which assumes the partial's stored address
  // already contains at least "house number + street name". A partial fired on a
  // half-typed address (the customer tabbed away before Google Places finished
  // autocompleting — book.html's own maybeSend() had no minimum-address guard,
  // unlike index.html's homepage form, which was fixed for this exact bug on
  // 2026-07-17) can be as short as the bare house number ("6719"), which can never
  // match an ILIKE pattern requiring it to start with a longer string — the Neil
  // Fjellestad duplicate report. Now fetches contactless partial candidates by
  // house number only (a cheap SQL-side pre-filter) and does the real prefix check
  // in JS, symmetric either direction, so a stub of any length is caught.
  if (!isPartial && address && (email || digits)) {
    try {
      const firstTok = address.trim().split(/\s+/)[0];
      if (firstTok && /^\d+$/.test(firstTok)) {
        const candResp = await fetch(
          SUPA_URL + '/rest/v1/customers?select=id,address&address=ilike.' + encodeURIComponent(firstTok + '%')
            + '&partial_capture=eq.true&phone=is.null&email=is.null&limit=25',
          { headers: supaHeaders }
        );
        const candidates = candResp.ok ? await candResp.json() : [];
        const addrLower = address.trim().toLowerCase();
        const toArchive = (candidates || [])
          .filter(c => c.id !== existingId && c.address)
          .filter(c => {
            const cLower = c.address.trim().toLowerCase();
            // Either address is a real prefix of the other — catches a bare house
            // number ("6719") as well as the original "num + street" stub case.
            return addrLower.indexOf(cLower) === 0 || cLower.indexOf(addrLower) === 0;
          })
          .map(c => c.id);
        for (const id of toArchive) {
          await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ partial_capture: false, archived: true })
          }).catch(() => {});
        }
        if (toArchive.length) console.log('Absorbed', toArchive.length, 'orphan partial(s) into', resultId);
      }
    } catch (e) { /* best-effort cleanup — never block the booking */ }
  }

  console.log(existingId ? 'Updated' : 'Created', 'customer:', email || digits || address);
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ok: true, action: existingId ? 'updated' : 'created', id: resultId })
  };
};
