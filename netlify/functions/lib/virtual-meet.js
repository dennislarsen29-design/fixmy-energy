// Virtual Solar Evaluation = a 45-minute Google Meet call. Where the Meet link comes from (2026-10-24):
//   1. appointments.notes 'meet=<url>' (if a specific link was stored for that call), else
//   2. env VIRTUAL_MEET_URL (a standing Meet room link for the evaluation team).
// If neither exists we never invent a link -- messages say the link will be sent before the call.
const DURATION_MIN = 45;
function meetFor(appt) {
  const n = String((appt && appt.notes) || '');
  const m = n.match(/(?:^|\s)meet=(https:\/\/meet\.google\.com\/[A-Za-z0-9\-?=&_]+)/);
  if (m) return m[1];
  const env = String(process.env.VIRTUAL_MEET_URL || '').trim();
  return /^https:\/\/meet\.google\.com\//.test(env) ? env : '';
}
module.exports = { meetFor, DURATION_MIN };
