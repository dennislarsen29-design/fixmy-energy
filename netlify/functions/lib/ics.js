// "Add to my calendar" helpers shared by the customer notices and the calendar-event endpoint (2026-10-13).
// Date-only appointments (notes === 'date_only') become all-day events; timed ones use start/end (default 2h).
const SITE = 'https://fixmy.energy';
const pad = (n) => (n < 10 ? '0' : '') + n;
const utc = (d) => { d = new Date(d); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'; };
// All-day dates are taken in Pacific time (the date the customer was told), not UTC.
const dayKey = (d, add) => { const t = new Date(new Date(d).getTime() + (add || 0) * 86400000); const p = t.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); return p.replace(/-/g, ''); };
const esc = (t) => String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let cut = 74; while (Buffer.byteLength(s.slice(0, cut)) > 74) cut--; out.push(s.slice(0, cut)); s = ' ' + s.slice(cut); } out.push(s); return out.join('\r\n'); }
function span(a) {
  if (a.notes === 'date_only') return { allDay: true, s: dayKey(a.starts_at), e: dayKey(a.starts_at, 1) };
  const s = new Date(a.starts_at), e = a.ends_at ? new Date(a.ends_at) : new Date(s.getTime() + 2 * 3600000);
  return { allDay: false, s: utc(s), e: utc(e) };
}
function title(noun) { return 'Solar Review — ' + noun; }
function details(note, link) { return (note ? note + '\n\n' : '') + 'Details & your portal: ' + link; }
function googleUrl(a, noun, note, location, link) {
  const sp = span(a);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title(noun)) + '&dates=' + sp.s + '/' + sp.e +
    '&details=' + encodeURIComponent(details(note, link)) + (location ? '&location=' + encodeURIComponent(location) : '');
}
function icsUrl(id) { return SITE + '/.netlify/functions/calendar-event?id=' + id; }
function buildIcs(a, noun, note, location, link) {
  const sp = span(a);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Solar Review//Appointments//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + a.id + '@fixmy.energy', 'DTSTAMP:' + utc(new Date()),
    sp.allDay ? 'DTSTART;VALUE=DATE:' + sp.s : 'DTSTART:' + sp.s, sp.allDay ? 'DTEND;VALUE=DATE:' + sp.e : 'DTEND:' + sp.e,
    'SUMMARY:' + esc(title(noun)), 'DESCRIPTION:' + esc(details(note, link))];
  if (location) L.push('LOCATION:' + esc(location));
  L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title(noun)), 'TRIGGER:-PT1H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
module.exports = { googleUrl, icsUrl, buildIcs, span };
