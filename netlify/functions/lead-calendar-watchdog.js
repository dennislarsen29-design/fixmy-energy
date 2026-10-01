// lead-calendar-watchdog.js — fail-safe so a new lead can never silently miss the calendar.
//
// Every 10 min: find FixMy leads created >10 min ago (so a booking in progress isn't flagged)
// and <7 days ago that are still step 1, unsold, and have NO arrival_window. arrival_window is
// only written after a real GHL calendar booking (ghl-book.js) or the diagnostic scheduler,
// so its absence means "not on the calendar" — same rule as the Command Center alert.
// For each, SMS the assigned Tech (default Dennis/tech4) via GHL and email Dennis via Resend.
// Alert state lives in pipeline_state key 'lead_calendar_alerts' ({id: {n, at}}) — no migration.
// Alerts once at 10 min, then ONE reminder after 2h; booked leads drop out on their own.
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const GRACE_MIN = 10, REMIND_MIN = 120, LOOKBACK_DAYS = 7, MAX_ALERTS = 2;

exports.handler = async function () {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!key) { console.error('[lead-watchdog] SUPA_SERVICE_KEY not set'); return { statusCode: 200, body: 'no key' }; }
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const REST = SUPA_URL + '/rest/v1';
  const get = async p => { const r = await fetch(REST + p, { headers: H }); if (!r.ok) throw new Error(p + ' → HTTP ' + r.status); return r.json(); };

  try {
    const now = Date.now();
    const since = new Date(now - LOOKBACK_DAYS * 864e5).toISOString();
    const before = new Date(now - GRACE_MIN * 60000).toISOString();
    const leads = await get('/customers?select=id,first_name,last_name,phone,address,rep_id,created_at,diagnostic_date'
      + '&arrival_window=is.null&sold_type=is.null&step=lte.1&created_at=gte.' + since + '&created_at=lte.' + before
      + '&and=(or(archived.is.null,archived.eq.false),or(black_box.is.null,black_box.eq.false),or(partial_capture.is.null,partial_capture.eq.false),or(lead_category.is.null,lead_category.neq.new_solar))'
      + '&order=created_at.desc&limit=100');

    let state = {};
    try {
      const rows = await get('/pipeline_state?key=eq.lead_calendar_alerts&select=value');
      if (rows[0] && rows[0].value) state = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    } catch (e) { /* first run */ }

    const due = leads.filter(l => {
      const s = state[l.id];
      if (!s) return true;
      return s.n < MAX_ALERTS && now - new Date(s.at).getTime() > REMIND_MIN * 60000;
    });
    // Forget leads that got booked/archived so the state row can't grow forever.
    const live = new Set(leads.map(l => l.id));
    Object.keys(state).forEach(id => { if (!live.has(id)) delete state[id]; });

    if (!due.length) { await save(H, REST, state); return { statusCode: 200, body: 'nothing due (' + leads.length + ' off-calendar)' }; }

    const nameOf = l => ((l.first_name || '') + ' ' + (l.last_name || '')).trim() || 'Unnamed lead';
    const results = { sms: 0, email: false };

    // SMS each assigned tech (default Dennis) about their own leads.
    const GHL_KEY = process.env.GHL_API_KEY, GHL_LOC = process.env.GHL_LOCATION_ID;
    if (GHL_KEY && GHL_LOC) {
      const byTech = {};
      due.forEach(l => { (byTech[l.rep_id || 'tech4'] = byTech[l.rep_id || 'tech4'] || []).push(l); });
      for (const techId of Object.keys(byTech)) {
        try {
          const tm = (await get('/team_members?id=eq.' + encodeURIComponent(techId) + '&select=name,phone'))[0];
          if (!tm || !tm.phone) { console.warn('[lead-watchdog] no phone for', techId); continue; }
          const d = tm.phone.replace(/\D/g, ''); const e164 = d.length === 10 ? '+1' + d : '+' + d;
          const gh = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GHL_KEY, Version: '2021-07-28' };
          const up = await (await fetch(GHL_BASE + '/contacts/upsert', { method: 'POST', headers: gh, body: JSON.stringify({ firstName: tm.name || techId, phone: e164, locationId: GHL_LOC }) })).json();
          const cid = up.contact && up.contact.id; if (!cid) continue;
          const names = byTech[techId].slice(0, 4).map(nameOf).join(', ') + (byTech[techId].length > 4 ? ' +' + (byTech[techId].length - 4) : '');
          const msg = 'NEW LEAD not yet on Calendar! ' + names + ' — book it: fixmy.energy/portal';
          const r = await fetch(GHL_BASE + '/conversations/messages', { method: 'POST', headers: gh, body: JSON.stringify({ type: 'SMS', contactId: cid, message: msg, locationId: GHL_LOC }) });
          if (r.ok) results.sms++; else console.error('[lead-watchdog] SMS failed', r.status, await r.text());
        } catch (e) { console.error('[lead-watchdog] SMS error', e.message); }
      }
    }

    // Email Dennis the full list.
    const RESEND = process.env.RESEND_API_KEY, TO = process.env.AGENT_REPORT_EMAIL || 'dennislarsen29@gmail.com';
    if (RESEND) {
      try {
        const rows = due.map(l => '<li><b>' + esc(nameOf(l)) + '</b> — ' + esc(l.address || 'no address') + ' · ' + esc(l.phone || 'no phone') + '</li>').join('');
        const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'Solar Review <info@fixmy.energy>', to: [TO], subject: '⚠️ NEW LEAD not yet on Calendar! (' + due.length + ')',
            html: '<p>These leads came in but are not on the calendar yet:</p><ul>' + rows + '</ul><p><a href="https://fixmy.energy/portal">Open the portal</a></p>' }) });
        results.email = r.ok; if (!r.ok) console.error('[lead-watchdog] Resend', r.status, await r.text());
      } catch (e) { console.error('[lead-watchdog] email error', e.message); }
    }

    // Only mark as alerted if at least one channel actually delivered — otherwise retry next run.
    if (results.sms || results.email) due.forEach(l => { state[l.id] = { n: ((state[l.id] || {}).n || 0) + 1, at: new Date().toISOString() }; });
    await save(H, REST, state);
    console.log('[lead-watchdog] due', due.length, JSON.stringify(results));
    return { statusCode: 200, body: JSON.stringify({ due: due.length, ...results }) };
  } catch (e) {
    console.error('[lead-watchdog] failed:', e.message);
    return { statusCode: 200, body: 'error: ' + e.message };
  }
};

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
async function save(H, REST, state) {
  await fetch(REST + '/pipeline_state', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'lead_calendar_alerts', value: JSON.stringify(state), updated_at: new Date().toISOString() }) });
}
