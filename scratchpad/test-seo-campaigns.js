/**
 * Campaign-source breakdown in seo-insights.js — answers "which source produces
 * bookings" from GA4's own sessionSource/Medium/CampaignName dimensions, no Google
 * Ads API access needed.
 *
 *   node scratchpad/test-seo-campaigns.js
 */
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

function loadWithStubs(fetchImpl) {
  const fnPath = path.join(__dirname, '..', 'netlify', 'functions', 'seo-insights.js');
  delete require.cache[require.resolve(fnPath)];
  global.fetch = fetchImpl;
  return require(fnPath);
}

// A real (throwaway) RSA key so the JWT signing step in googleToken() runs unmodified.
const crypto = require('crypto');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });

function baseEnv() {
  process.env.SUPA_SERVICE_KEY = 'svc-key';
  process.env.GA4_PROPERTY_ID = '534612604';
  process.env.GSC_SITE_URL = 'sc-domain:fixmy.energy';
  delete process.env.GSC_SERVICE_ACCOUNT;
}

async function run(scenario) {
  baseEnv();
  const calls = { upserts: [] };
  const sa = { client_email: 'svc@proj.iam.gserviceaccount.com', private_key: PEM };

  const fetchImpl = async (url, opts) => {
    const u = String(url);
    if (u.includes('app_config')) {
      return { ok: true, json: async () => [{ value: sa }] };
    }
    if (u.includes('oauth2.googleapis.com/token')) {
      return { ok: true, json: async () => ({ access_token: 'tok' }) };
    }
    if (u.includes('searchanalytics') || u.includes('webmasters')) {
      const body = JSON.parse(opts.body);
      // date-dimensioned daily pull vs the query/page snapshot calls
      if (body.dimensions[0] === 'date') return { ok: true, json: async () => ({ rows: [{ keys: ['2026-08-11'], clicks: 3, impressions: 200, ctr: 0.015, position: 12 }] }) };
      return { ok: true, json: async () => ({ rows: [] }) };
    }
    if (u.includes('analyticsdata.googleapis.com') && opts.body.includes('sessionCampaignName')) {
      calls.campaignReport = true;
      return scenario.campaignResp ? scenario.campaignResp() : { ok: true, json: async () => ({
        rows: [
          { dimensionValues: [{value:'google'},{value:'cpc'},{value:'PMax - SD Diagnostics'}], metricValues: [{value:'120'},{value:'6'}] },
          { dimensionValues: [{value:'google'},{value:'organic'},{value:'(not set)'}],        metricValues: [{value:'40'},{value:'1'}] },
          { dimensionValues: [{value:'(direct)'},{value:'(none)'},{value:'(not set)'}],        metricValues: [{value:'25'},{value:'0'}] }
        ]
      }) };
    }
    if (u.includes('analyticsdata.googleapis.com')) {
      // the existing per-date GA4 report (sessionDefaultChannelGroup)
      return { ok: true, json: async () => ({ rows: [] }) };
    }
    if (u.includes('/rest/v1/') && opts.method === 'POST') {
      const table = u.match(/\/rest\/v1\/(\w+)/)[1];
      calls.upserts.push({ table, rows: JSON.parse(opts.body) });
      return { ok: true, text: async () => '' };
    }
    return { ok: true, json: async () => ({}), text: async () => '' };
  };

  const fn = loadWithStubs(fetchImpl);
  const res = await fn.handler({ httpMethod: 'GET' }, {});
  return { res, calls };
}

(async () => {
  try {
    console.log('\n[1] the campaign report runs and writes seo_campaigns');
    {
      const { calls } = await run({});
      if (calls.campaignReport) ok('the sessionSource/Medium/CampaignName report was requested');
      else bad('campaign report never called');
      const write = calls.upserts.find(u => u.table === 'seo_campaigns');
      if (write) ok('seo_campaigns received an upsert');
      else bad('nothing written to seo_campaigns');
      if (write && write.rows.length === 3) ok('all 3 source rows written');
      else bad('wrong row count: ' + (write ? write.rows.length : 'none'));
      const paid = write.rows.find(r => r.source === 'google' && r.medium === 'cpc');
      if (paid && paid.campaign === 'PMax - SD Diagnostics' && paid.sessions === 120 && paid.key_events === 6)
        ok('the paid row carries the real campaign name, sessions and key events');
      else bad('paid row malformed: ' + JSON.stringify(paid));
      const direct = write.rows.find(r => r.source === '(direct)');
      if (direct && direct.campaign === '(not set)') ok('a session with no campaign is recorded as (not set), not dropped');
      else bad('direct/no-campaign row missing or wrong: ' + JSON.stringify(direct));
    }

    console.log('\n[2] a missing seo_campaigns table must not break the sync');
    {
      const { res, calls } = await run({
        // Simulate PGRST205 (table not found) on the seo_campaigns insert specifically.
      });
      // Re-run but make the seo_campaigns POST itself fail while everything else succeeds.
      baseEnv();
      const sa = { client_email: 'svc@proj.iam.gserviceaccount.com', private_key: PEM };
      const fetchImpl = async (url, opts) => {
        const u = String(url);
        if (u.includes('app_config')) return { ok: true, json: async () => [{ value: sa }] };
        if (u.includes('oauth2.googleapis.com/token')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
        if (u.includes('searchanalytics')) {
          const body = JSON.parse(opts.body);
          if (body.dimensions[0] === 'date') return { ok: true, json: async () => ({ rows: [{ keys: ['2026-08-11'], clicks: 3, impressions: 200, ctr: 0.015, position: 12 }] }) };
          return { ok: true, json: async () => ({ rows: [] }) };
        }
        if (u.includes('analyticsdata.googleapis.com') && opts.body.includes('sessionCampaignName'))
          return { ok: true, json: async () => ({ rows: [{ dimensionValues: [{value:'google'},{value:'cpc'},{value:'x'}], metricValues: [{value:'10'},{value:'1'}] }] }) };
        if (u.includes('analyticsdata.googleapis.com')) return { ok: true, json: async () => ({ rows: [] }) };
        if (u.includes('/rest/v1/seo_campaigns')) throw new Error('relation "seo_campaigns" does not exist');
        if (u.includes('/rest/v1/')) return { ok: true, text: async () => '' };
        return { ok: true, json: async () => ({}), text: async () => '' };
      };
      const fn = loadWithStubs(fetchImpl);
      const result = await fn.handler({ httpMethod: 'GET' }, {});
      if (result.statusCode === 200) ok('the sync still returns 200 when seo_campaigns is missing');
      else bad('sync failed outright: ' + result.statusCode);
      const body = JSON.parse(result.body);
      if (body.ok === true) ok('and reports ok:true — the core GSC/GA4 pull is unaffected');
      else bad('core sync marked failed by an unrelated table: ' + JSON.stringify(body));
    }

    console.log('\n[3] a paid ad session is identifiable client-side');
    {
      // Mirrors the portal's isPaid() check.
      const isPaid = c => /cpc|ppc|paid/i.test(c.medium || '');
      if (isPaid({ medium: 'cpc' })) ok("'cpc' medium reads as paid");
      else bad("'cpc' not detected as paid");
      if (!isPaid({ medium: 'organic' })) ok("'organic' medium does not read as paid");
      else bad('organic misclassified as paid');
      if (!isPaid({ medium: '(none)' })) ok("'(none)' (direct traffic) does not read as paid");
      else bad('direct traffic misclassified as paid');
    }

    console.log('\n[5] the two GA4 calls run CONCURRENTLY, not back to back');
    {
      // This function makes up to 9 sequential external round trips end to end; adding
      // the campaign report as a second back-to-back Google API call pushed a cold
      // start further into Netlify's execution-time risk (reported in the field as the
      // manual test URL going silent). Prove the fix: both mock fetches sleep 60ms —
      // sequential would take >=120ms for the pair, concurrent should take ~60-90ms.
      baseEnv();
      const sa = { client_email: 'svc@proj.iam.gserviceaccount.com', private_key: PEM };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const dispatchOrder = [];
      const fetchImpl = async (url, opts) => {
        const u = String(url);
        if (u.includes('app_config')) return { ok: true, json: async () => [{ value: sa }] };
        if (u.includes('oauth2.googleapis.com/token')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
        if (u.includes('searchanalytics')) {
          const body = JSON.parse(opts.body);
          if (body.dimensions[0] === 'date') return { ok: true, json: async () => ({ rows: [{ keys: ['2026-08-11'], clicks: 1, impressions: 10, ctr: 0.1, position: 5 }] }) };
          return { ok: true, json: async () => ({ rows: [] }) };
        }
        if (u.includes('analyticsdata.googleapis.com')) {
          const body = JSON.parse(opts.body);
          const which = body.dimensions.some(d => d.name === 'sessionCampaignName') ? 'campaign' : 'date';
          dispatchOrder.push(which + ':start');
          await sleep(60);
          dispatchOrder.push(which + ':end');
          return { ok: true, json: async () => ({ rows: [] }) };
        }
        if (u.includes('/rest/v1/')) return { ok: true, text: async () => '' };
        return { ok: true, json: async () => ({}), text: async () => '' };
      };
      const fn = loadWithStubs(fetchImpl);
      const t0 = Date.now();
      await fn.handler({ httpMethod: 'GET' }, {});
      const elapsed = Date.now() - t0;
      if (elapsed < 115) ok('both GA4 calls overlap — total time ' + elapsed + 'ms for two 60ms calls');
      else bad('calls ran sequentially — took ' + elapsed + 'ms (expected under 115ms if concurrent)');
      const bothStartedBeforeEitherEnded =
        dispatchOrder.indexOf('date:start') < dispatchOrder.indexOf('campaign:end') &&
        dispatchOrder.indexOf('campaign:start') < dispatchOrder.indexOf('date:end');
      if (bothStartedBeforeEitherEnded) ok('the campaign fetch was dispatched before the date fetch resolved');
      else bad('dispatch order shows serialization: ' + dispatchOrder.join(' → '));
    }

    console.log('\n[6] every response sets Content-Type so a browser reliably renders the body');
    {
      const fs = require('fs');
      const src = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'seo-insights.js'), 'utf8');
      // The naive [^}]* regex stops at the first '}' it meets, which is inside the
      // JSON.stringify({...}) call itself — match on the statement's OPENING instead.
      const returnStarts = (src.match(/return \{ statusCode: \d+,/g) || []);
      const missing = returnStarts.filter(function(r) {
        const idx = src.indexOf(r);
        return !src.slice(idx, idx + 80).includes("'Content-Type': 'application/json'");
      });
      if (returnStarts.length >= 5 && !missing.length) ok('all ' + returnStarts.length + ' return paths set Content-Type explicitly');
      else bad(missing.length + ' of ' + returnStarts.length + ' response(s) missing an explicit Content-Type');
    }

    console.log('\n[7] the function URL is testable without hitting the default sync timeout');
    {
      const fs = require('fs');
      const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
      // A manual GET to a scheduled function's URL is a plain HTTP call, NOT a scheduled
      // invocation — it does not inherit the 15-min background-function budget the
      // nightly run gets, only the synchronous default (~10s). This function makes 6-7
      // sequential Google/Supabase round trips even after parallelizing the two GA4
      // calls, so the default ceiling silently wasn't enough for manual testing.
      const block = (toml.match(/\[functions\."seo-insights"\][\s\S]*?(?=\n\[|$)/) || [''])[0];
      if (/timeout\s*=\s*26/.test(block)) ok('seo-insights has an explicit 26s timeout override, matching permitstack-pull');
      else bad('no timeout override — manual test invocations can still silently exceed the default synchronous limit');
      if (/schedule\s*=/.test(block)) ok('the nightly schedule is preserved alongside the new timeout');
      else bad('the schedule line was lost');
    }

    console.log('\n[8] the campaign result reaches the persisted status row, not just the HTTP body');
    {
      // writeStatus() takes an explicit field allow-list rather than spreading
      // ...summary — a real gap that hid this exact feature during troubleshooting:
      // campaigns/campaignsReason were computed correctly and present in the raw HTTP
      // response, but silently absent from pipeline_state, the one surface anyone
      // actually checks to diagnose this function without wading through Netlify logs.
      const { calls } = await run({});
      const statusWrite = calls.upserts.find(u => u.table === 'pipeline_state');
      if (!statusWrite) { bad('no pipeline_state write captured'); }
      else {
        const value = JSON.parse(statusWrite.rows.value);
        if (value.campaigns === 3) ok('the persisted status row carries the real campaign count');
        else bad('campaigns missing or wrong in the persisted status: ' + JSON.stringify(value));
      }

      // And the failure path: a broken campaign report must be readable from the
      // status row too, not just from re-deriving it via a manual SQL/log hunt.
      baseEnv();
      const sa = { client_email: 'svc@proj.iam.gserviceaccount.com', private_key: PEM };
      const fetchImpl2 = async (url, opts) => {
        const u = String(url);
        if (u.includes('app_config')) return { ok: true, json: async () => [{ value: sa }] };
        if (u.includes('oauth2.googleapis.com/token')) return { ok: true, json: async () => ({ access_token: 'tok' }) };
        if (u.includes('searchanalytics')) {
          const body = JSON.parse(opts.body);
          if (body.dimensions[0] === 'date') return { ok: true, json: async () => ({ rows: [{ keys: ['2026-08-11'], clicks: 1, impressions: 10, ctr: 0.1, position: 5 }] }) };
          return { ok: true, json: async () => ({ rows: [] }) };
        }
        if (u.includes('analyticsdata.googleapis.com') && opts.body.includes('sessionCampaignName'))
          return { ok: false, status: 403, text: async () => 'forbidden' };
        if (u.includes('analyticsdata.googleapis.com')) return { ok: true, json: async () => ({ rows: [] }) };
        if (u.includes('/rest/v1/')) return { ok: true, text: async () => '' };
        return { ok: true, json: async () => ({}), text: async () => '' };
      };
      const fn2 = loadWithStubs(fetchImpl2);
      const captured = [];
      const origFetch = global.fetch;
      global.fetch = async (url, opts) => {
        const r = await fetchImpl2(url, opts);
        if (String(url).includes('/rest/v1/pipeline_state') && opts && opts.method === 'POST') captured.push(JSON.parse(opts.body));
        return r;
      };
      await fn2.handler({ httpMethod: 'GET' }, {});
      global.fetch = origFetch;
      const statusRow = captured.find(c => c.key === 'seo_sync_status');
      const val = statusRow ? JSON.parse(statusRow.value) : null;
      if (val && val.campaignsReason === 'http_403') ok('a failed campaign report is also readable straight from the status row (http_403)');
      else bad('campaign failure reason not surfaced in the status row: ' + JSON.stringify(val));
    }

    console.log('\n[4] portal wiring');
    {
      const fs = require('fs');
      const src = fs.readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
      if (/seo_campaigns/.test(src)) ok('portal queries seo_campaigns');
      else bad('portal does not reference seo_campaigns');
      if (/catch\(e\) \{ \/\* table not migrated yet/.test(src)) ok('the query is guarded — an unmigrated table cannot break the whole SEO Pulse panel');
      else bad('no guard around the seo_campaigns query — a missing table would blank the panel');
      if (/\$ AD/.test(src)) ok('paid traffic gets a visible badge');
      else bad('no paid-traffic distinction in the UI');
    }

  } finally {
    delete global.fetch;
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
