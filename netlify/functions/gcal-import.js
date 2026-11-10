// Reads evaluations Dennis types straight onto the Google calendars (main info@fixmy.energy + SLC) and ties them to the lead
// (2026-11-10, per Dennis). A hand-made event is matched to a lead ONLY by the lead's PHONE number or STREET ADDRESS appearing in
// the event's title / location / description; exactly one lead must match or the event is left alone and listed in
// pipeline_state 'gcal_import_unmatched'. Events the portal wrote itself are skipped. On a match it records the appointment
// (no customer text is sent), stamps the lead's visit date / window, and moves a lead that has no appointment stage to Booked.
// The Ops calendar is never read (everything on it came from the portal). Runs every 10 minutes. ENV: SUPA_SERVICE_KEY.
const crypto = require('crypto');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const TZ = 'America/Los_Angeles';
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

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
const digits = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Lead address -> { num, word, zip }: house number + first street word (+ zip when present).
function addrKey(a) {
  const t = norm(String(a || '').split(',')[0]); const m = t.match(/^(\d+)\s+([a-z0-9]+)/);
  if (!m) return null;
  const zips = String(a || '').match(/\b\d{5}\b/g);
  return { num: m[1], word: m[2], zip: zips ? zips[zips.length - 1] : null };
}

exports.handler = async function () {
  const KEY = process.env.SUPA_SERVICE_KEY; if (!KEY) return { statusCode: 500, body: 'no key' };
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const soonest = {};
  const out = { events: 0, matched: 0, created: 0, updated: 0, canceled: 0, unmatched: [] };
  try {
    const cr = await (await fetch(SUPA + '/app_config?key=eq.gsc_service_account&select=value', { headers: H })).json();
    let sa = cr && cr[0] && cr[0].value; if (typeof sa === 'string') sa = JSON.parse(sa);
    if (!sa || !sa.client_email) return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'no_credential' }) };
    const token = await googleToken(sa, ['https://www.googleapis.com/auth/calendar'] /* the scope authorized for delegation */, process.env.GOOGLE_CALENDAR_OWNER || 'info@fixmy.energy');
    const G = { Authorization: 'Bearer ' + token };
    const cl = await (await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', { headers: G })).json();
    const cals = (cl.items || []).filter(x => x.primary || /^slc\b|salt lake/i.test((x.summary || '').trim()));
    const leads = await (await fetch(SUPA + '/customers?select=id,first_name,last_name,phone,address,step,solar_status,lead_category,sold_type&archived=not.is.true&or=(black_box.is.null,black_box.eq.false)&order=updated_at.desc&limit=3000', { headers: H })).json();
    const active = (Array.isArray(leads) ? leads : []).filter(l => digits(l.phone).length >= 10 || addrKey(l.address));
    const timeMin = new Date(Date.now() - 86400000).toISOString(), timeMax = new Date(Date.now() + 60 * 86400000).toISOString();
    for (const cal of cals) {
      const er = await (await fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(cal.id) + '/events?singleEvents=true&showDeleted=true&maxResults=250&orderBy=startTime&timeMin=' + encodeURIComponent(timeMin) + '&timeMax=' + encodeURIComponent(timeMax), { headers: G })).json();
      for (const ev of (er.items || [])) {
        if (!ev.start || !ev.start.dateTime) continue;                       // all-day entries are not appointments
        const text = [ev.summary, ev.location, ev.description].filter(Boolean).join(' \n ');
        if (/Booked in the Solar Review portal\./.test(text)) continue;      // the portal wrote this one
        out.events++;
        const evKey = 'gcalimp=' + String(ev.id).replace(/[^A-Za-z0-9_-]/g, '');
        const have = await (await fetch(SUPA + '/appointments?notes=ilike.*' + encodeURIComponent(evKey) + '*&select=id,customer_id,starts_at,status&limit=1', { headers: H })).json();
        const row = have && have[0];
        if (ev.status === 'cancelled') {
          if (row && row.status === 'scheduled') { await fetch(SUPA + '/appointments?id=eq.' + row.id, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'canceled', updated_at: new Date().toISOString() }) }); out.canceled++; }
          continue;
        }
        const start = new Date(ev.start.dateTime), end = ev.end && ev.end.dateTime ? new Date(ev.end.dateTime) : new Date(start.getTime() + 2 * 3600000);
        let lead = row ? active.find(l => l.id === row.customer_id) : null;
        if (!lead) {
          const dText = digits(text), nText = ' ' + norm(text) + ' ';
          const hits = active.filter(l => {
            const p = digits(l.phone).slice(-10);
            if (p.length === 10 && dText.indexOf(p) >= 0) return true;
            const k = addrKey(l.address); if (!k) return false;
            return nText.indexOf(' ' + k.num + ' ' + k.word) >= 0 && (k.num.length >= 3 || (k.zip && nText.indexOf(k.zip) >= 0)); // a short house number needs the ZIP too
          });
          if (hits.length !== 1) { out.unmatched.push({ title: ev.summary || '', start: ev.start.dateTime, candidates: hits.length }); continue; }
          lead = hits[0];
        }
        out.matched++;
        const type = /virtual/i.test(text) ? 'Virtual Solar Evaluation' : 'Solar Evaluation';
        const win = fmtTime(start) + ' – ' + fmtTime(end);
        if (row) {
          if (new Date(row.starts_at).getTime() !== start.getTime() || row.status !== 'scheduled') {
            await fetch(SUPA + '/appointments?id=eq.' + row.id, { method: 'PATCH', headers: H, body: JSON.stringify({ starts_at: start.toISOString(), ends_at: end.toISOString(), status: 'scheduled', updated_at: new Date().toISOString() }) });
            out.updated++;
          } else continue;
        } else {
          // already recorded from the portal at (about) this time? then do not add a second row
          const dup = await (await fetch(SUPA + '/appointments?customer_id=eq.' + lead.id + '&status=eq.scheduled&starts_at=gte.' + encodeURIComponent(new Date(start.getTime() - 1800000).toISOString()) + '&starts_at=lte.' + encodeURIComponent(new Date(start.getTime() + 1800000).toISOString()) + '&select=id&limit=1', { headers: H })).json();
          if (dup && dup.length) continue;
          const ins = await fetch(SUPA + '/appointments', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ customer_id: lead.id, event_type: type, starts_at: start.toISOString(), ends_at: end.toISOString(), status: 'scheduled', created_by: 'gcal_import', notes: evKey, notified_at: new Date().toISOString() }) });
          if (!ins.ok) continue;
          out.created++;
        }
        const patch = { diagnostic_date: start.toISOString(), arrival_end: end.toISOString(), arrival_window: win };
        if (lead.lead_category === 'new_solar') { if (!lead.solar_status || lead.solar_status === 'ns_eval_canceled') patch.solar_status = 'ns_eval_booked'; }
        else if (!lead.sold_type && !(parseInt(lead.step, 10) >= 1)) patch.step = 1;
        // a lead can match several events: the card shows the EARLIEST upcoming one
        if (start.getTime() > Date.now() && (!soonest[lead.id] || start < soonest[lead.id].start)) soonest[lead.id] = { start, patch };
      }
    }
    for (const id of Object.keys(soonest)) await fetch(SUPA + '/customers?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify(soonest[id].patch) });
    if (out.unmatched.length) await fetch(SUPA + '/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'gcal_import_unmatched', value: { at: new Date().toISOString(), items: out.unmatched.slice(0, 20) } }) });
    return { statusCode: 200, body: JSON.stringify(Object.assign({ ok: true }, out)) };
  } catch (e) { return { statusCode: 200, body: JSON.stringify({ ok: false, reason: String(e.message || e).slice(0, 200) }) }; }
};
