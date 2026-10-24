// Customer "Get started" actions (2026-10-24, per Dennis): from /booked -> magic link the customer picks
//   Option 1  Quoya Evaluation (guided self-evaluation) -- with "request a Virtual Evaluation" help, or
//   Option 2  straight to the paid Diagnostic.
// Public endpoint, so: the customer is verified with id + portal code (same rules as doc-sign), the caller
// only names an action, and everything else (fee, wording, recipients) is built here from our records.
const crypto = require('crypto');
const notify = require('./lib/notify');
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });
const VIRTUAL_FEE = 599.99;       // preset Diagnostic fee on Virtual leads
const DEFAULT_REP = 'tech4';
const LEAD_DAYS = 14;             // earliest Diagnostic is booked 2+ weeks out on Virtual leads

function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); if (d.length > 11) d = d.slice(-10); return d; }
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }
function codeMatches(code, c) {
  const n = normPhone(code);
  return (n.length >= 10 && (n === normPhone(c.phone) || n === normPhone(c.access_code))) || safeEqual(code, c.access_code) || safeEqual(code, c.phone);
}
function heads() { const k = process.env.SUPA_SERVICE_KEY; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }

exports.handler = async (event, ctx, deps) => {
  const doFetch = (deps && deps.fetch) || fetch;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: Object.assign({}, cors, { 'Access-Control-Allow-Headers': 'Content-Type' }), body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  const id = String(b.customerId || ''), action = String(b.action || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || ['assist', 'diagnostic', 'submitted', 'nosolar', 'book_virtual', 'progress'].indexOf(action) < 0) return out(400, { error: 'bad request' });
  if (!process.env.SUPA_SERVICE_KEY) return out(500, { error: 'not configured' });
  const H = heads();
  const get = async (path) => (await (await doFetch(SUPA_URL + '/rest/v1' + path, { headers: H })).json().catch(() => null));
  const c = ((await get('/customers?id=eq.' + id + '&select=id,first_name,last_name,email,phone,address,access_code,rep_id,eval_mode,notes,invoice_status,invoice_amount,sign_token,sign_token_expires_at,agreement_status,sold_type&limit=1')) || [])[0];
  if (!c || !codeMatches(b.code, c)) return out(403, { error: 'We could not verify this link.' });

  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'A customer';
  let notes = []; try { notes = JSON.parse(c.notes || '[]'); if (!Array.isArray(notes)) notes = []; } catch (e) { notes = []; }
  const addNote = async (text) => {
    notes.push({ ts: new Date().toISOString(), by: '🧭 Customer — Get started', text });
    await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id, { method: 'PATCH', headers: H, body: JSON.stringify({ notes: JSON.stringify(notes) }) });
  };
  // one staff text per customer+action per day
  const alertStaff = async (msg, tag) => {
    const key = 'startalert_' + tag + '_' + id + '_' + new Date().toISOString().slice(0, 10);
    const seen = ((await get('/pipeline_state?key=eq.' + encodeURIComponent(key) + '&select=value')) || [])[0];
    if (seen) return { skipped: 'already_sent' };
    const ids = [c.rep_id || DEFAULT_REP]; if (ids.indexOf(DEFAULT_REP) < 0) ids.push(DEFAULT_REP);
    const results = [];
    for (const tid of ids) {
      const tm = ((await get('/team_members?id=eq.' + encodeURIComponent(tid) + '&select=name,phone&limit=1')) || [])[0];
      if (!tm || !tm.phone) { results.push({ to: tid, ok: false, reason: 'no_phone' }); continue; }
      const r = await notify.sendSms({ phone: tm.phone, first_name: tm.name }, msg, doFetch);
      results.push({ to: tid, ok: r.ok, reason: r.reason });
    }
    if (results.some(r => r.ok)) await doFetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key, value: JSON.stringify({ ts: Date.now() }), updated_at: new Date().toISOString() }) }).catch(() => {});
    return { results };
  };

  if (action === 'submitted' || action === 'nosolar') {
    const nosolar = action === 'nosolar';
    await addNote(nosolar ? 'Customer says they have no solar yet (answered in their own evaluation) — new-solar consult.' : 'Customer finished their own guided evaluation (photos / bill / answers are on the lead).');
    const s = await alertStaff(name + (nosolar ? ' says they have no solar yet — please reach out about a new-solar consult.' : ' finished their guided evaluation. Photos and answers are on the lead — review and call ' + (c.phone || 'them') + '.'), action);
    return out(200, { ok: true, staff: s });
  }

  if (action === 'book_virtual') {
    // Customer picked a time from the real Evaluation calendar (ghl-slots). Books it through the same
    // ghl-book path, titled "Virtual Solar Evaluation", records the event for the portal, alerts the team.
    const sISO = new Date(b.startISO), eISO = new Date(b.endISO || (sISO.getTime() + 7200000));
    if (isNaN(sISO) || isNaN(eISO) || sISO < new Date(Date.now() - 3600000) || sISO > new Date(Date.now() + 30 * 86400000)) return out(400, { error: 'That time is not available. Please pick another.' });
    if (!c.phone && !c.email) return out(400, { error: 'We need a phone or email on file to book.' });
    let res;
    try {
      res = await require('./ghl-book').handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ firstName: c.first_name, lastName: c.last_name, phone: c.phone, email: c.email, address: c.address, startISO: sISO.toISOString(), endISO: eISO.toISOString(), customerId: id, virtual: true }) });
    } catch (e) { return out(502, { error: 'Could not reach the calendar. Please call us.' }); }
    let r = {}; try { r = JSON.parse(res.body || '{}'); } catch (e) {}
    if (!r.ok || !r.appointmentId) return out(502, { error: 'That time could not be booked. Please pick another or call us.' });
    // ghl-book (virtual:true) records the appointment row and sends the customer's Google Meet confirmation itself.
    const when = sISO.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    await addNote('Customer booked a Virtual Solar Evaluation for ' + when + ' (on the Evaluation calendar).');
    await alertStaff(name + ' booked a Virtual Solar Evaluation for ' + when + '. It is on the calendar.', 'vbook_' + sISO.getTime());
    return out(200, { ok: true, when });
  }

  if (action === 'progress') {
    // Live tracking of the customer's own Quoya Solar Evaluation (2026-10-24, per Dennis): one lead note per
    // distinct stage (never twice), and a staff text when they START. Server builds the wording; the client
    // only names a stage from a fixed list.
    const stage = String(b.stage || '');
    const STEPS = { triage: 'Site Check questions', hardware: 'Inverter & meter photos', powercycle: 'Safety check / power cycle', consumption: 'Utility bill', cdone: 'Final review (ready to send)' };
    let label = null;
    if (stage === 'started') label = 'started their Quoya Solar Evaluation';
    else if (stage === 'bill_read') label = 'uploaded their utility bill — Quoya read it';
    else if (/^step:[a-z]+$/.test(stage) && STEPS[stage.slice(5)]) label = 'reached: ' + STEPS[stage.slice(5)];
    else if (/^photo:[A-Za-z0-9 \-]{1,40}$/.test(stage)) label = 'uploaded: ' + stage.slice(6);
    if (!label) return out(400, { error: 'bad stage' });
    const tag = '[qe:' + stage + ']';
    if (notes.some(n => String(n.text || '').indexOf(tag) >= 0)) return out(200, { ok: true, deduped: true });
    await addNote('Customer ' + label + '. ' + tag);
    let staff = null;
    if (stage === 'started') staff = await alertStaff(name + ' just started their Quoya Solar Evaluation. Progress will post to their lead notes.', 'qe_started');
    return out(200, { ok: true, staff });
  }

  if (action === 'assist') {
    await addNote('Customer asked for a Virtual Evaluation (live help with Quoya) — please call them.');
    const s = await alertStaff(name + ' asked for help with their evaluation (Virtual Evaluation). Please call ' + (c.phone || 'them') + '.', 'assist');
    return out(200, { ok: true, staff: s });
  }

  // action === 'diagnostic'
  if (c.invoice_status === 'paid') return out(200, { ok: true, state: 'already_paid' });
  const earliest = new Date(Date.now() + LEAD_DAYS * 86400000).toISOString().slice(0, 10);
  if (c.eval_mode === 'virtual') {
    let token = c.sign_token, exp = c.sign_token_expires_at;
    const valid = token && exp && new Date(exp) > new Date() && Number(c.invoice_amount) === VIRTUAL_FEE;
    if (!valid) {
      token = crypto.randomUUID(); exp = new Date(Date.now() + 72 * 3600000).toISOString();
      const r = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify({ invoice_amount: VIRTUAL_FEE, invoice_status: 'sent', sign_token: token, sign_token_expires_at: exp }) });
      const rows = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(rows) || !rows.length) return out(500, { error: 'Could not prepare your checkout. Please call us.' });
    }
    await addNote('Customer chose "Straight to Diagnostic" (Virtual, $' + VIRTUAL_FEE + '). Sign & Pay link issued; earliest visit ' + earliest + '.');
    await alertStaff(name + ' chose Diagnostic (Virtual, $' + VIRTUAL_FEE + '). Sign & Pay link issued. Start finding an electrician — earliest visit ' + earliest + '.', 'diag');
    return out(200, { ok: true, state: 'pay', url: 'https://fixmy.energy/sign?t=' + token, fee: VIRTUAL_FEE, earliest });
  }
  // Local: the Tech sets the fee, so the customer does not pick a price.
  await addNote('Customer chose "Straight to Diagnostic" — Tech to set the fee and send the Sign & Pay link.');
  const s = await alertStaff(name + ' wants to go straight to the Diagnostic. Set the fee and send the Sign & Pay link. Call ' + (c.phone || 'them') + '.', 'diag');
  return out(200, { ok: true, state: 'tech_will_send', staff: s });
};
