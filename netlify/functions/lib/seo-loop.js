// SEO self-correction loop (2026-11-05, per Dennis).
// Each title/meta change the SEO agent proposes becomes a GitHub PULL REQUEST (never a direct commit —
// Dennis merges it) AND a row in seo_experiments with a baseline. Every run, syncExperiments():
//   pr_opened -> applied   when the PR is merged (applied_at = merge time, measure after +14 days)
//   pr_opened -> rejected  when the PR is closed unmerged (recorded as a lesson: "owner rejected")
//   applied   -> measured  once a Search Console page snapshot exists that is fully AFTER the change:
//                          compares CTR/position to the baseline and writes win / loss / inconclusive + a lesson.
// history() feeds the verdicts back into the agent's next run so it repeats what worked and stops what didn't.
// Env: GITHUB_TOKEN (contents + pull requests on the repo), SUPA_SERVICE_KEY.
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const REPO = 'dennislarsen29-design/fixmy-energy';
const GH = 'https://api.github.com/repos/' + REPO;
const SITE = 'https://fixmy.energy';
const MEASURE_DELAY_DAYS = 14;     // wait this long after the merge
const WINDOW_DAYS = 9;             // seo-insights page snapshots cover the 9 days ending on `date`
const MIN_IMPRESSIONS = 40;        // below this in either period a verdict would be noise
// Pages whose title/meta come from JavaScript, not static HTML — the loop cannot edit them safely.
const DYNAMIC_PAGES = [];   // installer pages are static since 2026-11-05 (installers/<id>.html, built by scripts/build-installer-pages.js)
const INSTALLER_PAGES = ['/sunpower', '/titan', '/sunnova', '/sullivan', '/petersen-dean', '/sungevity', '/mosaic', '/freedom-forever'];

function sbH(key, extra) { return Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {}); }
function ghH() { return { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'solar-review-seo-agent', 'Content-Type': 'application/json' }; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function unesc(s) { return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<'); }

function pagePath(url) {
  let p = String(url || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+$/, '') || '/';
}
// '/blog/x' -> 'blog/x.html', '/foo' -> 'foo.html'. Returns null for dynamic/unsupported pages.
function fileFor(url) {
  const p = pagePath(url);
  if (p === '/' || DYNAMIC_PAGES.indexOf(p) > -1) return null;
  if (INSTALLER_PAGES.indexOf(p) > -1) return 'installers/' + p.slice(1) + '.html';
  if (!/^\/[a-z0-9][a-z0-9\/-]*$/i.test(p)) return null;
  return p.slice(1) + '.html';
}

async function sbGet(path, key) {
  const r = await fetch(SB + path, { headers: sbH(key) });
  if (!r.ok) throw new Error('GET ' + path + ' ' + r.status);
  return r.json();
}
async function clearWaiting(prUrl, key) {
  try { await sbPatch('/agent_reports?agent=eq.seo&action_url=eq.' + encodeURIComponent(prUrl) + '&reviewed=eq.false', { reviewed: true }, key); } catch (e) {}
}
async function sbPatch(path, body, key) {
  const r = await fetch(SB + path, { method: 'PATCH', headers: sbH(key, { Prefer: 'return=minimal' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('PATCH ' + path + ' ' + r.status);
}

async function latestPageRow(page, key, onOrAfter) {
  const keys = [SITE + page, SITE + page + '/', 'https://www.fixmy.energy' + page];
  const q = '/seo_queries?dimension=eq.page&key=in.(' + keys.map(function (k) { return '"' + k + '"'; }).join(',') + ')' +
    (onOrAfter ? '&date=gte.' + onOrAfter : '') + '&order=date.' + (onOrAfter ? 'asc' : 'desc') + '&limit=1';
  const rows = await sbGet(q, key);
  const r = rows[0];
  return r ? { date: r.date, clicks: r.clicks, impressions: r.impressions, ctr: Number(r.ctr), position: Number(r.position) } : null;
}

// ── propose: validate, open a PR with the new title/meta, record the experiment ──────────────
async function proposeChange(input, key) {
  if (!process.env.GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN is not set in Netlify, so a pull request cannot be opened. Write this as a normal recommendation instead.' };
  const page = pagePath(input.page_url);
  const file = fileFor(page);
  if (!file) return { ok: false, error: page + ' has its title/meta set by JavaScript (or is the homepage), so it cannot be edited automatically. Write a normal recommendation instead.' };
  const title = String(input.new_title || '').trim(), meta = String(input.new_meta || '').trim();
  if (title.length < 20 || title.length > 65) return { ok: false, error: 'new_title must be 20-65 characters (got ' + title.length + ').' };
  if (meta.length < 110 || meta.length > 160) return { ok: false, error: 'new_meta must be 110-160 characters (got ' + meta.length + ').' };
  if (/\b(guarantee|#1|best in|cheapest)\b/i.test(title + ' ' + meta)) return { ok: false, error: 'Remove unverifiable claims (guarantee, #1, best in, cheapest).' };

  const recent = await sbGet('/seo_experiments?page_url=eq.' + encodeURIComponent(page) + '&status=in.(pr_opened,applied)&order=created_at.desc&limit=1', key);
  if (recent.length) return { ok: false, error: 'There is already an open or still-measuring experiment on ' + page + '. Wait for its verdict first.' };

  const fr = await fetch(GH + '/contents/' + file + '?ref=main', { headers: ghH() });
  if (!fr.ok) return { ok: false, error: 'Could not read ' + file + ' from GitHub (' + fr.status + ').' };
  const fj = await fr.json();
  const html = Buffer.from(fj.content, 'base64').toString('utf8');
  const tm = html.match(/<title>([\s\S]*?)<\/title>/);
  const mm = html.match(/<meta name="description" content="([^"]*)"\s*\/?>/);
  if (!tm || !mm) return { ok: false, error: file + ' has no static <title> and meta description to replace.' };
  const oldTitle = unesc(tm[1].trim()), oldMeta = unesc(mm[1]);
  if (oldTitle === title && oldMeta === meta) return { ok: false, error: 'No change from the current title/meta.' };

  let next = html.replace(tm[0], '<title>' + esc(title).replace(/&quot;/g, '"') + '</title>');
  next = next.replace(mm[0], mm[0].replace(mm[1], esc(meta).replace(/&quot;/g, '&quot;')));

  const baseline = await latestPageRow(page, key);
  const ref = await (await fetch(GH + '/git/ref/heads/main', { headers: ghH() })).json();
  const branch = 'seo/' + page.slice(1).replace(/[^a-z0-9]+/gi, '-') + '-' + new Date().toISOString().slice(0, 10);
  const mk = await fetch(GH + '/git/refs', { method: 'POST', headers: ghH(), body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: ref.object.sha }) });
  if (!mk.ok && mk.status !== 422) return { ok: false, error: 'Could not create branch (' + mk.status + ').' };
  const put = await fetch(GH + '/contents/' + file, { method: 'PUT', headers: ghH(), body: JSON.stringify({
    message: 'SEO: retitle ' + page + ' (self-correction loop)', content: Buffer.from(next, 'utf8').toString('base64'), sha: fj.sha, branch }) });
  if (!put.ok) return { ok: false, error: 'Could not commit the change (' + put.status + ').' };
  const body = '**Why:** ' + (input.hypothesis || '(none given)') + '\n\n**Old title:** ' + oldTitle + '\n**New title:** ' + title +
    '\n\n**Old meta:** ' + oldMeta + '\n**New meta:** ' + meta +
    '\n\n**Baseline (' + (baseline ? baseline.date : 'none') + '):** ' + (baseline ? baseline.impressions + ' impressions, ' + baseline.clicks + ' clicks, pos ' + baseline.position.toFixed(1) : 'no page snapshot yet') +
    '\n\nMerge to apply. The SEO agent measures the result ~' + MEASURE_DELAY_DAYS + ' days after the merge and records what it learned. Close without merging to reject.\n\n_Opened by the SEO self-correction loop._';
  const pr = await fetch(GH + '/pulls', { method: 'POST', headers: ghH(), body: JSON.stringify({ title: 'SEO: ' + page + ' — new title & meta', head: branch, base: 'main', body }) });
  if (!pr.ok) return { ok: false, error: 'Could not open the pull request (' + pr.status + ').' };
  const pj = await pr.json();
  await fetch(SB + '/seo_experiments', { method: 'POST', headers: sbH(key, { Prefer: 'return=minimal' }), body: JSON.stringify({
    page_url: page, file_path: file, hypothesis: input.hypothesis || null, old_title: oldTitle, new_title: title, old_meta: oldMeta, new_meta: meta,
    pr_url: pj.html_url, pr_number: pj.number, status: 'pr_opened', baseline }) });
  // Surface it in S.U.N. + the daily digest email so a waiting merge is never missed.
  try { await fetch(SB + '/agent_reports', { method: 'POST', headers: sbH(key, { Prefer: 'return=minimal' }), body: JSON.stringify({
    agent: 'seo', priority: 'high', title: 'SEO change waiting for your merge: ' + page,
    body: 'New title: ' + title + '\nNew meta: ' + meta + '\nWhy: ' + (input.hypothesis || '') + '\nMerge the pull request to apply it; close it to reject.', action_url: pj.html_url }) }); } catch (e) {}
  return { ok: true, pr_url: pj.html_url, baseline };
}

// ── verdict ─────────────────────────────────────────────────────────────────────────────────
function judge(base, now) {
  if (!base || !now) return { verdict: 'inconclusive', lesson: 'No page snapshot to compare (the page was outside the top-25 pages).' };
  if (base.impressions < MIN_IMPRESSIONS || now.impressions < MIN_IMPRESSIONS)
    return { verdict: 'inconclusive', lesson: 'Too few impressions to judge (' + base.impressions + ' before, ' + now.impressions + ' after).' };
  const ctrDelta = now.ctr - base.ctr, rel = base.ctr > 0 ? ctrDelta / base.ctr : (now.ctr > 0 ? 1 : 0), posDelta = now.position - base.position;
  const desc = 'CTR ' + (base.ctr * 100).toFixed(2) + '% -> ' + (now.ctr * 100).toFixed(2) + '%, position ' + base.position.toFixed(1) + ' -> ' + now.position.toFixed(1) +
    ', clicks ' + base.clicks + ' -> ' + now.clicks + ' (impressions ' + base.impressions + ' -> ' + now.impressions + ').';
  if (rel >= 0.25 && posDelta <= 2) return { verdict: 'win', lesson: 'Worked. ' + desc };
  if (rel <= -0.2 || posDelta >= 3) return { verdict: 'loss', lesson: 'Did not help. ' + desc };
  return { verdict: 'inconclusive', lesson: 'No clear change. ' + desc };
}

// ── sync: advance every experiment; returns the ones that just got a verdict ─────────────────
async function syncExperiments(key) {
  const out = { applied: 0, rejected: 0, measured: [] };
  const open = await sbGet('/seo_experiments?status=in.(pr_opened,applied)&order=created_at.asc&limit=50', key);
  for (const e of open) {
    try {
      if (e.status === 'pr_opened' && e.pr_number && process.env.GITHUB_TOKEN) {
        const pr = await (await fetch(GH + '/pulls/' + e.pr_number, { headers: ghH() })).json();
        if (pr.merged_at) {
          const at = new Date(pr.merged_at);
          await sbPatch('/seo_experiments?id=eq.' + e.id, { status: 'applied', applied_at: at.toISOString(), measure_after: new Date(at.getTime() + MEASURE_DELAY_DAYS * 86400000).toISOString() }, key);
          await clearWaiting(e.pr_url, key);
          out.applied++;
        } else if (pr.state === 'closed') {
          await sbPatch('/seo_experiments?id=eq.' + e.id, { status: 'rejected', verdict: 'rejected', lesson: 'Dennis closed the PR without merging — do not propose this style of change for ' + e.page_url + ' again without a new reason.', measured_at: new Date().toISOString() }, key);
          await clearWaiting(e.pr_url, key);
          out.rejected++;
        }
      } else if (e.status === 'applied' && e.measure_after && new Date(e.measure_after) <= new Date()) {
        // a snapshot whose whole 9-day window is after the merge
        const from = new Date(new Date(e.applied_at).getTime() + WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
        const now = await latestPageRow(e.page_url, key, from);
        if (!now) { if (new Date(e.measure_after).getTime() < Date.now() - 28 * 86400000) { await sbPatch('/seo_experiments?id=eq.' + e.id, { status: 'measured', verdict: 'inconclusive', lesson: 'Page never appeared in the top-25 snapshots after the change.', measured_at: new Date().toISOString() }, key); } continue; }
        const j = judge(e.baseline, now);
        await sbPatch('/seo_experiments?id=eq.' + e.id, { status: 'measured', result: now, verdict: j.verdict, lesson: j.lesson, measured_at: new Date().toISOString() }, key);
        out.measured.push({ page: e.page_url, new_title: e.new_title, old_title: e.old_title, verdict: j.verdict, lesson: j.lesson });
      }
    } catch (err) { console.warn('seo-loop sync', e.page_url, err.message); }
  }
  return out;
}

// ── history: what worked / failed, for the next run's prompt ────────────────────────────────
async function history(key) {
  try {
    const rows = await sbGet('/seo_experiments?order=created_at.desc&limit=30', key);
    if (!rows.length) return '';
    const L = rows.map(function (e) {
      return '- ' + String(e.created_at).slice(0, 10) + ' ' + e.page_url + ' [' + e.status + (e.verdict ? '/' + e.verdict : '') + '] "' + (e.old_title || '') + '" -> "' + (e.new_title || '') + '"' + (e.lesson ? ' :: ' + e.lesson : '');
    });
    return 'EXPERIMENT HISTORY (your earlier title/meta changes and how they did). Repeat patterns that WON, avoid patterns that LOST or were REJECTED, do not re-propose a page that is still measuring:\n' + L.join('\n') + '\n\n';
  } catch (e) { return ''; }
}

module.exports = { proposeChange, syncExperiments, history, judge, fileFor, pagePath };
