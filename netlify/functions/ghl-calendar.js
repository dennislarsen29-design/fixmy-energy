// GHL Calendar booking — creates/upserts a GHL contact then books an appointment.
// Required Netlify env vars: GHL_API_KEY, GHL_CALENDAR_ID, GHL_LOCATION_ID
const GHL_BASE = 'https://services.leadconnectorhq.com';
const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.GHL_API_KEY}`,
  Version: '2021-07-28',
};

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const locationId  = process.env.GHL_LOCATION_ID;
  const apiKey      = process.env.GHL_API_KEY;

  if (!apiKey || !locationId) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing GHL env vars (GHL_API_KEY, GHL_LOCATION_ID)' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Bad JSON' }; }

  // calendarId can be passed in the request body to support multiple calendars (TT, Diagnostic, etc.)
  const calendarId = body.calendarId || process.env.GHL_DIAG_CALENDAR_ID || process.env.GHL_CALENDAR_ID;

  const { firstName, lastName, email, phone, address, appointmentDate, appointmentTime, appointmentEndTime, trigger, diagnosticDate } = body;

  // ── 1. Upsert GHL contact ────────────────────────────────────────────────
  let contactId;
  try {
    const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        locationId,
        firstName: firstName || '',
        lastName:  lastName  || '',
        email:     email     || undefined,
        phone:     phone     || undefined,
        address1:  address   || undefined,
        tags: ['top-tier'],
      }),
    });
    const upsertData = await upsertRes.json();
    contactId = upsertData?.contact?.id;
    if (!contactId) throw new Error('No contactId returned: ' + JSON.stringify(upsertData));
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Contact upsert failed', detail: err.message }) };
  }

  // ── 2. Book appointment (only if date/time provided) ─────────────────────
  let appointmentId = null;
  if (appointmentDate && appointmentTime) {
    try {
      // Combine date + time into ISO8601 — assume PT (UTC-7 PDT)
      const startISO = new Date(`${appointmentDate}T${appointmentTime}:00-07:00`).toISOString();
      const endISO   = appointmentEndTime
        ? new Date(`${appointmentDate}T${appointmentEndTime}:00-07:00`).toISOString()
        : new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString(); // default 1hr

      const apptRes = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          calendarId,
          locationId,
          contactId,
          startTime: startISO,
          endTime:   endISO,
          title: `Top Tier — ${firstName || ''} ${lastName || ''}`.trim(),
          meetingLocationType: 'default',
          address: address || undefined,
        }),
      });
      const apptData = await apptRes.json();
      appointmentId = apptData?.id || apptData?.event?.id;
    } catch (err) {
      // Non-fatal — contact was created, appointment failed
      console.error('Appointment booking failed:', err.message);
    }
  }

  // ── 3. Fire GHL workflow trigger webhook if provided ─────────────────────
  if (trigger) {
    // Reminder triggers go to dedicated reminder workflow; all others go to master TT webhook
    const reminderTriggers = ['top_tier_reminder', 'top_tier_confirmed'];
    const webhookUrl = reminderTriggers.includes(trigger)
      ? (process.env.GHL_TT_REMINDER_WEBHOOK || process.env.GHL_TT_WEBHOOK)
      : process.env.GHL_TT_WEBHOOK;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger, contactId, firstName, lastName, email, phone, address, diagnosticDate: diagnosticDate || undefined }),
        });
      } catch (err) {
        console.error('GHL trigger webhook failed:', err.message);
      }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, contactId, appointmentId }),
  };
};
