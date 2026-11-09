// Puts scheduled visits on the shared Google calendar for info@fixmy.energy (2026-11-06, per Dennis).
// The portal only names an appointment id; the event title, time, address and notes are all built
// here from the stored rows. Create / move / cancel keep ONE event per appointment: its Google id is
// kept in appointments.notes as "gcal=<id>" (no migration).
// Credential: the same Google service account the Search Console sync uses (app_config key
// 'gsc_service_account'). One-time setup: in Google Calendar (info@fixmy.energy) create a calendar
// named "Ops" (or "Diagnostics"), then Settings and sharing -> Share with specific people -> add the service
// account's email with "Make changes to events". The calendar is found by name, or set
// GOOGLE_DIAG_CALENDAR_ID. ENV: SUPA_SERVICE_KEY.
const crypto = require('crypto');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const TZ = 'America/Los_Angeles';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });
// Field/ops visits go to the shared "Diagnostics" calendar; sales and button-up meetings go to the main
// info@fixmy.energy calendar (Solar Evaluation is NOT here: the GHL booking already puts it there).
const DIAG_TYPES = ['Diagnostic Visit', 'Repair Service Visit', 'Battery Install', 'Install', 'Inspection'];
const MAIN_TYPES = ['Welcome Call', 'Site Survey', 'Results Review'];
const TYPES = DIAG_TYPES.concat(MAIN_TYPES, ['Solar Evaluation', 'Virtual Solar Evaluation']); // evaluations only matter here for Utah leads (San Diego ones are on GHL)
const isUtah = (addr) => { addr = String(addr || ''); if (/,\s*UT\b|\bUtah\b/i.test(addr)) return true; const z = addr.match(/\b\d{5}\b/g); return !!(z && /^84/.test(z[z.length - 1])); }; // last 5-digit run = ZIP (a street number can be 5 digits)

async function googleToken(sa, scopes, sub) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: scopes.join(' '), ...(sub ? { sub } : {}), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signer = crypto.createSign('RSA-SHA256'); signer.update(unsigned);
  const jwt = unsigned + '.' + signer.sign(sa.private_key.replace(/\\n/g, '\n')).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt });
  if (!r.ok) throw new Error('Google token exchange failed: ' + r.status);
  return (await r.json()).access_token;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return out(500, { ok: false, reason: 'server_not_configured' });
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  const aid = String(body.appointmentId || '');
  if (!/^[0-9a-f-]{36}$/i.test(aid)) return out(400, { error: 'bad appointment id' });
  try {
    const ar = await (await fetch(SUPA + '/appointments?id=eq.' + aid + '&select=*&limit=1', { headers: H })).json();
    const a = ar && ar[0]; if (!a) return out(404, { ok: false, reason: 'no_appointment' });
    const cu = await (await fetch(SUPA + '/customers?id=eq.' + a.customer_id + '&select=first_name,last_name,phone,address,email&limit=1', { headers: H })).json();
    const c = (cu && cu[0]) || {};
    const utah = isUtah(c.address);
    const EVALS = ['Solar Evaluation', 'Virtual Solar Evaluation'];
    if (TYPES.indexOf(a.event_type) < 0 || (EVALS.indexOf(a.event_type) >= 0 && !utah)) return out(200, { ok: false, reason: 'not_on_calendar' });
    const notes = String(a.notes || '');
    const m = notes.match(/gcal=([A-Za-z0-9_-]+)/); const evId = m ? m[1] : null;
    if (!evId && a.status === 'canceled') return out(200, { ok: true, action: 'nothing' });
    // credential
    const cr = await (await fetch(SUPA + '/app_config?key=eq.gsc_service_account&select=value', { headers: H })).json();
    let sa = cr && cr[0] && cr[0].value; if (typeof sa === 'string') sa = JSON.parse(sa);
    if (!sa || !sa.client_email) return out(200, { ok: false, reason: 'no_credential' });
    // Preferred: act AS info@fixmy.energy (Workspace domain-wide delegation, no calendar sharing needed).
    // Falls back to the plain service account if delegation isn't authorized yet (then calendars must be shared with it).
    const OWNER = process.env.GOOGLE_CALENDAR_OWNER || 'info@fixmy.energy';
    let token, delegated = false;
    try { token = await googleToken(sa, ['https://www.googleapis.com/auth/calendar'], OWNER); delegated = true; }
    catch (e) { token = await googleToken(sa, ['https://www.googleapis.com/auth/calendar']); }
    const G = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    // find the calendar
    const isMain = MAIN_TYPES.indexOf(a.event_type) >= 0;
    // A calendar shared with a service account does NOT appear in its calendar list, so the calendars are
    // addressed by ID directly (the Ops ID is from its Integrate-calendar settings; the main one is the account address).
    // Salt Lake / Utah leads: every visit goes to the "SLC" calendar (create it in info@fixmy.energy; found by name).
    let slcId = '';
    if (utah) {
      slcId = process.env.GOOGLE_SLC_CALENDAR_ID || '';
      if (!slcId) {
        const cl2 = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer', { headers: G });
        const cj2 = await cl2.json();
        const hit2 = (cj2.items || []).find(x => /^slc\b|salt lake/i.test((x.summary || '').trim()));
        if (!hit2) return out(200, { ok: false, reason: 'no_slc_calendar', service_account: sa.client_email });
        slcId = hit2.id;
      }
    }
    let calId = slcId || (isMain ? process.env.GOOGLE_MAIN_CALENDAR_ID : process.env.GOOGLE_DIAG_CALENDAR_ID)
      || (isMain ? (delegated ? 'primary' : 'info@fixmy.energy') : 'c_9b2e3af563db480729d3e52f05c9cd64092a7a1f8f84510808a750ce8271dca2@group.calendar.google.com');
    if (!calId) {
      const cl = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer', { headers: G });
      const cj = await cl.json();
      const hit = (cj.items || []).find(x => isMain ? (x.id === 'info@fixmy.energy' || /^info@fixmy\.energy$/i.test(x.summary || '')) : /^ops\b|diagnos/i.test((x.summary || '').trim()));
      if (!hit) return out(200, { ok: false, reason: isMain ? 'no_main_calendar' : 'no_calendar', service_account: sa.client_email });
      calId = hit.id;
    }
    const base = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calId) + '/events';
    if (a.status === 'canceled') {
      const d = await fetch(base + '/' + evId, { method: 'DELETE', headers: G });
      return out(200, { ok: d.ok || d.status === 404 || d.status === 410, action: 'deleted' });
    }
    const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Customer';
    const start = new Date(a.starts_at);
    const dateOnly = /date_only/.test(notes);
    const ev = { summary: a.event_type + ' — ' + name, location: c.address || '', description: [c.phone ? 'Phone: ' + c.phone : '', c.email ? 'Email: ' + c.email : '', 'Booked in the Solar Review portal.'].filter(Boolean).join('\n'), reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] } };
    if (dateOnly) {
      const day = start.toLocaleDateString('en-CA', { timeZone: TZ });
      const next = new Date(new Date(day + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
      ev.start = { date: day }; ev.end = { date: next };
    } else {
      const end = a.ends_at ? new Date(a.ends_at) : new Date(start.getTime() + 2 * 3600 * 1000);
      ev.start = { dateTime: start.toISOString(), timeZone: TZ }; ev.end = { dateTime: end.toISOString(), timeZone: TZ };
    }
    let r = evId ? await fetch(base + '/' + evId, { method: 'PUT', headers: G, body: JSON.stringify(ev) }) : null;
    if (!r || r.status === 404 || r.status === 410) r = await fetch(base, { method: 'POST', headers: G, body: JSON.stringify(ev) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) return out(200, { ok: false, reason: isMain ? 'no_main_calendar' : 'no_calendar', service_account: sa.client_email, client_id: sa.client_id });
    if (!r.ok || !j.id) return out(200, { ok: false, reason: 'google_' + r.status, detail: (j.error && j.error.message) || '' });
    if (j.id !== evId) {
      const nn = (notes.replace(/\s*gcal=[A-Za-z0-9_-]+/, '') + ' gcal=' + j.id).trim();
      await fetch(SUPA + '/appointments?id=eq.' + aid, { method: 'PATCH', headers: H, body: JSON.stringify({ notes: nn }) });
    }
    return out(200, { ok: true, action: evId ? 'updated' : 'created' });
  } catch (e) { return out(200, { ok: false, reason: 'error', detail: String(e.message || e).slice(0, 200) }); }
};
