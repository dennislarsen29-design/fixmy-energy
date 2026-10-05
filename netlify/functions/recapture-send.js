// Sends ONE rep-approved recapture touch (SMS + email, from Solar Review) — 2026-10-05, per Dennis.
// Public endpoint, so it is deliberately narrow:
//   - origin allowlist; caller names only the customer id + the (rep-edited) wording;
//   - the customer must actually be in a Paused / Not-interested exit and still have touches left
//     (3 max, 2 for sensitive) — it cannot text a lead who was never set aside, nor exceed the cap;
//   - one touch per customer per 6 days; message length capped; a STOP line is always appended;
//   - recipient is read from the customer's own record, never from the request.
// After a send it advances recapture_touches and schedules the next touch (~30d, then ~60d), or ends
// the sequence. Stopping is also here (action:'stop'). ENV: SUPA_SERVICE_KEY, GHL_API_KEY, RESEND_API_KEY.
const notify = require('./lib/notify');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const ALLOWED = new Set(['fixmy.energy', 'www.fixmy.energy']);
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const out = (c, o) => ({ statusCode: c, headers: cors, body: JSON.stringify(o) });
function originOk(e) { const h = e.headers || {}; const s = h.origin || h.Origin || h.referer || h.Referer || ''; if (!s) return false; try { const x = new URL(s).hostname.toLowerCase(); return ALLOWED.has(x) || x.endsWith('.netlify.app'); } catch (_) { return false; } }
const DAY = 864e5;
const NEXT_DAYS = [30, 30]; // gap after touch 1, after touch 2 (touch 3 ends the sequence)

exports.handler = async function (event, context, deps) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method Not Allowed' });
  if (!originOk(event)) return out(403, { error: 'Forbidden' });
  const KEY = process.env.SUPA_SERVICE_KEY; if (!KEY) return out(500, { error: 'Server misconfigured' });
  const doFetch = (deps && deps.fetch) || fetch;
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'Invalid JSON' }); }
  const id = String(b.customerId || ''); if (!/^[0-9a-fA-F-]{36}$/.test(id)) return out(400, { error: 'Bad customerId' });

  const r = await doFetch(SUPA + '/customers?id=eq.' + id + '&select=id,first_name,last_name,email,phone,access_code,disposition_exit,recapture_touches,recapture_sensitive,recapture_last_at,notes&limit=1', { headers: H });
  const rows = await r.json().catch(() => null); const c = Array.isArray(rows) && rows[0];
  if (!c) return out(404, { error: 'Customer not found' });

  const patch = async (body) => doFetch(SUPA + '/customers?id=eq.' + id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(body) });

  if (b.action === 'stop') {
    await patch({ recapture_next_at: null });
    return out(200, { ok: true, stopped: true });
  }
  if (c.disposition_exit !== 'paused' && c.disposition_exit !== 'not_interested') return out(409, { ok: false, reason: 'not_in_recapture' });
  const max = c.recapture_sensitive ? 2 : 3;
  const done = c.recapture_touches || 0;
  if (done >= max) return out(409, { ok: false, reason: 'sequence_complete' });
  if (c.recapture_last_at && Date.now() - new Date(c.recapture_last_at).getTime() < 6 * DAY) return out(429, { ok: false, reason: 'too_soon' });
  if (!notify.toE164(c.phone) && !notify.validEmail(c.email)) return out(200, { ok: false, reason: 'no_contact' });

  const sms = String(b.sms || '').replace(/\s+/g, ' ').trim().slice(0, 320);
  const subject = String(b.email_subject || '').trim().slice(0, 90) || 'Checking in from Solar Review';
  const body = String(b.email_body || '').trim().slice(0, 1200);
  if (sms.length < 10 && body.length < 10) return out(400, { error: 'empty_message' });
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const smsFull = sms + '\nReply STOP to opt out.';
  const mail = { subject, heading: subject, lines: body.split(/\n+/).filter(Boolean).map(esc).concat(['If you would rather not hear from us, just reply and we will stop.']), cta: null };

  const result = await notify.sendBoth(c, smsFull, mail, doFetch);
  if (!result.ok) return out(200, result);

  const touches = done + 1;
  const upd = { recapture_touches: touches, recapture_last_at: new Date().toISOString() };
  upd.recapture_next_at = touches >= max ? null : new Date(Date.now() + NEXT_DAYS[Math.min(touches - 1, NEXT_DAYS.length - 1)] * DAY).toISOString();
  // Timeline note in the same JSON-array shape the portal's notes feed uses (best effort).
  try {
    let arr = []; try { arr = Array.isArray(c.notes) ? c.notes : JSON.parse(c.notes || '[]'); } catch (e) { arr = []; }
    arr.push({ ts: new Date().toISOString(), by: 'Recapture', text: 'Follow-up ' + touches + ' of ' + max + ' sent (' + (result.sms.ok ? 'text' : '') + (result.sms.ok && result.email.ok ? ' + ' : '') + (result.email.ok ? 'email' : '') + '): ' + (sms || body).slice(0, 160) });
    upd.notes = arr;
  } catch (e) {}
  await patch(upd);
  console.log('recapture-send', id, 'touch', touches, 'sms', result.sms.ok ? 'ok' : result.sms.reason, 'email', result.email.ok ? 'ok' : result.email.reason);
  return out(200, Object.assign({ touches, max }, result));
};
