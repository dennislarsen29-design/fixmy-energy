// One-tap "Add to calendar" for an Ops partner: returns an .ics file for the job's diagnostic window.
// Link is HMAC-signed (same helper as newsletter), so only links we generated work.
const { valid, token } = require('./lib/newsletter');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const z = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const esc = t => String(t || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
exports.handler = async function (event) {
  const q = event.queryStringParameters || {};
  // Short links (/ics/<32 hex id>/<12 hex token>) keep the text message short enough to dodge carrier filters;
  // the full 36-char id + 32-char token form still works for links already sent.
  let id = q.id || '';
  if (/^[0-9a-fA-F]{32}$/.test(id)) id = id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  const t = String(q.t || '');
  const ok = /^[0-9a-fA-F-]{36}$/.test(id) && (valid('ics|' + id, t) || (/^[0-9a-f]{12}$/.test(t) && token('ics|' + id).slice(0, 12) === t));
  if (!ok) return { statusCode: 403, body: 'Invalid link' };
  q.id = id;
  const K = process.env.SUPA_SERVICE_KEY; if (!K) return { statusCode: 500, body: 'not configured' };
  const r = await fetch(SUPA + '/customers?id=eq.' + q.id + '&select=first_name,last_name,address,diagnostic_date,arrival_end,phone&limit=1', { headers: { apikey: K, Authorization: 'Bearer ' + K } });
  const c = ((await r.json().catch(() => [])) || [])[0];
  if (!c || !c.diagnostic_date) return { statusCode: 404, body: 'No appointment' };
  const start = new Date(c.diagnostic_date), end = c.arrival_end ? new Date(c.arrival_end) : new Date(start.getTime() + 2 * 3600000);
  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Solar Review//Ops//EN', 'BEGIN:VEVENT', 'UID:' + q.id + '@fixmy.energy', 'DTSTAMP:' + z(Date.now()),
    'DTSTART:' + z(start), 'DTEND:' + z(end), 'SUMMARY:' + esc((q.v === 'tech' ? 'Solar Review visit — ' : 'Diagnostic — ') + name), 'LOCATION:' + esc(c.address || ''),
    'DESCRIPTION:' + esc(q.v === 'tech' ? 'Solar Review appointment. Open the lead in the portal: https://fixmy.energy/portal' : 'Solar Review diagnostic visit. Post your findings in the Ops portal when done.'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return { statusCode: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="diagnostic.ics"' }, body: ics };
};
