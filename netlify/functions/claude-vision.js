// Proxies photo-categorization calls to the Anthropic API, keeping ANTHROPIC_KEY server-side.
//
// Hardened against abuse (this endpoint is public):
//  1. Origin/Referer must be one of our own domains — blocks browser-based cross-origin
//     abuse and casual scripted hits. (A determined caller can spoof Origin via curl, so
//     this is defense-in-depth, not a wall — the payload allowlist below is the real cap.)
//  2. Payload is validated and RECONSTRUCTED, never forwarded raw: model must be one we
//     actually use, max_tokens is capped, and the message shape is constrained. This bounds
//     the cost blast radius even if the origin check is bypassed.

const ALLOWED_MODELS = new Set(['claude-sonnet-5', 'claude-haiku-4-5-20251001']);
const MAX_TOKENS_CAP = 200;
const MAX_BODY_BYTES = 8 * 1024 * 1024; // ~8MB — one base64 photo plus prompt

const ALLOWED_ORIGIN_HOSTS = new Set(['fixmy.energy', 'www.fixmy.energy']);
function originAllowed(event) {
  const h = event.headers || {};
  const src = h.origin || h.Origin || h.referer || h.Referer || '';
  if (!src) return false;
  try {
    const host = new URL(src).hostname.toLowerCase();
    if (ALLOWED_ORIGIN_HOSTS.has(host)) return true;
    if (host.endsWith('.netlify.app')) return true; // deploy previews
    return false;
  } catch (e) { return false; }
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  if (!originAllowed(event)) {
    return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const key = process.env.ANTHROPIC_KEY;
  if (!key) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'ANTHROPIC_KEY env var not set in Netlify' }) };
  }

  if (event.body && Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ error: 'Payload too large' }) };
  }

  let incoming;
  try { incoming = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Validate + reconstruct — never forward the raw body.
  if (!ALLOWED_MODELS.has(incoming.model)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unsupported model' }) };
  }
  if (!Array.isArray(incoming.messages) || incoming.messages.length === 0 || incoming.messages.length > 4) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid messages' }) };
  }
  const maxTokens = Math.min(parseInt(incoming.max_tokens, 10) || 120, MAX_TOKENS_CAP);

  const cleanBody = {
    model: incoming.model,
    max_tokens: maxTokens,
    messages: incoming.messages
  };
  if (typeof incoming.system === 'string' && incoming.system.length < 8000) cleanBody.system = incoming.system;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(cleanBody)
    });

    const data = await resp.json();
    return { statusCode: resp.status, headers: cors, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
