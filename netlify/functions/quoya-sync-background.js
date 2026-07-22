// Nightly sweep: categorizes every job_photos row still sitting at
// quoya_status='pending' (or 'failed' with < 3 attempts), across all leads.
// Background function (Netlify allows up to 15 min), scheduled in netlify.toml.
// Safe to also hit manually with no params — no-ops cheaply once the queue is
// caught up (an empty pending queue just returns processed:0 immediately).
//
// Bounded to `limit` photos per run (default 60) so a large backlog costs a
// predictable amount per night rather than spiking Anthropic usage in one go —
// it'll just take a few nights to fully drain a big backlog, which is fine
// since the manual per-lead "Sync with Quoya" button covers anyone who needs
// a specific lead's photos categorized sooner.
//
// ENV vars required: SUPA_SERVICE_KEY, ANTHROPIC_KEY.

const { runSync } = require('./lib/quoya');

exports.handler = async function (event) {
  const anthropicKey = process.env.ANTHROPIC_KEY;
  const supaKey = process.env.SUPA_SERVICE_KEY;
  if (!anthropicKey || !supaKey) {
    console.warn('quoya-sync-background: ANTHROPIC_KEY / SUPA_SERVICE_KEY not set — skipping');
    return { statusCode: 200, body: JSON.stringify({ skipped: 'missing env vars' }) };
  }

  const qs = (event && event.queryStringParameters) || {};
  const limit = Math.min(parseInt(qs.limit, 10) || 60, 200);

  try {
    const results = await runSync({ anthropicKey, jobId: null, limit: limit, delayMs: 300 });
    const ok = results.filter(function (r) { return r.ok; }).length;
    console.log('quoya-sync-background: processed', results.length, '— ok:', ok, 'failed:', results.length - ok);
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed: results.length, succeeded: ok }) };
  } catch (e) {
    console.error('quoya-sync-background failed:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
