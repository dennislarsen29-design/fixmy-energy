// Server-side relay for GHL Inbound Webhook triggers fired from the browser.
//
// WHY THIS EXISTS (2026-09-18): _ghlWebhookFire in portal.html fires these events
// directly from the browser with `mode:'no-cors'` (required — GHL sends no CORS
// headers back, so a plain `cors` fetch throws on every real success and the app
// can't tell a genuine success apart from a genuine failure). But no-cors also
// restricts which headers the browser is allowed to send: `Content-Type:
// application/json` is NOT on that safelist and gets silently dropped/rewritten,
// so the JSON body always arrived at GHL mislabeled. The 2026-09-07 fix switched
// the body to `URLSearchParams` (application/x-www-form-urlencoded IS safelisted)
// to fix the mislabeling — but that traded one problem for a worse, still-unproven
// one: GHL's Inbound Webhook trigger may only parse a JSON body into named
// `{{trigger.x}}` merge fields, and silently fail to extract ANY field from a
// form-encoded body — which matches exactly what Dennis's 2026-09-18 test showed
// (the workflow DOES trigger — "Added to Workflow" — but Create Contact then
// reports "no value was found for ANY of the mapped fields," even after every
// field was correctly typed as a raw {{trigger.x}} tag).
//
// A server-to-server fetch has none of the browser's no-cors header restrictions,
// so this relay sends GHL a real, accurately-labeled `Content-Type: application/json`
// body — removing the guesswork entirely — and, just as importantly, returns GHL's
// real HTTP status/response text back to the caller. The browser's own no-cors
// fetch always resolves as an OPAQUE response (status 0, unreadable body) even on
// a real failure, which is exactly why this has been hard to diagnose from the
// portal side — every previous attempt could only ever report "the request left
// the device," never whether GHL actually accepted it.
//
// TWO destinations, not one (found 2026-09-19 while auditing for other instances
// of the same bug): GHL_PROPOSAL_WEBHOOK (document-signing / proposal events) was
// the one actually diagnosed and fixed first, but GHL_WEBHOOK (setter-lead capture
// + rep-agreement-signed) used the identical broken mode:'no-cors'+JSON pattern at
// two live call sites (createNewLead's non-real-booking fallback, signRepAgreement)
// — same silent-mislabel bug, never reported because nobody had gone looking at
// THOSE workflows' execution logs yet. The client sends {dest, payload}; `dest` is
// matched against this fixed allowlist by exact key, never used as or built into a
// URL — the actual fetch target is always this server's own stored string, so a
// client can never redirect the relay anywhere outside these two known workflows
// (same anti-SSRF discipline as the single-destination version, and fetch-csv.js's
// host allowlist elsewhere in this codebase).
const DESTINATIONS = {
  // "Solar Review - Customer Agreement Notifications" — document-signing / proposal
  // events. Must stay byte-identical to GHL_PROPOSAL_WEBHOOK in portal.html.
  proposal: 'https://services.leadconnectorhq.com/hooks/gXWwbOVymY0iRfj7c1It/webhook-trigger/2635439a-73e0-4d18-8826-2dc9ba5248a8',
  // Setter-lead capture + rep-agreement-signed. Must stay byte-identical to
  // GHL_WEBHOOK in portal.html.
  general: 'https://services.leadconnectorhq.com/hooks/gXWwbOVymY0iRfj7c1It/webhook-trigger/032a0503-c92f-4711-89c0-0a4659e8e4ff'
};

exports.handler = async function(event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }) };
  }
  if (!body || typeof body !== 'object') {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'body must be an object' }) };
  }

  // Back-compat: an older client shape sent the payload as the whole body with no
  // `dest` wrapper at all — that always meant the proposal webhook, the only one
  // that existed at the time. `dest` defaults to 'proposal' so nothing already
  // deployed can break the moment this ships.
  const destKey = typeof body.dest === 'string' && DESTINATIONS[body.dest] ? body.dest : 'proposal';
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload : body;
  const url = DESTINATIONS[destKey];

  try {
    const ghlResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const ghlText = await ghlResp.text().catch(function () { return ''; });
    console.log('ghl-webhook-relay → dest:', destKey, 'type:', payload.type, 'status:', ghlResp.status, 'body:', ghlText.slice(0, 500));
    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: ghlResp.ok, ghl_status: ghlResp.status, ghl_body: ghlText.slice(0, 1000) })
    };
  } catch (e) {
    console.error('ghl-webhook-relay fetch failed:', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
