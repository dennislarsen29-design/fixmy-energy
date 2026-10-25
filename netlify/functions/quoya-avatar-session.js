// Live Quoya avatar session broker (LiveAvatar FULL mode: HeyGen runs speech-in, the brain and the voice). The vendor API key lives ONLY here
// (Netlify env HEYGEN_API_KEY) and is never sent to the browser.
//
// Contract used (from LiveAvatar's public docs/search results; NOT yet exercised against the live API
// from the dev sandbox -- the first real call is the test):
//   POST {BASE}/v1/sessions/token   header X-API-KEY, body {mode:'FULL', avatar_id, avatar_persona:{voice_id, context_id, language}}  -> session token
//   POST {BASE}/v1/sessions/start   header Authorization: Bearer <session token>      -> livekit + ws details
// Env: HEYGEN_API_KEY (required), LIVEAVATAR_AVATAR_ID, LIVEAVATAR_VOICE_ID, LIVEAVATAR_CONTEXT_ID (voice/context
// optional but without a context the avatar runs in restricted mode), LIVEAVATAR_LANGUAGE (default 'en'),
// LIVEAVATAR_SANDBOX=1 for free test sessions, LIVEAVATAR_API_BASE
// (optional, default https://api.liveavatar.com).
//
// Actions:
//   {action:'check'}  mints a session token only (validates the key + avatar; starting a session is what
//                     bills credits, so this is safe to run). Never returns the key or the token.
//   {action:'start'}  mints + starts a session and returns what the browser needs to connect.
// Hard cap: MAX_SECONDS is passed through where the API supports it and also enforced client-side.
const crypto = require('crypto');
const brain = require('./lib/quoya-brain');
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const BASE = (process.env.LIVEAVATAR_API_BASE || 'https://api.liveavatar.com').replace(/\/$/, '');
const MAX_SECONDS = Math.max(30, parseInt(process.env.LIVEAVATAR_MAX_SECONDS, 10) || 120); // free plan caps a session at 120s; raise via env on a paid plan
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, o) => ({ statusCode: code, headers: cors, body: JSON.stringify(o) });
const originOk = (e) => { const o = (e.headers && (e.headers.origin || e.headers.referer)) || ''; return !o || /fixmy\.energy|localhost|netlify\.app/.test(o); };

// Best-effort cost guard: max 6 real session starts per IP per hour (per warm function instance).
const STARTS = new Map();
function tooMany(ip) {
  const now = Date.now(), arr = (STARTS.get(ip) || []).filter(t => now - t < 3600000);
  if (arr.length >= 6) { STARTS.set(ip, arr); return true; }
  arr.push(now); STARTS.set(ip, arr); return false;
}

async function call(path, init) {
  const r = await fetch(BASE + path, init);
  let body = null; try { body = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, body };
}


// ---- Per-customer, per-checkpoint context (2026-10-25) ----
function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); if (d.length > 11) d = d.slice(-10); return d; }
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }
function codeMatches(code, c) { const n = normPhone(code); return (n.length >= 10 && (n === normPhone(c.phone) || n === normPhone(c.access_code))) || safeEqual(code, c.access_code) || safeEqual(code, c.phone); }
function sheads() { const k = process.env.SUPA_SERVICE_KEY; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }
async function sget(path) { try { return await (await fetch(SUPA_URL + '/rest/v1' + path, { headers: sheads() })).json(); } catch (e) { return null; } }

async function loadFacts(b) {
  if (!process.env.SUPA_SERVICE_KEY) return null;
  const cols = 'id,first_name,address,phone,access_code,diagnostic_date,eval_mode,utility';
  let c = null;
  if (/^[0-9a-f-]{36}$/i.test(String(b.customerId || ''))) {
    c = ((await sget('/customers?id=eq.' + b.customerId + '&select=' + cols)) || [])[0];
    if (!c || !codeMatches(b.code, c)) return null;
  } else if (/^[0-9a-f-]{20,}$/i.test(String(b.signToken || ''))) {
    c = ((await sget('/customers?sign_token=eq.' + encodeURIComponent(b.signToken) + '&select=' + cols)) || [])[0];
  }
  if (!c) return null;
  const ev = ((await sget('/lead_evaluations?customer_id=eq.' + c.id + '&select=answers,bill_analysis&limit=1')) || [])[0] || {};
  const ph = (await sget('/job_photos?or=(job_id.eq.' + c.id + ',customer_id.eq.' + c.id + ')&select=label,expected_label')) || [];
  const labels = []; (Array.isArray(ph) ? ph : []).forEach(p => { const l = p.label || p.expected_label; if (l && labels.indexOf(l) < 0) labels.push(l); });
  const a = ev.answers || {};
  let appt = null;
  if (c.diagnostic_date) { const d = new Date(c.diagnostic_date); if (!isNaN(d) && d.getTime() > Date.now() - 45 * 60000) appt = d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Pacific'; }
  const first = String(c.first_name || '').trim().split(/\s+/)[0];
  const diag = !!(a.quoya_report && a.quoya_report.diag);
  return { id: c.id, first: first, hi: first ? ' ' + first : '', address: c.address, appt: appt, utility: c.utility, answers: a, photos: labels, billRead: !!(ev.bill_analysis && Object.keys(ev.bill_analysis).length), diag: diag, restored: a.pc_outcome === 'restored' && !diag };
}

// One LiveAvatar context per customer, rewritten for the current checkpoint. Returns the context id or null.
async function upsertContext(key, facts, step) {
  const built = brain.buildContext(facts, step);
  const body = JSON.stringify({ name: built.name, prompt: built.prompt, opening_text: built.opening });
  const H = { 'X-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' };
  const stateKey = 'qa_ctx_' + facts.id;
  const row = ((await sget('/pipeline_state?key=eq.' + encodeURIComponent(stateKey) + '&select=value')) || [])[0];
  let ctxId = row && row.value && row.value.id;
  if (ctxId) {
    const u = await call('/v1/contexts/' + ctxId, { method: 'PATCH', headers: H, body });
    if (u.ok) return ctxId;
    console.error('[quoya-avatar] context patch failed', u.status, JSON.stringify(u.body));
  }
  const cr = await call('/v1/contexts', { method: 'POST', headers: H, body });
  if (!cr.ok) { console.error('[quoya-avatar] context create failed', cr.status, JSON.stringify(cr.body)); return null; }
  const d = (cr.body && (cr.body.data || cr.body)) || {};
  ctxId = d.id || d.context_id || null;
  if (ctxId) { try { await fetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, sheads(), { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: stateKey, value: { id: ctxId } }) }); } catch (e) {} }
  return ctxId;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: Object.assign({}, cors, { 'Access-Control-Allow-Headers': 'Content-Type' }), body: '' };
  if (!originOk(event)) return out(403, { ok: false, reason: 'forbidden' });
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return out(200, { ok: false, reason: 'not_configured' });
  const avatarId = process.env.LIVEAVATAR_AVATAR_ID;
  if (!avatarId) return out(200, { ok: false, reason: 'no_avatar_id' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  const action = b.action === 'start' ? 'start' : 'check';
  if (action === 'start' && tooMany((event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'])) || 'unknown')) return out(200, { ok: false, reason: 'rate_limited' });
  const persona = { language: process.env.LIVEAVATAR_LANGUAGE || 'en' };
  if (process.env.LIVEAVATAR_VOICE_ID) persona.voice_id = process.env.LIVEAVATAR_VOICE_ID;
  let ctxMode = 'default';
  if (process.env.LIVEAVATAR_CONTEXT_ID) persona.context_id = process.env.LIVEAVATAR_CONTEXT_ID;
  if (action === 'start') {
    try {
      const facts = await loadFacts(b);
      if (facts) { const cid = await upsertContext(key, facts, String(b.step || 'welcome')); if (cid) { persona.context_id = cid; ctxMode = 'custom'; } }
    } catch (e) { console.error('[quoya-avatar] context error', e.message); }
  }
  const tokenBody = { mode: 'FULL', avatar_id: avatarId, avatar_persona: persona, max_session_duration: MAX_SECONDS };
  if (process.env.LIVEAVATAR_SANDBOX === '1') tokenBody.is_sandbox = true;
  try {
    const t = await call('/v1/sessions/token', { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(tokenBody) });
    if (!t.ok) { console.error('[quoya-avatar] token failed', t.status, JSON.stringify(t.body)); return out(200, { ok: false, reason: 'token_failed', status: t.status, detail: t.body && (t.body.message || t.body.error || t.body.detail) || null }); }
    const d = (t.body && (t.body.data || t.body)) || {};
    const sessionToken = d.session_token || d.token;
    const sessionId = d.session_id || d.id || null;
    if (!sessionToken) { console.error('[quoya-avatar] no token field; keys:', Object.keys(d)); return out(200, { ok: false, reason: 'unexpected_token_shape', keys: Object.keys(d) }); }
    if (action === 'check') return out(200, { ok: true, checked: true, session_id_present: !!sessionId });
    const s = await call('/v1/sessions/start', { method: 'POST', headers: { Authorization: 'Bearer ' + sessionToken, 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
    if (!s.ok) { console.error('[quoya-avatar] start failed', s.status, JSON.stringify(s.body)); return out(200, { ok: false, reason: 'start_failed', status: s.status, detail: s.body && (s.body.message || s.body.error || s.body.detail || JSON.stringify(s.body).slice(0,300)) || null }); }
    const sd = (s.body && (s.body.data || s.body)) || {};
    // Only the connection details the browser needs. The session token stays server-side except where
    // the vendor requires it for the control socket (ws_url already embeds its own credential).
    return out(200, { ok: true, ctx: ctxMode, max_seconds: MAX_SECONDS, session_id: sd.session_id || sessionId, livekit_url: sd.livekit_url || null, livekit_client_token: sd.livekit_client_token || null, ws_url: sd.ws_url || null, keys: Object.keys(sd) });
  } catch (e) {
    console.error('[quoya-avatar] error', e.message);
    return out(200, { ok: false, reason: 'network', detail: e.message });
  }
};
