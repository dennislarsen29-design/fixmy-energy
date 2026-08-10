/**
 * seo-insights.js — GA4 half.
 *
 * The bug this guards: GA4 rows used to be merged INTO the Search Console rows,
 * so a window where Search Console returned nothing (this site since July)
 * silently discarded a perfectly good GA4 response. Setting GA4_PROPERTY_ID
 * would then look like it had done nothing at all.
 *
 *   node scratchpad/test-seo-ga4.js
 */
const crypto = require('crypto');
const path = require('path');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = (m) => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

// A real RSA key, so googleToken's crypto.createSign works unmodified.
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const FN = path.join(__dirname, '..', 'netlify', 'functions', 'seo-insights.js');

function gaRow(date, channel, sessions, keyEvents) {
  return {
    dimensionValues: [{ value: date }, { value: channel }],
    metricValues: [{ value: String(sessions) }, { value: String(keyEvents) }]
  };
}

// Runs the handler against stubbed Google + Supabase, returns what it tried to write.
async function run({ gscRows, gaRows, gaStatus = 200, propertyId = '534612604' }) {
  delete require.cache[require.resolve(FN)];

  process.env.SUPA_SERVICE_KEY = 'test-service-key';
  process.env.SUPA_URL = 'https://example.supabase.co';
  process.env.GSC_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'seo-bot@fixmy.iam.gserviceaccount.com',
    private_key: privateKey
  });
  if (propertyId) process.env.GA4_PROPERTY_ID = propertyId;
  else delete process.env.GA4_PROPERTY_ID;

  const wrote = { seo_metrics: null, seo_queries: null };
  let status = null;
  let scopesAsked = null;

  global.fetch = async (url, opts) => {
    const u = String(url);
    const body = opts && opts.body ? String(opts.body) : '';

    if (u.includes('oauth2.googleapis.com/token')) {
      const jwt = decodeURIComponent((body.match(/assertion=([^&]+)/) || [])[1] || '');
      const claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
      scopesAsked = claims.scope;
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    }
    if (u.includes('webmasters/v3')) {
      const dims = JSON.parse(body).dimensions || [];
      // Only the daily-totals query is under test; query/page snapshots return [].
      const rows = dims[0] === 'date' ? gscRows : [];
      return { ok: true, status: 200, json: async () => ({ rows }) };
    }
    if (u.includes('analyticsdata.googleapis.com')) {
      if (gaStatus !== 200) {
        return { ok: false, status: gaStatus, text: async () => '{"error":"denied"}' };
      }
      return { ok: true, status: 200, json: async () => ({ rows: gaRows }) };
    }
    if (u.includes('/pipeline_state')) {
      status = JSON.parse(JSON.parse(body).value);
      return { ok: true, status: 200, text: async () => '' };
    }
    if (u.includes('/seo_metrics')) {
      wrote.seo_metrics = JSON.parse(body);
      return { ok: true, status: 200, text: async () => '' };
    }
    if (u.includes('/seo_queries')) {
      wrote.seo_queries = JSON.parse(body);
      return { ok: true, status: 200, text: async () => '' };
    }
    if (u.includes('/app_config')) {
      return { ok: true, status: 200, json: async () => [] };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };

  const mod = require(FN);
  const res = await mod.handler();
  return { wrote, status, scopesAsked, res: JSON.parse(res.body) };
}

(async () => {
  const d1 = '2026-08-05', d2 = '2026-08-06';

  // ── 1. THE BUG: Search Console empty, GA4 has data ────────────────────────
  console.log('\n[1] Search Console returns nothing, GA4 has data');
  {
    const { wrote, status, res } = await run({
      gscRows: [],
      gaRows: [gaRow('20260805', 'Direct', 27, 3), gaRow('20260805', 'Organic Search', 7, 1)]
    });
    const rows = wrote.seo_metrics || [];
    if (rows.length > 0) ok('GA4 rows were written despite zero Search Console rows');
    else bad('GA4 data discarded — the reported bug');

    const r = rows[0] || {};
    if (r.ga_sessions === 34) ok('sessions summed across channels (27 + 7)');
    else bad('ga_sessions wrong: ' + r.ga_sessions);
    if (r.ga_organic_sessions === 7) ok('organic split out correctly');
    else bad('ga_organic_sessions wrong: ' + r.ga_organic_sessions);
    if (r.ga_conversions === 4) ok('key events summed (3 + 1)');
    else bad('ga_conversions wrong: ' + r.ga_conversions);

    if (status && status.status === 'ok_no_rows') ok('status still reports Search Console as empty');
    else bad('status hid the empty Search Console window: ' + (status && status.status));
    if (res.ga4 === true) ok('run reports ga4:true');
    else bad('run reports ga4:' + res.ga4);
  }

  // ── 2. union keeps both sources, one row shape ────────────────────────────
  console.log('\n[2] both sources present, differing dates');
  {
    const { wrote } = await run({
      gscRows: [{ keys: [d1], clicks: 2, impressions: 40, ctr: 0.05, position: 6.3 }],
      gaRows: [gaRow('20260805', 'Direct', 10, 1), gaRow('20260806', 'Direct', 5, 0)]
    });
    const rows = wrote.seo_metrics || [];
    if (rows.length === 2) ok('union produced 2 dates from a 1-row GSC + 2-date GA4');
    else bad('expected 2 rows, got ' + rows.length);

    const a = rows.find(r => r.date === d1) || {};
    if (a.clicks === 2 && a.ga_sessions === 10) ok('overlapping date carries BOTH sources');
    else bad('overlap lost data: ' + JSON.stringify(a));

    const b = rows.find(r => r.date === d2) || {};
    if (b.ga_sessions === 5 && b.clicks === null) ok('GA4-only date has null Search Console columns');
    else bad('GA4-only row wrong: ' + JSON.stringify(b));

    // PostgREST rejects a bulk insert whose objects have differing keys.
    const shapes = new Set(rows.map(r => Object.keys(r).sort().join(',')));
    if (shapes.size === 1) ok('all rows share one key shape (PostgREST PGRST102)');
    else bad('mismatched row shapes: ' + [...shapes].join(' | '));
  }

  // ── 3. GA4 403 names the actual remedy ────────────────────────────────────
  console.log('\n[3] GA4 returns 403');
  {
    const { status } = await run({
      gscRows: [{ keys: [d1], clicks: 2, impressions: 40, ctr: 0.05, position: 6.3 }],
      gaRows: [], gaStatus: 403
    });
    if (status && status.ga4Reason === 'ga4_http_403') ok('status carries ga4_http_403');
    else bad('reason wrong: ' + (status && status.ga4Reason));
    if (status && /Property Access Management/.test(status.ga4Hint || '')) ok('hint names the exact fix');
    else bad('hint unhelpful: ' + (status && status.ga4Hint));
    if (status && /534612604/.test(status.ga4Hint || '')) ok('hint names the property');
    else bad('hint omits the property id');
    if (status && status.status === 'ok') ok('Search Console still reported as ok (not conflated)');
    else bad('a GA4 failure took down the whole status: ' + (status && status.status));
  }

  // ── 4. GA4 404 = wrong property id, different message ─────────────────────
  console.log('\n[4] GA4 returns 404');
  {
    const { status } = await run({
      gscRows: [{ keys: [d1], clicks: 1, impressions: 9, ctr: 0.1, position: 5 }],
      gaRows: [], gaStatus: 404
    });
    if (status && /Property Settings/.test(status.ga4Hint || '')) ok('404 points at the Property ID, not access');
    else bad('404 hint wrong: ' + (status && status.ga4Hint));
    if (status && status.ga4Reason !== 'ga4_http_403') ok('403 and 404 are distinguishable');
    else bad('404 collapsed into the 403 message');
  }

  // ── 5. unset property id is stated, not silent ────────────────────────────
  console.log('\n[5] GA4_PROPERTY_ID not set');
  {
    const { status, scopesAsked } = await run({
      gscRows: [{ keys: [d1], clicks: 1, impressions: 9, ctr: 0.1, position: 5 }],
      gaRows: [], propertyId: null
    });
    if (status && status.ga4Reason === 'ga4_not_configured') ok('reports ga4_not_configured');
    else bad('unset property was silent: ' + (status && status.ga4Reason));
    if (!/analytics.readonly/.test(scopesAsked || '')) ok('analytics scope not requested when unconfigured');
    else bad('asked for the analytics scope with no property');
  }

  // ── 6. scope is requested when configured ─────────────────────────────────
  console.log('\n[6] analytics scope requested when configured');
  {
    const { scopesAsked } = await run({
      gscRows: [], gaRows: [gaRow('20260805', 'Direct', 1, 0)]
    });
    if (/analytics.readonly/.test(scopesAsked || '')) ok('token minted with analytics.readonly');
    else bad('missing analytics scope: ' + scopesAsked);
    if (/webmasters.readonly/.test(scopesAsked || '')) ok('search console scope retained');
    else bad('lost the webmasters scope');
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
