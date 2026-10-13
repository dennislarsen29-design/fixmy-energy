// GET /.netlify/functions/calendar-event?id=<appointment id> → an .ics file the customer's phone/computer can add
// to their own calendar (linked from the appointment text/email). The unguessable appointment id is the credential;
// only scheduled events are served and nothing but the event itself is exposed. ENV: SUPA_SERVICE_KEY.
const ics = require('./lib/ics');
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const NOUN = { 'Solar Evaluation': 'solar evaluation', 'Welcome Call': 'FAQs and Enrollment call', 'Diagnostic Visit': 'diagnostic visit', 'Repair Service Visit': 'repair service visit', 'Battery Install': 'battery installation', 'Site Survey': 'site survey', 'Install': 'installation', 'Inspection': 'inspection' };
const text = (code, msg) => ({ statusCode: code, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: msg });
exports.handler = async function (event, context, deps) {
  const id = String((event.queryStringParameters || {}).id || '');
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return text(400, 'Bad link');
  const KEY = process.env.SUPA_SERVICE_KEY; if (!KEY) return text(500, 'Server misconfigured');
  const doFetch = (deps && deps.fetch) || fetch, H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
  const a = (((await (await doFetch(SUPA_URL + '/rest/v1/appointments?id=eq.' + id + '&select=*&limit=1', { headers: H })).json().catch(() => [])) || [])[0]);
  if (!a || !NOUN[a.event_type]) return text(404, 'Appointment not found');
  if (a.status !== 'scheduled') return text(410, 'This appointment is no longer scheduled.');
  const c = (((await (await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + a.customer_id + '&select=address,email,phone,access_code&limit=1', { headers: H })).json().catch(() => [])) || [])[0]) || {};
  const body = ics.buildIcs(a, NOUN[a.event_type], '', c.address || '', 'https://fixmy.energy/portal');
  return { statusCode: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="solar-review-appointment.ics"', 'Cache-Control': 'no-store' }, body };
};
