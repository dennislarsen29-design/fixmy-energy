// Scheduled wrapper: kicks off bb-auto-pipeline-background in enrich-only mode.
// Netlify scheduled functions can't pass a custom body, and the pipeline reads
// its mode from the POST body — so this wrapper self-invokes the background
// function with { enrich_only: true }. Runs nightly (see netlify.toml) until
// the ~15K owner-enrichment backlog is flushed; each enrich-only run processes
// up to 2,000 Tracerfy skip-traces and 10 minutes of Regrid owner lookups.
// Safe to leave scheduled permanently — with no backlog it no-ops cheaply.
exports.handler = async function() {
  const base = process.env.URL || 'https://fixmy.energy';
  const target = base + '/.netlify/functions/bb-auto-pipeline-background';
  try {
    const resp = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrich_only: true, triggered_by: 'bb-enrich-only-schedule' })
    });
    console.log('bb-enrich-only: invoked', target, '→', resp.status);
    return { statusCode: 200, body: JSON.stringify({ ok: true, invoked: resp.status }) };
  } catch (e) {
    console.error('bb-enrich-only: invoke failed —', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
