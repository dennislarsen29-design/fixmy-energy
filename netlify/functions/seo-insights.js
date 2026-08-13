// SEO Insights puller — runs daily (see netlify.toml).
// Pulls Google Search Console performance data (and GA4 sessions/conversions if
// configured) into Supabase seo_metrics + seo_queries for the portal's SEO Pulse
// dashboard and the weekly seo-agent analysis.
//
// Credentials:
//   The Google service-account key JSON lives in the Supabase app_config table
//   (key = 'gsc_service_account') — NOT in a Netlify env var, because AWS
//   Lambda caps all env vars at 4KB total and the key alone is ~2.5KB.
//   Store it once in the Supabase SQL Editor:
//     insert into app_config (key, value)
//     values ('gsc_service_account', '<paste the whole JSON key file here>'::jsonb)
//     on conflict (key) do update set value = excluded.value, updated_at = now();
//   (A GSC_SERVICE_ACCOUNT env var still works as an override if it ever fits.)
//
// ENV vars:
//   GSC_SITE_URL         — optional, defaults to sc-domain:fixmy.energy
//   GA4_PROPERTY_ID      — optional, numeric GA4 property id (Admin → Property settings)
//   SUPA_SERVICE_KEY     — Supabase service role key (also used to read app_config)
//
// Degrades gracefully: without a stored key it logs and exits 200 (no-op).

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
  if (!resp.ok) {
    const e = new Error('GSC query failed: ' + resp.status + ' ' + (await resp.text()).slice(0, 300));
    e.httpStatus = resp.status;
    throw e;
  }
  return (await resp.json()).rows || [];
}

// A dead key, a revoked Search Console grant, a property that no longer exists, and a
// site that genuinely got zero impressions are four different problems with four
// different fixes. Name them, or the operator is left guessing — which is exactly what
// happened here: this sync died 2026-07-13 and nothing anywhere recorded why.
function classifyFailure(e) {
  const s = e && e.httpStatus;
  const msg = String((e && e.message) || '');
  if (s === 401 || /invalid_grant|Invalid JWT|token exchange failed/i.test(msg))
    return { reason: 'auth', hint: 'The service-account key is rejected by Google — most likely disabled, deleted, or expired by an org key-rotation policy. Create a new key in GCP → IAM → Service Accounts and re-store it in app_config.' };
  if (s === 403)
    return { reason: 'forbidden', hint: 'Google authenticated the key but refused the property — the service account has lost its Search Console access, or the Search Console API is disabled on the GCP project. Re-add ' + '(the service-account email)' + ' as a user on the property.' };
  if (s === 404)
    return { reason: 'property_not_found', hint: 'Search Console has no property matching GSC_SITE_URL. A domain property is "sc-domain:fixmy.energy"; a URL-prefix property is "https://fixmy.energy/". They are different objects — check which one is verified.' };
  if (s === 429)
    return { reason: 'rate_limited', hint: 'Google rate-limited the request. Usually transient; the next scheduled run should recover.' };
  return { reason: 'upstream', hint: msg.slice(0, 200) };
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

// Every terminal path writes here, so the portal can tell a live sync from a dead one.
// ⚠️ Deliberately pipeline_state, NOT app_config: app_config holds this very
// service-account key plus the Plaid access tokens and is service-role-only, while
// pipeline_state is already read by the portal with the anon key and carries no
// secrets. A health stamp must never be the reason a secrets table gets opened up.
// No migration — same snapshot-row pattern as the Black Box pipeline's own status.
async function writeStatus(status, extra) {
  try {
    const key = process.env.SUPA_SERVICE_KEY;
    const at = new Date().toISOString();
    await fetch(SUPA_REST + '/pipeline_state', {
      method: 'POST',
      headers: {
        apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        key: 'seo_sync_status',
        value: JSON.stringify({ at, status, ...(extra || {}) }),
        updated_at: at
      })
    });
  } catch (e) {
    // Never let the health-stamp be the thing that kills the run.
    console.warn('seo-insights: status write failed —', e.message);
  }
}

// Load the service-account key: env var override first, then app_config table.
async function loadServiceAccount() {
  if (process.env.GSC_SERVICE_ACCOUNT) {
    try { return JSON.parse(process.env.GSC_SERVICE_ACCOUNT); }
    catch (e) { throw new Error('GSC_SERVICE_ACCOUNT env var is not valid JSON'); }
  }
  const key = process.env.SUPA_SERVICE_KEY;
  const resp = await fetch(SUPA_REST + '/app_config?key=eq.gsc_service_account&select=value', {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  });
  if (!resp.ok) {
    console.warn('seo-insights: app_config read failed', resp.status, (await resp.text()).slice(0, 200));
    return null;
  }
  const rows = await resp.json();
  if (!rows.length) return null;
  const v = rows[0].value;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

exports.handler = async function() {
  if (!process.env.SUPA_SERVICE_KEY) {
    console.error('seo-insights: SUPA_SERVICE_KEY not set');
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };
  }

  let sa;
  try { sa = await loadServiceAccount(); }
  catch (e) {
    await writeStatus('failed', { reason: 'credential_unreadable', hint: e.message.slice(0, 200) });
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
  if (!sa || !sa.client_email || !sa.private_key) {
    console.log('seo-insights: no service-account key found in app_config — skipping (see GROWTH_ACTIONS.md)');
    await writeStatus('skipped', { reason: 'no_credential', hint: 'No service-account key in app_config (key = gsc_service_account). See the header of seo-insights.js.' });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skipped: 'service account not configured — insert it into app_config (see function header)' }) };
  }

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

    // 2 & 4. GA4 sessions-by-date AND GA4 sessions-by-campaign are two independent
    // Data API calls sharing the same token — fired CONCURRENTLY rather than back to
    // back. This function makes up to 9 sequential external round trips end to end
    // (app_config, token exchange, GSC daily, GSC queries+pages, 3 Supabase upserts,
    // both GA4 reports); adding the campaign report as a second sequential Google call
    // pushed a cold start further into Netlify's execution-time risk, which showed up
    // in the field as the manual test URL returning nothing at all — not an error,
    // just silence, because the invocation never finished. Promise.all here removes
    // one full round trip from the critical path at zero behavior change.
    const ga4PropertyId = process.env.GA4_PROPERTY_ID;
    const [gaRespResult, campRespResult] = await Promise.all([
      ga4PropertyId ? fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + ga4PropertyId + ':runReport', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
          limit: 500
        })
      }).catch(e => ({ __fetchError: e })) : Promise.resolve(null),
      ga4PropertyId ? fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + ga4PropertyId + ':runReport', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'sessionCampaignName' }],
          metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
          orderBys: [{ metric: { metricName: 'keyEvents' }, desc: true }],
          limit: 200
        })
      }).catch(e => ({ __fetchError: e })) : Promise.resolve(null)
    ]);

    if (ga4PropertyId) {
      try {
        if (gaRespResult && gaRespResult.__fetchError) throw gaRespResult.__fetchError;
        const gaResp = gaRespResult;
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
          // ⚠️ UNION the GA4 dates with the Search Console dates — never merge only
          // INTO them. Search Console returning zero rows is a legitimate answer for
          // a site with no impressions (exactly this site's situation since July),
          // and an inner join then silently discards a perfectly good GA4 response.
          // The portal shows nothing and it reads as "the Property ID is wrong"
          // rather than "GSC is empty" — two very different problems.
          const byRowDate = {};
          metricRows.forEach(m => { byRowDate[m.date] = m; });
          Object.keys(byDate).forEach(date => {
            const g = byDate[date];
            let m = byRowDate[date];
            if (!m) { m = { date }; byRowDate[date] = m; metricRows.push(m); }
            m.ga_sessions = g.s; m.ga_organic_sessions = g.o; m.ga_conversions = g.c;
          });
          summary.ga4Days = Object.keys(byDate).length;
          summary.ga4 = summary.ga4Days > 0;
          if (!summary.ga4) {
            summary.ga4Reason = 'ga4_no_rows';
            summary.ga4Hint = 'GA4 answered normally but reported no sessions in the window.';
          }
        } else {
          const detail = (await gaResp.text()).slice(0, 200);
          const pid = process.env.GA4_PROPERTY_ID;
          summary.ga4Reason = 'ga4_http_' + gaResp.status;
          summary.ga4Hint =
            gaResp.status === 403 ? 'The service account cannot read GA4 property ' + pid + '. Add its client_email as a Viewer in GA4 → Admin → Property Access Management.'
          : gaResp.status === 404 ? 'GA4 property ' + pid + ' not found. Check the numeric Property ID in GA4 → Admin → Property Settings (not the G- measurement ID).'
          : gaResp.status === 401 ? 'GA4 auth rejected — the service-account key is disabled or rotated.'
          : 'GA4 Data API returned ' + gaResp.status + '.';
          console.warn('seo-insights: GA4 report failed', gaResp.status, detail);
        }
      } catch (e) {
        summary.ga4Reason = 'ga4_error';
        summary.ga4Hint = String(e.message).slice(0, 200);
        console.warn('seo-insights: GA4 skipped —', e.message);
      }
    } else {
      summary.ga4Reason = 'ga4_not_configured';
      summary.ga4Hint = 'GA4_PROPERTY_ID is not set, so no Analytics numbers are pulled.';
    }

    // PostgREST rejects a bulk insert whose objects have differing keys
    // (PGRST102 "All object keys must match"), and after the union some rows
    // carry GA4 columns while others don't. Normalise every row to one shape.
    const COLS = ['date', 'clicks', 'impressions', 'ctr', 'position',
                  'ga_sessions', 'ga_organic_sessions', 'ga_conversions'];
    metricRows.forEach(m => { COLS.forEach(c => { if (m[c] === undefined) m[c] = null; }); });
    metricRows.sort((a, b) => a.date < b.date ? -1 : 1);

    await supaUpsert('seo_metrics', metricRows, 'date');
    summary.daily = metricRows.length;
    // ⚠️ Google answering with zero rows is a REAL answer (the site got no impressions
    // in the window) and must not look like a broken credential. supaUpsert returns
    // early on an empty array, so without this the run writes nothing and still says
    // ok — indistinguishable from the failure that actually took this sync down.
    // Judged on the Search Console rows specifically — after the union above,
    // metricRows can be non-empty purely from GA4, which would otherwise hide
    // the fact that GSC itself reported nothing.
    summary.emptyWindow = daily.length === 0;

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

    // 4. Campaign-source breakdown, same 30-day window → seo_campaigns snapshot. The
    // fetch already happened above, concurrently with the per-date GA4 report — this
    // is just processing the response. Answers "which source/campaign actually
    // produces bookings" without any Google Ads API access — GA4 already carries
    // sessionSource/Medium/CampaignName for every session, Ads or otherwise, as long
    // as gclid/gbraid landed correctly (they do — book.html/index.html/thank-you.html
    // all capture them, see CLAUDE.md).
    // ⚠️ Independently guarded, like every optional add-on here: a missing
    // seo_campaigns table (unapplied migration) or a Data API hiccup must not take
    // down the GSC/GA4 pull above, which is the part everything else depends on.
    if (process.env.GA4_PROPERTY_ID) {
      try {
        if (campRespResult && campRespResult.__fetchError) throw campRespResult.__fetchError;
        const campResp = campRespResult;
        if (campResp.ok) {
          const camp = await campResp.json();
          const campaignRows = (camp.rows || []).map(r => ({
            date: end,
            source: r.dimensionValues[0].value || '(not set)',
            medium: r.dimensionValues[1].value || '(not set)',
            campaign: r.dimensionValues[2].value || '(not set)',
            sessions: parseInt(r.metricValues[0].value || '0', 10),
            key_events: parseInt(r.metricValues[1].value || '0', 10)
          }));
          await supaUpsert('seo_campaigns', campaignRows, 'date,source,medium,campaign');
          summary.campaigns = campaignRows.length;
        } else {
          summary.campaignsReason = 'http_' + campResp.status;
          console.warn('seo-insights: campaign breakdown failed', campResp.status, (await campResp.text()).slice(0, 200));
        }
      } catch (e) {
        // A missing table (PGRST205, unapplied migration) lands here too — expected
        // until 20260813_seo_campaigns.sql is run, and deliberately non-fatal.
        summary.campaignsReason = 'error: ' + e.message;
        console.warn('seo-insights: campaign breakdown skipped —', e.message);
      }
    }

    console.log('seo-insights:', JSON.stringify(summary));
    // ⚠️ writeStatus() takes an explicit field list rather than spreading ...summary —
    // deliberate, so a stray field on `summary` can't leak into the persisted status
    // unreviewed. But that means every new summary field has to be added HERE too, or
    // it's silently invisible to the one diagnostic surface built for troubleshooting
    // this function — exactly what happened to campaigns/campaignsReason: computed
    // correctly, present in the raw HTTP response, absent from every status check run
    // against pipeline_state while debugging why the campaign report looked broken.
    await writeStatus(summary.emptyWindow ? 'ok_no_rows' : 'ok', {
      days: summary.daily, queries: summary.queries, pages: summary.pages,
      ga4: summary.ga4, ga4Days: summary.ga4Days || 0,
      ga4Reason: summary.ga4Reason || null, ga4Hint: summary.ga4Hint || null,
      campaigns: summary.campaigns != null ? summary.campaigns : null,
      campaignsReason: summary.campaignsReason || null,
      site, window: start + '→' + end,
      hint: summary.emptyWindow
        ? 'Google answered normally but reported zero impressions for the whole window. The credential is fine — the site genuinely has no search visibility.'
        : null
    });
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, ...summary }) };
  } catch (e) {
    const c = classifyFailure(e);
    console.error('seo-insights:', c.reason, '—', e.message);
    await writeStatus('failed', { reason: c.reason, hint: c.hint, site, detail: String(e.message).slice(0, 300) });
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message, reason: c.reason, hint: c.hint, ...summary }) };
  }
};
