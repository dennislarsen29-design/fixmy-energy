// Backlink checker for logged press coverage (pr_coverage). Scheduled nightly; also callable from the
// Agents tab ("Check now") with POST { id } to re-check one article.
// For each article it reads the page and records: live (follow link to fixmy.energy), nofollow
// (rel nofollow/sponsored/ugc), mention_only (they name us but did not link — an easy follow-up ask),
// missing (page loads, no link or mention), or unreachable (could not load). A one-off load failure
// never overwrites a link we already confirmed live. Env: SUPA_SERVICE_KEY.
const { fetchText, findLinks } = require('./lib/pr-fetch');
const SUPA_REST = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const DOMAIN = 'fixmy.energy';

async function checkOne(row, sh) {
  const page = await fetchText(row.article_url, 9000);
  const now = new Date().toISOString();
  const patch = { last_checked_at: now, http_status: page.status || null };
  const had = row.link_status === 'live' || row.link_status === 'nofollow';
  if (!page.ok) {
    if (!had) patch.link_status = 'unreachable';
    else patch.notes = ((row.notes || '') + ' [' + now.slice(0, 10) + ' recheck failed: ' + (page.error || page.status) + ']').slice(-400);
  } else {
    const links = findLinks(page.text, DOMAIN);
    const follow = links.find(function (l) { return !/\b(nofollow|sponsored|ugc)\b/.test(l.rel); });
    const any = links[0];
    if (follow) { patch.link_status = 'live'; patch.link_rel = follow.rel || null; patch.anchor_text = follow.anchor || null; if (!row.first_live_at) patch.first_live_at = now; }
    else if (any) { patch.link_status = 'nofollow'; patch.link_rel = any.rel; patch.anchor_text = any.anchor || null; if (!row.first_live_at) patch.first_live_at = now; }
    else if (/fixmy\.energy|solar review/i.test(page.text)) { patch.link_status = 'mention_only'; patch.link_rel = null; patch.anchor_text = null; }
    else { patch.link_status = 'missing'; patch.link_rel = null; patch.anchor_text = null; }
  }
  await fetch(SUPA_REST + '/pr_coverage?id=eq.' + row.id, { method: 'PATCH', headers: sh, body: JSON.stringify(patch) });
  return patch.link_status || row.link_status;
}

exports.handler = async function (event) {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!key) return { statusCode: 200, body: 'SUPA_SERVICE_KEY not set' };
  const sh = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  let one = null;
  try { one = JSON.parse(event && event.body || '{}').id || null; } catch (e) {}
  let q = '/pr_coverage?select=*&order=last_checked_at.asc.nullsfirst&limit=40';
  if (one) { if (!/^[0-9a-f-]{36}$/i.test(String(one))) return { statusCode: 400, body: 'bad id' }; q = '/pr_coverage?select=*&id=eq.' + one; }
  else q += '&or=(last_checked_at.is.null,last_checked_at.lt.' + new Date(Date.now() - 20 * 3600e3).toISOString() + ')';
  const r = await fetch(SUPA_REST + q, { headers: sh });
  if (!r.ok) return { statusCode: 200, body: 'pr_coverage unavailable: ' + r.status };
  const rows = await r.json();
  const results = {};
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5);
    const res = await Promise.all(batch.map(function (x) { return checkOne(x, sh).catch(function () { return 'error'; }); }));
    res.forEach(function (s) { results[s] = (results[s] || 0) + 1; });
  }
  console.log('[pr-link-check]', JSON.stringify(results));
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ checked: rows.length, results: results }) };
};
