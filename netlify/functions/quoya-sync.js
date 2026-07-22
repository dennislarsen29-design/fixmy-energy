// Manual "Sync with Quoya" button — portal.html calls this when someone taps
// the sync button in a lead's Photos section. Scoped to one lead (job_id or
// customer_id) and bounded small (<=20 photos) so it finishes well inside the
// default ~10s Netlify function timeout and can return real results to the UI
// immediately (unlike quoya-sync-background.js, which is fire-and-forget).
//
// See netlify/functions/lib/quoya.js for why this exists: uploads used to run
// this same Claude vision call synchronously DURING upload, which made
// multi-photo uploads slow and let one flaky AI call fail the whole batch.
//
// ENV vars required: SUPA_SERVICE_KEY, ANTHROPIC_KEY.

const { runSync } = require('./lib/quoya');

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!originAllowed(event)) return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Forbidden' }) };

  const anthropicKey = process.env.ANTHROPIC_KEY;
  const supaKey = process.env.SUPA_SERVICE_KEY;
  if (!anthropicKey || !supaKey) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'ANTHROPIC_KEY / SUPA_SERVICE_KEY not set in Netlify' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { /* empty body is fine, job_id required check below catches it */ }
  const jobId = body.job_id || (event.queryStringParameters || {}).job_id;
  if (!jobId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'job_id required' }) };
  const limit = Math.min(parseInt(body.limit, 10) || 20, 25);

  try {
    const results = await runSync({ anthropicKey, jobId, limit, delayMs: 250 });
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, processed: results.length, results: results }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
