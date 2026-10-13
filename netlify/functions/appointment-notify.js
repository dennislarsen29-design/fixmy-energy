// Texts + emails the customer when an appointment is scheduled, changed or canceled (2026-10-13).
// Same safety model as notify-customer.js: the caller only names an appointment id; the recipient,
// date, type and wording are all built here from the stored rows. One notice per appointment state
// (type+time+status) — a repeat call for the same state is a no-op, so a double-tap can't double-text.
// ENV: SUPA_SERVICE_KEY, GHL_API_KEY, RESEND_API_KEY.
const notify = require('./lib/notify');
const ics = require('./lib/ics');
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });

// What the customer is told each visit is. Internal-only types are never messaged.
const COPY = {
  'Solar Evaluation': { noun: 'solar evaluation', note: 'A technician will review your system and answer your questions. Please be home during the window.' },
  'Welcome Call': { noun: 'FAQs and Enrollment call', note: 'We will call you from (619) 777-6527 — please keep your phone nearby.' },
  'Diagnostic Visit': { noun: 'diagnostic visit', note: 'Our technician will inspect and test your system. Please be home during the window.' },
  'Repair Service Visit': { noun: 'repair service visit', note: 'Our technician will arrive during the window. Please be home.' },
  'Battery Install': { noun: 'battery installation', note: 'Our crew will arrive during the window. Please be home.' },
  'Site Survey': { noun: 'site survey', note: 'Our team will survey your property. Please be home during the window.' },
  'Install': { noun: 'installation', note: 'Our crew will arrive during the window. Please be home.' },
  'Inspection': { noun: 'inspection', note: 'An inspector will visit your property. Please be home.' }
};
const TZ = 'America/Los_Angeles';
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

exports.handler = async function (event, context, deps) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method Not Allowed' });
  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return out(500, { error: 'Server misconfigured' });
  const doFetch = (deps && deps.fetch) || fetch;
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  let body; try { body = JSON.parse(event.body); } catch (e) { return out(400, { error: 'Invalid JSON' }); }
  const id = String(body.appointmentId || '');
  const prev = body.previous && body.previous.starts_at ? body.previous : null; // set by the portal on a reschedule
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return out(400, { error: 'Bad appointmentId' });

  const ar = await doFetch(SUPA_URL + '/rest/v1/appointments?id=eq.' + id + '&select=*&limit=1', { headers: H });
  const a = ((await ar.json().catch(() => [])) || [])[0];
  if (!a) return out(404, { error: 'Appointment not found' });
  const copy = COPY[a.event_type] && Object.assign({}, COPY[a.event_type]);
  if (!copy) return out(200, { ok: false, reason: 'not_customer_facing' });

  const stateKey = a.status + '|' + a.event_type + '|' + new Date(a.starts_at).toISOString();
  if (a.notified_for === stateKey) return out(200, { ok: false, reason: 'already_notified' });
  if (a.status === 'completed') return out(200, { ok: false, reason: 'completed' });

  const cr = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + a.customer_id + '&select=id,first_name,last_name,email,phone,access_code,address&limit=1', { headers: H });
  const c = ((await cr.json().catch(() => [])) || [])[0];
  if (!c) return out(404, { error: 'Customer not found' });
  if (!notify.toE164(c.phone) && !notify.validEmail(c.email)) return out(200, { ok: false, reason: 'no_contact' });

  const first = (c.first_name || 'there').trim();
  const link = notify.magicLink(c);
  const dateOnly = a.notes === 'date_only'; // set by job-card date pickers: no time was chosen, so don't invent one
  const when = dateOnly ? fmtDate(a.starts_at) : fmtDate(a.starts_at) + ', ' + fmtTime(a.starts_at) + (a.ends_at ? ' – ' + fmtTime(a.ends_at) : '');
  if (dateOnly) copy.note = copy.note.replace('during the window', 'that day').replace(' Please be home.', ' We will confirm the arrival time with you.');
  let sms, mail;
  if (a.status === 'canceled') {
    sms = 'Hi ' + first + '! Your ' + copy.noun + ' on ' + fmtDate(a.starts_at) + ' has been canceled. We will be in touch to reschedule. Questions? Call (619) 777-6527.';
    mail = { subject: 'Your ' + copy.noun + ' was canceled', heading: 'Your ' + copy.noun + ' was canceled', lines: ['Hi ' + first + ', your ' + copy.noun + ' scheduled for <b>' + when + '</b> has been canceled.', 'We will reach out to find a new time. You can also call us at (619) 777-6527.'], cta: { url: link, label: 'Open my portal' } };
  } else {
    const changed = !!prev;
    const lead = changed ? 'has been rescheduled to' : 'is scheduled for';
    const gUrl = ics.googleUrl(a, copy.noun, copy.note, c.address || '', link), iUrl = ics.icsUrl(id);
    sms = 'Hi ' + first + '! Your Solar Review ' + copy.noun + ' ' + lead + ' ' + when + '. ' + copy.note + ' Details: ' + link + ' Add to your calendar: ' + iUrl;
    mail = { subject: 'Your ' + copy.noun + (changed ? ' was rescheduled' : ' is scheduled') + ' — ' + fmtDate(a.starts_at), heading: changed ? 'Your ' + copy.noun + ' was rescheduled' : 'Your ' + copy.noun + ' is scheduled',
      lines: ['Hi ' + first + ', your ' + copy.noun + ' ' + lead + ':', '<b>' + when + '</b>', copy.note, '<b>Put it on your calendar:</b> <a href="' + gUrl + '">Google Calendar</a> &nbsp;|&nbsp; <a href="' + iUrl + '">Apple / Outlook (.ics)</a>'], cta: { url: link, label: 'View in my portal' } };
  }

  const result = await notify.sendBoth(c, sms, mail, doFetch);
  if (result.ok) {
    try {
      await doFetch(SUPA_URL + '/rest/v1/appointments?id=eq.' + id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ notified_at: new Date().toISOString(), notified_for: stateKey }) });
    } catch (e) { /* best effort */ }
  }
  console.log('appointment-notify', a.event_type, a.status, id, 'sms', result.sms.ok ? 'ok' : result.sms.reason, 'email', result.email.ok ? 'ok' : result.email.reason);
  return out(200, result);
};
