// Self-healing code fixes (2026-11-05, per Dennis). Never commits to main: it drafts ONE small edit as a GitHub
// pull request that Dennis reviews and merges. Same safety shape as the SEO loop.
// Env: ANTHROPIC_KEY, GITHUB_TOKEN. Needs a proposal whose system maps to one function file.
const vm = require('vm');
const REPO = 'dennislarsen29-design/fixmy-energy';
const GH = 'https://api.github.com/repos/' + REPO;
const MAX_FILE_BYTES = 70000;   // bigger files (e.g. the 1,800-line pipeline) are too large to edit safely in one pass
const MAP = {
  'seo-sync': 'netlify/functions/seo-insights.js',
  'outage-feed': 'netlify/functions/outage-sync.js',
  'nightly-pipeline': 'netlify/functions/bb-auto-pipeline-background.js',
  'sms': 'netlify/functions/lib/notify.js'
};
const AGENT_FILE = { seo: 'seo-agent', finance: 'finance-agent', marketing: 'marketing-agent', socials: 'socials-agent', bizdev: 'bizdev-agent', 'crm-dev': 'crm-dev-agent', roadmap: 'roadmap-agent', coaching: 'coaching-agent', gbp: 'gbp-post-agent' };
function fileFor(system) {
  if (MAP[system]) return MAP[system];
  const m = /^agent:(.+)$/.exec(system || '');
  if (m && AGENT_FILE[m[1]]) return 'netlify/functions/' + AGENT_FILE[m[1]] + '.js';
  return null;
}
const ghH = () => ({ Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'solar-review-heal', 'Content-Type': 'application/json' });
function syntaxOk(code) { try { new vm.Script('(async function(){' + code + '\n})'); return null; } catch (e) { return e.message; } }

async function draft(p) {
  if (!process.env.GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN is not set in Netlify.' };
  if (!process.env.ANTHROPIC_KEY) return { ok: false, error: 'ANTHROPIC_KEY is not set in Netlify.' };
  const path = fileFor(p.system);
  if (!path) return { ok: false, error: 'No code file is mapped to this system, so there is nothing to draft.' };
  const fr = await fetch(GH + '/contents/' + path + '?ref=main', { headers: ghH() });
  if (!fr.ok) return { ok: false, error: 'Could not read ' + path + ' (' + fr.status + ')' };
  const fj = await fr.json();
  const src = Buffer.from(fj.content, 'base64').toString('utf8');
  if (src.length > MAX_FILE_BYTES) return { ok: false, error: path + ' is too large to edit automatically (' + Math.round(src.length / 1000) + ' KB). The evidence is attached; a developer should fix it.' };
  const tool = { name: 'submit_fix', description: 'Submit the smallest code change that fixes the problem, or decline if the evidence does not point at a code bug.',
    input_schema: { type: 'object', properties: {
      can_fix: { type: 'boolean', description: 'false if this is not a code bug (expired key, empty credit, upstream outage).' },
      explanation: { type: 'string', description: 'Plain language: what was wrong and what the change does. Max 3 sentences.' },
      edits: { type: 'array', items: { type: 'object', properties: { old_string: { type: 'string', description: 'Exact text from the file; must occur exactly once.' }, new_string: { type: 'string' } }, required: ['old_string', 'new_string'] } } }, required: ['can_fix', 'explanation'] } };
  const sys = 'You repair one Netlify function for a solar company. Rules: change as little as possible; never touch secrets, auth, payments math, or delete data; do not add dependencies; keep the code style. If the evidence is an expired credential, empty credit, rate limit, or upstream outage, set can_fix=false. Each old_string must be copied exactly and occur once. Reply only through the tool.';
  const user = 'FILE: ' + path + '\n\nPROBLEM: ' + p.problem + '\nEVIDENCE: ' + JSON.stringify(p.evidence || {}).slice(0, 2500) + '\n\nSOURCE:\n' + src;
  const ar = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 3000, system: sys, tools: [tool], tool_choice: { type: 'tool', name: 'submit_fix' }, messages: [{ role: 'user', content: user }] }) });
  if (!ar.ok) return { ok: false, error: 'The AI request failed (' + ar.status + ').' };
  const aj = await ar.json();
  const tu = (aj.content || []).find(c => c.type === 'tool_use');
  const out = tu && tu.input;
  if (!out) return { ok: false, error: 'The AI returned no fix.' };
  if (!out.can_fix || !Array.isArray(out.edits) || !out.edits.length) return { ok: false, declined: true, error: 'Not a code bug: ' + (out.explanation || 'no change proposed') };
  if (out.edits.length > 6) return { ok: false, error: 'Proposed change is too large (' + out.edits.length + ' edits).' };
  let next = src;
  for (const e of out.edits) {
    const n = next.split(e.old_string).length - 1;
    if (!e.old_string || n !== 1) return { ok: false, error: 'A proposed edit did not match the file exactly once, so nothing was changed.' };
    next = next.replace(e.old_string, () => e.new_string);
  }
  const bad = syntaxOk(next);
  if (bad) return { ok: false, error: 'The proposed change does not parse (' + bad + '), so nothing was changed.' };
  if (next.length > src.length + 4000) return { ok: false, error: 'The proposed change adds too much code.' };
  const base = await (await fetch(GH + '/git/ref/heads/main', { headers: ghH() })).json();
  const sha = base && base.object && base.object.sha;
  if (!sha) return { ok: false, error: 'Could not read main.' };
  const branch = 'heal/' + String(p.system).replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '-' + p.id;
  const br = await fetch(GH + '/git/refs', { method: 'POST', headers: ghH(), body: JSON.stringify({ ref: 'refs/heads/' + branch, sha }) });
  if (!br.ok) return { ok: false, error: 'Could not create the branch (' + br.status + ').' };
  const put = await fetch(GH + '/contents/' + path, { method: 'PUT', headers: ghH(), body: JSON.stringify({ message: 'Self-heal: ' + p.problem.slice(0, 70) + '\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>', content: Buffer.from(next, 'utf8').toString('base64'), sha: fj.sha, branch }) });
  if (!put.ok) return { ok: false, error: 'Could not commit the change (' + put.status + ').' };
  const body = '**Problem:** ' + p.problem + '\n\n**What this changes:** ' + out.explanation + '\n\n**Evidence:** `' + JSON.stringify(p.evidence || {}).slice(0, 600) + '`\n\nDrafted automatically by the self-healing loop. It is **not live** until you merge it; if the problem is still there ~1 hour after the deploy, the loop re-opens it.\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_';
  const pr = await fetch(GH + '/pulls', { method: 'POST', headers: ghH(), body: JSON.stringify({ title: 'Self-heal: ' + p.problem.slice(0, 80), head: branch, base: 'main', body }) });
  const pj = await pr.json();
  if (!pr.ok) return { ok: false, error: 'Could not open the pull request (' + pr.status + ').' };
  return { ok: true, pr_url: pj.html_url, pr_number: pj.number, explanation: out.explanation };
}
async function prState(number) {
  const r = await fetch(GH + '/pulls/' + number, { headers: ghH() });
  if (!r.ok) return null;
  const j = await r.json();
  return j.merged ? 'merged' : (j.state === 'closed' ? 'closed' : 'open');
}
module.exports = { draft, prState, fileFor };
