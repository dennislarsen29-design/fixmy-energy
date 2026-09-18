// Server-side relay for the document-signing / proposal GHL Inbound Webhook.
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
exports.handler = async function(event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  // Fixed destination — the client can only ever send a payload, never a URL.
  // Prevents this from ever becoming an open relay / SSRF hole (same discipline
  // already applied to fetch-csv.js's host allowlist elsewhere in this codebase).
  // Must stay byte-identical to GHL_PROPOSAL_WEBHOOK in portal.html — the "Solar
  // Review - Customer Agreement Notifications" workflow's Inbound Webhook trigger.
  const GHL_WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/gXWwbOVymY0iRfj7c1It/webhook-trigger/2635439a-73e0-4d18-8826-2dc9ba5248a8';

  let payload;
  try { payload = JSON.parse(event.body); } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }) };
  }
  if (!payload || typeof payload !== 'object') {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'payload must be an object' }) };
  }

  try {
    const ghlResp = await fetch(GHL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const ghlText = await ghlResp.text().catch(function () { return ''; });
    console.log('ghl-webhook-relay → type:', payload.type, 'status:', ghlResp.status, 'body:', ghlText.slice(0, 500));
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
