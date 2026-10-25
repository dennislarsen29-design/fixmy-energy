// Quoya conversation capture (2026-10-25, per Dennis). The browser buffers the live conversation IN MEMORY ONLY and sends
// it here only after the homeowner has agreed (a tap on "Yes, share" or a spoken yes right after Quoya asked). This
// function verifies the customer (id + portal code, or the Sign & Pay token), has Claude write a short summary + flags,
// stores ONE note per session on the lead (re-sent flushes replace it), logs a lead_activity row, and texts the team
// when something needs follow-up. California is an all-party-consent state: refusing consent means nothing is sent.
const crypto = require('crypto');
const notify = require('./lib/notify');
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, o) => ({ statusCode: code, headers: cors, body: JSON.stringify(o) });
const DEFAULT_REP = 'tech4';
const MAX_CHARS = 14000;

function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); if (d.length > 11) d = d.slice(-10); return d; }
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }
function codeMatches(code, c) { const n = normPhone(code); return (n.length >= 10 && (n === normPhone(c.phone) || n === normPhone(c.access_code))) || safeEqual(code, c.access_code) || safeEqual(code, c.phone); }
function heads() { const k = process.env.SUPA_SERVICE_KEY; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }

async function summarize(transcript, doFetch) {
  const key = process.env.ANTHROPIC_KEY;
  if (!key) return null;
  try {
    const r = await doFetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
      system: 'You summarize a conversation between a homeowner and Quoya, Solar Review\'s AI solar technician, for the human team. Reply with ONLY JSON: {"summary":"2-4 plain sentences of what the homeowner said and needs","flags":["short tags such as system_down, bill_spike, second_system, complaint, hvac, ev, pool, question_unanswered, wants_callback"],"needs_followup":true|false}. Use only what was said. Never invent facts or numbers.',
      messages: [{ role: 'user', content: transcript.slice(-9000) }] }) });
    const j = await r.json(); const t = j && j.content && j.content[0] && j.content[0].text || '';
    const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null;
  } catch (e) { return null; }
}

exports.handler = async (event, ctx, deps) => {
  const doFetch = (deps && deps.fetch) || fetch;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: Object.assign({}, cors, { 'Access-Control-Allow-Headers': 'Content-Type' }), body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  const o = (event.headers && (event.headers.origin || event.headers.referer)) || '';
  if (o && !/fixmy\.energy|localhost|netlify\.app/.test(o)) return out(403, { error: 'forbidden' });
  if (!process.env.SUPA_SERVICE_KEY) return out(500, { error: 'not configured' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  if (!b.consent || !b.consent.at || ['tap', 'voice'].indexOf(b.consent.method) < 0) return out(400, { error: 'consent required' });
  const sid = String(b.sessionId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (!sid) return out(400, { error: 'bad session' });
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(-400).map(l => ({ who: l && l.who === 'customer' ? 'Customer' : 'Quoya', text: String((l && l.text) || '').slice(0, 800) })).filter(l => l.text);
  if (!lines.length) return out(200, { ok: true, saved: 0 });
  const H = heads();
  const get = async (path) => (await (await doFetch(SUPA_URL + '/rest/v1' + path, { headers: H })).json().catch(() => null));
  const cols = 'id,first_name,last_name,phone,access_code,rep_id,notes';
  let c = null;
  if (/^[0-9a-f-]{36}$/i.test(String(b.customerId || ''))) {
    c = ((await get('/customers?id=eq.' + b.customerId + '&select=' + cols)) || [])[0];
    if (!c || !codeMatches(b.code, c)) return out(403, { error: 'We could not verify this link.' });
  } else if (/^[0-9a-f-]{20,}$/i.test(String(b.signToken || ''))) {
    c = ((await get('/customers?sign_token=eq.' + encodeURIComponent(b.signToken) + '&select=' + cols)) || [])[0];
  }
  if (!c) return out(403, { error: 'We could not verify this link.' });

  let transcript = lines.map(l => l.who + ': ' + l.text).join('\n'); if (transcript.length > MAX_CHARS) transcript = transcript.slice(-MAX_CHARS);
  const sum = await summarize(transcript, doFetch);
  const tag = '[qa:' + sid + ']';
  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'A customer';
  const body = '🤖 Quoya conversation' + (b.step ? ' (at ' + String(b.step).slice(0, 20) + ')' : '') + ' — shared by the homeowner with consent (' + b.consent.method + ', ' + String(b.consent.at).slice(0, 19) + 'Z) ' + tag + '\n'
    + (sum && sum.summary ? 'Summary: ' + sum.summary + '\n' + (sum.flags && sum.flags.length ? 'Flags: ' + sum.flags.join(', ') + '\n' : '') : '')
    + '--- transcript ---\n' + transcript;
  let notes = []; try { notes = JSON.parse(c.notes || '[]'); if (!Array.isArray(notes)) notes = []; } catch (e) { notes = []; }
  const idx = notes.findIndex(n => n && typeof n.text === 'string' && n.text.indexOf(tag) >= 0);
  const entry = { ts: idx >= 0 ? notes[idx].ts : new Date().toISOString(), by: '🤖 Quoya (AI)', text: body };
  if (idx >= 0) notes[idx] = entry; else notes.push(entry);
  await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, { method: 'PATCH', headers: H, body: JSON.stringify({ notes: JSON.stringify(notes) }) });
  if (idx < 0) { try { await doFetch(SUPA_URL + '/rest/v1/lead_activity', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ customer_id: c.id, channel: 'quoya', outcome: null, note: (sum && sum.summary) || 'Quoya conversation shared by the homeowner.', rep_id: 'quoya', rep_name: 'Quoya (AI)' }) }); } catch (e) {} }

  let alerted = null;
  if (sum && sum.needs_followup) {
    const key = 'quoyaalert_' + c.id + '_' + new Date().toISOString().slice(0, 10);
    const seen = ((await get('/pipeline_state?key=eq.' + encodeURIComponent(key) + '&select=value')) || [])[0];
    if (!seen) {
      const ids = [c.rep_id || DEFAULT_REP]; if (ids.indexOf(DEFAULT_REP) < 0) ids.push(DEFAULT_REP);
      const results = [];
      for (const tid of ids) {
        const tm = ((await get('/team_members?id=eq.' + encodeURIComponent(tid) + '&select=name,phone&limit=1')) || [])[0];
        if (!tm || !tm.phone) continue;
        const r = await notify.sendSms({ phone: tm.phone, first_name: tm.name }, name + ' talked to Quoya and shared this: ' + String(sum.summary || '').slice(0, 220) + ' (see the lead notes)', doFetch);
        results.push(!!r.ok);
      }
      alerted = results.some(Boolean);
      if (alerted) await doFetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: { at: new Date().toISOString() } }) });
    }
  }
  return out(200, { ok: true, saved: lines.length, summarized: !!sum, flagged: !!(sum && sum.needs_followup), alerted: alerted });
};
