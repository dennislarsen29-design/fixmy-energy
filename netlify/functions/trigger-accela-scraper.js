// trigger-accela-scraper.js
// Triggers the GitHub Actions accela-scraper workflow via workflow_dispatch API.
// POST body: { cities: "all"|"sandiego"|"chulavista"|"oceanside", installer: "" }
// Returns: { run_id, html_url } or { error }
// Requires: GITHUB_PAT env var (Personal Access Token, scopes: repo + workflow)

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const pat = process.env.GITHUB_PAT;
  if (!pat) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'GITHUB_PAT not set in Netlify env vars' }) };

  let cities, installer;
  try {
    const body = JSON.parse(event.body || '{}');
    cities = body.cities || 'all';
    installer = body.installer || '';
  } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const OWNER = 'dennislarsen29-design';
  const REPO  = 'fixmy-energy';
  const REF   = 'main';
  const WORKFLOW = 'accela-scraper.yml';

  const ghHeaders = {
    'Authorization': 'Bearer ' + pat,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };

  try {
    // Note the time before dispatch so we can find the new run
    const beforeDispatch = Date.now();

    const dispatchResp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      { method: 'POST', headers: ghHeaders, body: JSON.stringify({ ref: REF, inputs: { cities, installer } }) }
    );

    if (dispatchResp.status !== 204) {
      const txt = await dispatchResp.text().catch(() => '');
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'GitHub dispatch failed: HTTP ' + dispatchResp.status + ' — ' + txt.slice(0, 200) }) };
    }

    // Poll up to 10s for the new run to appear in the API
    let runId = null, htmlUrl = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      const runsResp = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=5&event=workflow_dispatch`,
        { headers: ghHeaders }
      );
      if (!runsResp.ok) break;
      const runsData = await runsResp.json();
      const newRun = (runsData.workflow_runs || []).find(r => new Date(r.created_at).getTime() >= beforeDispatch - 5000);
      if (newRun) { runId = newRun.id; htmlUrl = newRun.html_url; break; }
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ run_id: runId, html_url: htmlUrl, cities, installer }) };
  } catch(e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
