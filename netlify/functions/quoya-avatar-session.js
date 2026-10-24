// Live Quoya avatar session broker (2026-10-24). The vendor API key lives ONLY here (Netlify env
// HEYGEN_API_KEY) and is never sent to the browser. Until it is configured -- and a vendor session
// contract is wired in below -- this honestly answers not_configured so the page shows the video/HUD
// Quoya instead of pretending to be live.
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: Object.assign({}, cors, { 'Access-Control-Allow-Headers': 'Content-Type' }), body: '' };
  if (!process.env.HEYGEN_API_KEY) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'not_configured' }) };
  // TODO(vendor): mint a LiveAvatar session token here (LITE mode: our own Claude brain + Google voice)
  // and return { ok:true, url, token }. Needs the LiveAvatar API reference, which was not reachable
  // when this was written, so it is deliberately not guessed.
  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'not_wired' }) };
};
