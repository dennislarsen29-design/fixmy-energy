// GHL Booking — find/create contact, book appointment, update Supabase.
// POST /.netlify/functions/ghl-book
// Body: { firstName, lastName, phone, email, address, startISO, endISO }

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const CALENDAR_ID = process.env.GHL_BOOK_CALENDAR_ID || 'UjlvHxE8AlyhG5frBkqr';
const SUPA_URL    = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_KEY    = process.env.SUPABASE_ANON_KEY || process.env.SUPA_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtidG9ieW91bXZiY3hmYnVnc2lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NjY5MDcsImV4cCI6MjA5MDE0MjkwN30.nLE0TlMu43E4dNRxxjoc6P1OQMjfwXgonbA2MrCCrhk';

const cors = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

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

  const { firstName, lastName, phone, email, address, startISO, endISO } = payload;
  if (!startISO || (!phone && !email))
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'startISO + phone or email required' }) };

  const ghlHeaders = {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${apiKey}`,
    Version:        '2021-07-28',
  };

  // ── 1. Find or create GHL contact ─────────────────────────────────────────
  let contactId;
  try {
    const param      = email ? `email=${encodeURIComponent(email)}` : `phone=${encodeURIComponent(phone)}`;
    const searchResp = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&${param}`,
      { headers: ghlHeaders }
    );
    const searchData = await searchResp.json();
    contactId = searchData?.contact?.id;
  } catch(e) {
    console.warn('GHL contact search failed:', e.message);
  }

  if (!contactId) {
    try {
      const createResp = await fetch(`${GHL_BASE}/contacts/`, {
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
      const createData = await createResp.json();
      contactId = createData?.contact?.id;
    } catch(e) {
      console.error('GHL contact create failed:', e.message);
    }
  } else {
    // Add booking-confirmed, remove partial-capture
    try {
      await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
        method:  'POST',
        headers: ghlHeaders,
        body:    JSON.stringify({ tags: ['booking-confirmed'] }),
      });
      await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
        method:  'DELETE',
        headers: ghlHeaders,
        body:    JSON.stringify({ tags: ['partial-capture'] }),
      });
    } catch(e) {
      console.warn('GHL tag update failed:', e.message);
    }
  }

  if (!contactId) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Failed to find or create GHL contact' }) };
  }

  // ── 2. Book appointment ────────────────────────────────────────────────────
  let appointmentId;
  try {
    const apptResp = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
      method:  'POST',
      headers: ghlHeaders,
      body:    JSON.stringify({
        calendarId:          CALENDAR_ID,
        locationId,
        contactId,
        startTime:           startISO,
        endTime:             endISO,
        title:               `Solar Evaluation — ${(firstName || '')} ${(lastName || '')}`.trim(),
        meetingLocationType: 'default',
        address:             address || undefined,
      }),
    });
    const apptData = await apptResp.json();
    appointmentId  = apptData?.id || apptData?.event?.id;
    console.log('GHL appointment', apptResp.status, 'id:', appointmentId);
  } catch(e) {
    console.error('GHL appointment create failed:', e.message);
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

  // Check for existing Supabase record
  let existingId = null;
  if (email) {
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
      const patch = { diagnostic_date: startISO, arrival_window: arrivalWindow, lead_source: 'inbound_web', step: 1, black_box: false };
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
    body: JSON.stringify({ ok: true, contactId, appointmentId }),
  };
};
