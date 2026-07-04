// SEO Insights puller — runs daily (see netlify.toml).
// Pulls Google Search Console performance data (and GA4 sessions/conversions if
// configured) into Supabase seo_metrics + seo_queries for the portal's SEO Pulse
// dashboard and the weekly seo-agent analysis.
//
// ENV vars:
//   GSC_SERVICE_ACCOUNT  — full JSON of a Google Cloud service account key.
//                          Setup (one time, ~15 min, desktop):
//                          1. console.cloud.google.com → new project (or existing)
//                          2. Enable "Google Search Console API" (+ "Google Analytics Data API" for GA4)
//                          3. IAM → Service Accounts → Create → Keys → Add key (JSON) → download
//                          4. Search Console → Settings → Users and permissions →
//                             Add user → the service account's client_email → Full
//                          5. (GA4) Analytics Admin → Property access management →
//                             add the same email as Viewer
//                          6. Netlify → env vars → GSC_SERVICE_ACCOUNT = paste the whole JSON
//   GSC_SITE_URL         — optional, defaults to sc-domain:fixmy.energy
//   GA4_PROPERTY_ID      — optional, numeric GA4 property id (Admin → Property settings)
//   SUPA_SERVICE_KEY     — Supabase service role key
//
// Degrades gracefully: without GSC_SERVICE_ACCOUNT it logs and exits 200 (no-op).

const crypto = require('crypto');

const SUPA_URL  = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

function iso(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }

// ── Google service-account OAuth (no SDK — RS256 JWT via node crypto) ──
async function googleToken(sa, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const jwt = unsigned + '.' + signer.sign(sa.private_key.replace(/\\n/g, '\n')).toString('base64url');
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt
  });
  if (!resp.ok) throw new Error('Google token exchange failed: ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
  return (await resp.json()).access_token;
}

async function gscQuery(token, site, body) {
  const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site) + '/searchAnalytics/query';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('GSC query failed: ' + resp.status + ' ' + (await resp.text()).slice(0, 300));
  return (await resp.json()).rows || [];
}

async function supaUpsert(table, rows, onConflict) {
  if (!rows.length) return;
  const key = process.env.SUPA_SERVICE_KEY;
  const resp = await fetch(SUPA_REST + '/' + table + '?on_conflict=' + onConflict, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!resp.ok) throw new Error('Supabase upsert ' + table + ' failed: ' + resp.status + ' ' + (await resp.text()).slice(0, 300));
}

exports.handler = async function() {
  if (!process.env.GSC_SERVICE_ACCOUNT) {
    console.log('seo-insights: GSC_SERVICE_ACCOUNT not set — skipping (see GROWTH_ACTIONS.md for setup)');
    return { statusCode: 200, body: JSON.stringify({ skipped: 'GSC_SERVICE_ACCOUNT not set' }) };
  }
  if (!process.env.SUPA_SERVICE_KEY) {
    console.error('seo-insights: SUPA_SERVICE_KEY not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };
  }

  let sa;
  try { sa = JSON.parse(process.env.GSC_SERVICE_ACCOUNT); }
  catch (e) { return { statusCode: 500, body: JSON.stringify({ error: 'GSC_SERVICE_ACCOUNT is not valid JSON' }) }; }

  const site = process.env.GSC_SITE_URL || 'sc-domain:fixmy.energy';
  const summary = { site, daily: 0, queries: 0, pages: 0, ga4: false };

  try {
    const scopes = ['https://www.googleapis.com/auth/webmasters.readonly'];
    if (process.env.GA4_PROPERTY_ID) scopes.push('https://www.googleapis.com/auth/analytics.readonly');
    const token = await googleToken(sa, scopes);

    // GSC data lags ~2 days. Pull a rolling 30-day window of daily totals.
    const end = iso(daysAgo(2)), start = iso(daysAgo(32));

    // 1. Daily totals → seo_metrics
    const daily = await gscQuery(token, site, {
      startDate: start, endDate: end, dimensions: ['date'], rowLimit: 40
    });
    const metricRows = daily.map(r => ({
      date: r.keys[0], clicks: r.clicks, impressions: r.impressions,
      ctr: r.ctr, position: r.position
    }));

    // 2. GA4 sessions/conversions by date (optional) — merged into the same rows
    if (process.env.GA4_PROPERTY_ID) {
      try {
        const gaResp = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + process.env.GA4_PROPERTY_ID + ':runReport', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateRanges: [{ startDate: start, endDate: end }],
            dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
            limit: 500
          })
        });
        if (gaResp.ok) {
          const ga = await gaResp.json();
          const byDate = {};
          (ga.rows || []).forEach(r => {
            const d = r.dimensionValues[0].value;                       // YYYYMMDD
            const date = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
            const channel = r.dimensionValues[1].value;
            const sessions = parseInt(r.metricValues[0].value || '0', 10);
            const conv = parseInt(r.metricValues[1].value || '0', 10);
            byDate[date] = byDate[date] || { s: 0, o: 0, c: 0 };
            byDate[date].s += sessions;
            byDate[date].c += conv;
            if (channel === 'Organic Search') byDate[date].o += sessions;
          });
          metricRows.forEach(m => {
            const g = byDate[m.date];
            if (g) { m.ga_sessions = g.s; m.ga_organic_sessions = g.o; m.ga_conversions = g.c; }
          });
          summary.ga4 = true;
        } else {
          console.warn('seo-insights: GA4 report failed', gaResp.status, (await gaResp.text()).slice(0, 200));
        }
      } catch (e) { console.warn('seo-insights: GA4 skipped —', e.message); }
    }

    await supaUpsert('seo_metrics', metricRows, 'date');
    summary.daily = metricRows.length;

    // 3. Top queries + pages, last 7 days → snapshot keyed to the window end date
    const qStart = iso(daysAgo(9));
    const [queries, pages] = await Promise.all([
      gscQuery(token, site, { startDate: qStart, endDate: end, dimensions: ['query'], rowLimit: 50 }),
      gscQuery(token, site, { startDate: qStart, endDate: end, dimensions: ['page'],  rowLimit: 25 })
    ]);
    const snap = dim => r => ({
      date: end, dimension: dim, key: r.keys[0].slice(0, 500),
      clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position
    });
    await supaUpsert('seo_queries', queries.map(snap('query')).concat(pages.map(snap('page'))), 'date,dimension,key');
    summary.queries = queries.length;
    summary.pages = pages.length;

    console.log('seo-insights:', JSON.stringify(summary));
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...summary }) };
  } catch (e) {
    console.error('seo-insights:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message, ...summary }) };
  }
};
