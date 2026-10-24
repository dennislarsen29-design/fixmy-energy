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
const BASE = (process.env.LIVEAVATAR_API_BASE || 'https://api.liveavatar.com').replace(/\/$/, '');
const MAX_SECONDS = 300;
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, o) => ({ statusCode: code, headers: cors, body: JSON.stringify(o) });
const originOk = (e) => { const o = (e.headers && (e.headers.origin || e.headers.referer)) || ''; return !o || /fixmy\.energy|localhost|netlify\.app/.test(o); };

async function call(path, init) {
  const r = await fetch(BASE + path, init);
  let body = null; try { body = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, body };
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
  const persona = { language: process.env.LIVEAVATAR_LANGUAGE || 'en' };
  if (process.env.LIVEAVATAR_VOICE_ID) persona.voice_id = process.env.LIVEAVATAR_VOICE_ID;
  if (process.env.LIVEAVATAR_CONTEXT_ID) persona.context_id = process.env.LIVEAVATAR_CONTEXT_ID;
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
    if (!s.ok) { console.error('[quoya-avatar] start failed', s.status, JSON.stringify(s.body)); return out(200, { ok: false, reason: 'start_failed', status: s.status }); }
    const sd = (s.body && (s.body.data || s.body)) || {};
    // Only the connection details the browser needs. The session token stays server-side except where
    // the vendor requires it for the control socket (ws_url already embeds its own credential).
    return out(200, { ok: true, max_seconds: MAX_SECONDS, session_id: sd.session_id || sessionId, livekit_url: sd.livekit_url || null, livekit_client_token: sd.livekit_client_token || null, ws_url: sd.ws_url || null, keys: Object.keys(sd) });
  } catch (e) {
    console.error('[quoya-avatar] error', e.message);
    return out(200, { ok: false, reason: 'network', detail: e.message });
  }
};
