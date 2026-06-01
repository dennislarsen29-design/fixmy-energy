// check-scraper-run.js
// Polls a GitHub Actions run for status; when complete, downloads the CSV artifact.
// POST body: { run_id }
// Returns:
//   { status: "queued"|"in_progress", conclusion: null }
//   { status: "completed", conclusion: "success", csv_text: "...", record_count: N }
//   { status: "completed", conclusion: "failure"|"cancelled", error: "..." }
// Requires: GITHUB_PAT env var

const AdmZip = require('adm-zip');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const pat = process.env.GITHUB_PAT;
  if (!pat) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'GITHUB_PAT not set' }) };

  let runId;
  try {
    const body = JSON.parse(event.body || '{}');
    runId = body.run_id;
  } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  if (!runId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'run_id required' }) };

  const OWNER = 'dennislarsen29-design';
  const REPO  = 'fixmy-energy';

  const ghHeaders = {
    'Authorization': 'Bearer ' + pat,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  try {
    // Check run status
    const runResp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}`,
      { headers: ghHeaders }
    );
    if (!runResp.ok) {
      const t = await runResp.text().catch(() => '');
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'GitHub API error: HTTP ' + runResp.status + ' ' + t.slice(0, 100) }) };
    }
    const run = await runResp.json();

    if (run.status !== 'completed') {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: run.status, conclusion: null, html_url: run.html_url }) };
    }

    // Run is done
    if (run.conclusion !== 'success') {
      return { statusCode: 200, headers: cors, body: JSON.stringify({
        status: 'completed', conclusion: run.conclusion,
        error: 'Scraper run ' + run.conclusion + '. Check: ' + run.html_url
      }) };
    }

    // Fetch artifact list
    const artResp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`,
      { headers: ghHeaders }
    );
    if (!artResp.ok) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'completed', conclusion: 'success', error: 'Could not list artifacts: HTTP ' + artResp.status }) };
    }
    const artData = await artResp.json();
    const artifact = (artData.artifacts || []).find(a => a.name.startsWith('accela-permits-'));

    if (!artifact) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'completed', conclusion: 'success', error: 'No CSV artifact found — scraper may have returned 0 results' }) };
    }

    // Download zip
    const zipResp = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/artifacts/${artifact.id}/zip`,
      { headers: ghHeaders, redirect: 'follow' }
    );
    if (!zipResp.ok) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'completed', conclusion: 'success', error: 'Artifact download failed: HTTP ' + zipResp.status }) };
    }

    const zipBuffer = Buffer.from(await zipResp.arrayBuffer());
    const zip = new AdmZip(zipBuffer);
    const csvEntries = zip.getEntries().filter(e => e.entryName.endsWith('.csv'));

    if (!csvEntries.length) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ status: 'completed', conclusion: 'success', error: 'Zip contained no CSV files' }) };
    }

    // Merge all CSVs (one per city) into a single CSV
    let mergedLines = [];
    let headerWritten = false;
    for (const entry of csvEntries) {
      const text = zip.readAsText(entry).trim();
      const lines = text.split('\n').filter(Boolean);
      if (!lines.length) continue;
      if (!headerWritten) { mergedLines.push(lines[0]); headerWritten = true; }
      // Skip header on subsequent files
      mergedLines = mergedLines.concat(lines.slice(1));
    }
    const csvText = mergedLines.join('\n');
    const recordCount = Math.max(0, mergedLines.length - 1);

    return { statusCode: 200, headers: cors, body: JSON.stringify({
      status: 'completed', conclusion: 'success',
      csv_text: csvText, record_count: recordCount,
      html_url: run.html_url
    }) };
  } catch(e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
