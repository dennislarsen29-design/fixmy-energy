// GHL Booking — find/create contact, book appointment, update Supabase.
// POST /.netlify/functions/ghl-book
// Body: { firstName, lastName, phone, email, address, startISO, endISO }

const { sendMetaEvent } = require('./lib/meta-capi');

const GHL_BASE    = 'https://services.leadconnectorhq.com';
// "Evaluation" calendar — the initial Tech visit booked from /book (NOT the post-payment Diagnostic visit).
const CALENDAR_ID = process.env.GHL_EVAL_CALENDAR_ID || 'UjlvHxE8AlyhG5frBkqr';
const SUPA_URL    = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_KEY    = process.env.SUPABASE_ANON_KEY || process.env.SUPA_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidG9ieW91bXZiY3hmYnVnc2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjY5MDcsImV4cCI6MjA5MDE0MjkwN30.nLE0TlMu43E4dNRxxjoc6P1OQMjfwXgonbA2MrCCrhk';

const cors = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

// GHL rejects appointment creation with 422 "A team member needs to be selected"
// when assignedUserId is missing on calendars that require one (the Evaluation
// calendar does). Resolve it once: prefer an explicit env override, else read the
// calendar's own first assigned team member. Cached across warm invocations.
let cachedEvalUserId;
async function resolveAssignedUserId(ghlHeaders) {
  if (process.env.GHL_EVAL_USER_ID) return process.env.GHL_EVAL_USER_ID;
  if (cachedEvalUserId !== undefined) return cachedEvalUserId;
  cachedEvalUserId = null;
  try {
    const resp = await fetch(`${GHL_BASE}/calendars/${CALENDAR_ID}`, { headers: ghlHeaders });
    const data = await resp.json();
    const members = data?.calendar?.teamMembers || data?.teamMembers || [];
    if (members.length && members[0].userId) cachedEvalUserId = members[0].userId;
    else console.error('resolveAssignedUserId: no team member on calendar', CALENDAR_ID);
  } catch (e) {
    console.error('resolveAssignedUserId failed:', e.message);
  }
  return cachedEvalUserId;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const apiKey     = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey || !locationId)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Missing GHL env vars' }) };

  let payload;
  try { payload = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { firstName, lastName, phone, email, address, startISO, endISO, customerId, fbp, fbc } = payload;
  if (!startISO || (!phone && !email))
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'startISO + phone or email required' }) };

  const ghlHeaders = {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${apiKey}`,
    Version:        '2021-07-28',
  };

  // ── 1. Upsert GHL contact (single call — more reliable than search+create) ──
  let contactId;
  try {
    const upsertResp = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method:  'POST',
      headers: ghlHeaders,
      body:    JSON.stringify({
        locationId,
        firstName: firstName || '',
        lastName:  lastName  || '',
        email:     email     || undefined,
        phone:     phone     || undefined,
        address1:  address   || undefined,
        tags:      ['booking-confirmed'],
      }),
    });
    const upsertData = await upsertResp.json();
    contactId = upsertData?.contact?.id;
    if (!contactId) throw new Error('No contactId: ' + JSON.stringify(upsertData).slice(0, 200));
  } catch(e) {
    console.error('GHL contact upsert failed:', e.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL contact upsert failed', detail: e.message }) };
  }

  // ── 2. Book appointment ────────────────────────────────────────────────────
  const assignedUserId = await resolveAssignedUserId(ghlHeaders);
  let appointmentId;
  let apptError = null;
  try {
    const apptResp = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
      method:  'POST',
      headers: ghlHeaders,
      body:    JSON.stringify({
        calendarId:          CALENDAR_ID,
        locationId,
        contactId,
        assignedUserId:      assignedUserId || undefined,
        startTime:           startISO,
        endTime:             endISO,
        title:               `Solar Evaluation — ${(firstName || '')} ${(lastName || '')}`.trim(),
        meetingLocationType: 'default',
        address:             address || undefined,
        // Manual/override times (Black Box Dialer, editor) aren't validated free
        // slots and can fall outside the calendar's configured availability, so
        // GHL would silently reject them. These flags let an API booking land at
        // any time, and toNotify fires the calendar's confirmation SMS/email
        // automations (which otherwise default off for API-created appointments).
        ignoreDateRange:          true,
        ignoreFreeSlotValidation: true,
        toNotify:                 true,
      }),
    });
    const apptData = await apptResp.json();
    appointmentId  = apptData?.id || apptData?.event?.id;
    if (!apptResp.ok || !appointmentId) {
      apptError = { status: apptResp.status, body: JSON.stringify(apptData).slice(0, 400) };
      console.error('GHL appointment failed', apptResp.status, JSON.stringify(apptData).slice(0, 400));
    } else {
      console.log('GHL appointment created', apptResp.status, 'id:', appointmentId, 'calendarId:', CALENDAR_ID);
    }
  } catch(e) {
    apptError = { status: 0, body: e.message };
    console.error('GHL appointment create failed:', e.message);
  }

  // Server-side Meta Conversions API — mirrors the client-side fbq('Schedule')
  // fired on /booked, using the same event id (schedule_<appointmentId>) so
  // Meta dedupes the two into one event instead of double-counting. Only
  // fires on a real appointment, and never blocks/fails the booking itself.
  if (appointmentId) {
    try {
      await sendMetaEvent({
        eventName: 'Schedule',
        eventId: 'schedule_' + appointmentId,
        eventSourceUrl: 'https://fixmy.energy/book',
        email, phone, firstName, lastName,
        clientIp: (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined,
        userAgent: event.headers['user-agent'],
        fbp, fbc,
      });
    } catch(e) { console.warn('meta-capi Schedule error:', e.message); }
  }

  // ── 3. Upsert Supabase ─────────────────────────────────────────────────────
  const supaHeaders = {
    'Content-Type':  'application/json',
    apikey:          SUPA_KEY,
    Authorization:   `Bearer ${SUPA_KEY}`,
  };

  // Format 2-hour customer arrival window
  const startDt      = new Date(startISO);
  const windowEndDt  = new Date(startDt.getTime() + 2 * 60 * 60 * 1000);
  const fmtTime      = (d) => d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
  const arrivalWindow = `${fmtTime(startDt)} – ${fmtTime(windowEndDt)}`;

  let digits = (phone || '').replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);

  // Check for existing Supabase record — callers that already know the row
  // (e.g. the portal's Black Box Dialer booking an existing lead) pass
  // customerId directly, skipping the email/access_code guess entirely so an
  // ambiguous match can't create a duplicate or patch the wrong customer.
  let existingId = customerId || null;
  if (!existingId && email) {
    const chk = await fetch(
      `${SUPA_URL}/rest/v1/customers?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
      { headers: supaHeaders }
    ).catch(() => null);
    if (chk && chk.ok) { const rows = await chk.json(); if (rows?.length) existingId = rows[0].id; }
  }
  if (!existingId && digits) {
    const chk = await fetch(
      `${SUPA_URL}/rest/v1/customers?access_code=eq.${digits}&select=id&limit=1`,
      { headers: supaHeaders }
    ).catch(() => null);
    if (chk && chk.ok) { const rows = await chk.json(); if (rows?.length) existingId = rows[0].id; }
  }

  try {
    if (existingId) {
      // A caller-supplied customerId means the caller already owns/manages that
      // row's pipeline state (step, lead_source, black_box) for its own context
      // (Dialer activation, an existing lead's editor, etc.) — only stamp the
      // appointment fields. The public /book.html flow (matched by email/phone
      // guess, customerId absent) keeps the original full activation patch.
      const patch = customerId
        ? { diagnostic_date: startISO, arrival_window: arrivalWindow }
        : { diagnostic_date: startISO, arrival_window: arrivalWindow, lead_source: 'inbound_web', step: 1, black_box: false };
      if (firstName) patch.first_name = firstName;
      if (lastName)  patch.last_name  = lastName;
      await fetch(`${SUPA_URL}/rest/v1/customers?id=eq.${existingId}`, {
        method:  'PATCH',
        headers: { ...supaHeaders, Prefer: 'return=representation' },
        body:    JSON.stringify(patch),
      });
    } else {
      await fetch(`${SUPA_URL}/rest/v1/customers`, {
        method:  'POST',
        headers: { ...supaHeaders, Prefer: 'return=representation' },
        body:    JSON.stringify({
          first_name:      firstName    || null,
          last_name:       lastName     || null,
          email:           email        || null,
          phone:           phone        || null,
          address:         address      || null,
          access_code:     digits       || null,
          diagnostic_date: startISO,
          arrival_window:  arrivalWindow,
          step:            1,
          lead_category:   'fixmy',
          lead_source:     'inbound_web',
          lead_temp:       'warm',
          black_box:       false,
          notes:           JSON.stringify([{ ts: new Date().toISOString(), by: 'book.html', text: 'Booked via /book page.' }]),
        }),
      });
    }
  } catch(e) {
    console.warn('Supabase upsert failed:', e.message);
  }

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ ok: true, contactId, appointmentId, apptError }),
  };
};
