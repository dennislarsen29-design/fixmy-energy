// Self-healing drafts for SEO (2026-11-16, per Dennis). Nothing goes live: every change is a GitHub pull request.
//  auditDraft(p, k):  rewrites over-long/missing titles+meta on up to 3 pages and opens one PR each through seo-loop.proposeChange
//                     (which also records a measured experiment).
//  pageDraft(p, k):   drafts a new city landing page from a market report, using an existing city page as the template.
const seoLoop = require('./seo-loop');
const vm = require('vm');
const REPO = 'dennislarsen29-design/fixmy-energy';
const GH = 'https://api.github.com/repos/' + REPO;
const ghH = () => ({ Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'solar-review-heal', 'Content-Type': 'application/json' });
const TEMPLATE = 'solar-repair-salt-lake-city-ut.html';

async function claudeTool(system, user, tool, maxTokens) {
  const ar = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: maxTokens || 3000, system, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content: user }] }) });
  if (!ar.ok) throw new Error('AI request failed (' + ar.status + ')');
  const aj = await ar.json();
  const tu = (aj.content || []).find(c => c.type === 'tool_use');
  if (!tu) throw new Error('AI returned nothing');
  return tu.input;
}

async function auditDraft(p, k) {
  if (!process.env.GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN is not set in Netlify.' };
  if (!process.env.ANTHROPIC_KEY) return { ok: false, error: 'ANTHROPIC_KEY is not set in Netlify.' };
  const list = ((p.evidence || {}).pages || []).slice(0, 12);
  const tool = { name: 'submit_meta', description: 'Rewrite the title and meta description.', input_schema: { type: 'object', properties: { title: { type: 'string', description: '30-60 characters, keeps the page main keyword and the Solar Review brand if it fits.' }, meta: { type: 'string', description: '120-155 characters, plain, no guarantees or superlatives.' }, why: { type: 'string' } }, required: ['title', 'meta', 'why'] } };
  const sys = 'You write SEO titles and meta descriptions for a San Diego solar repair company (Solar Review). Keep the meaning and the main keyword of the existing text, fix the length, and never add claims (no guarantee, #1, best, cheapest, no prices). Reply only through the tool.';
  const opened = [], skipped = [];
  for (const pg of list) {
    if (opened.length >= 3) break;
    if (!seoLoop.fileFor(pg.url)) { skipped.push(pg.url); continue; }
    let r; try { r = await claudeTool(sys, 'URL: ' + pg.url + '\nCURRENT TITLE: ' + (pg.title || '(none)') + '\nCURRENT META: ' + (pg.desc || '(none)'), tool, 600); } catch (e) { skipped.push(pg.url + ' (' + e.message + ')'); continue; }
    const out = await seoLoop.proposeChange({ page_url: pg.url, new_title: r.title, new_meta: r.meta, hypothesis: 'Site audit: ' + (r.why || 'fix length so Google does not truncate it') }, k);
    if (out.ok) opened.push({ page: pg.url, pr: out.pr_url }); else skipped.push(pg.url + ' (' + out.error + ')');
  }
  if (!opened.length) return { ok: false, error: 'No pull request opened. ' + skipped.slice(0, 3).join('; ') };
  return { ok: true, prs: opened, skipped };
}

function jsonLdOk(html) { for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { JSON.parse(m[1]); } catch (e) { return false; } } return true; }

async function pageDraft(p, k) {
  if (!process.env.GITHUB_TOKEN) return { ok: false, error: 'GITHUB_TOKEN is not set in Netlify.' };
  if (!process.env.ANTHROPIC_KEY) return { ok: false, error: 'ANTHROPIC_KEY is not set in Netlify.' };
  const ev = p.evidence || {};
  const city = String(ev.city || '').trim(), st = String(ev.state || '').trim().toUpperCase();
  if (!city || !/^[A-Z]{2}$/.test(st) || !ev.report) return { ok: false, error: 'This proposal has no market report attached.' };
  const slug = 'solar-repair-' + city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + st.toLowerCase();
  const file = slug + '.html';
  const exist = await fetch(GH + '/contents/' + file + '?ref=main', { headers: ghH() });
  if (exist.ok) return { ok: false, error: file + ' already exists on main.' };
  const tr = await fetch(GH + '/contents/' + TEMPLATE + '?ref=main', { headers: ghH() });
  if (!tr.ok) return { ok: false, error: 'Could not read the template page (' + tr.status + ').' };
  const template = Buffer.from((await tr.json()).content, 'base64').toString('utf8');
  const tool = { name: 'submit_page', description: 'Return the complete HTML of the new city page.', input_schema: { type: 'object', properties: { html: { type: 'string', description: 'Complete HTML document.' }, summary: { type: 'string', description: 'Two sentences: what the page says and which facts came from the report.' } }, required: ['html', 'summary'] } };
  const sys = 'You adapt an existing city landing page for Solar Review into a page for a NEW city. Keep the template structure, styles, tracking scripts, nav, footer, CTA and JSON-LD shape. Replace every Salt Lake / Utah reference. Use ONLY local facts that appear in the MARKET REPORT with a source; if the report does not give a fact (utility rules, incentives, installers), write the sentence generically or omit it. No prices, guarantees, fake offices or addresses, no claims of in-person visits unless the template already says so. Canonical must be https://fixmy.energy/' + slug + '. Title under 60 characters, exactly one H1, FAQPage JSON-LD must match the visible FAQ. Reply only through the tool.';
  const r = await claudeTool(sys, 'NEW CITY: ' + city + ', ' + st + '\nNEW FILE: ' + file + '\n\nMARKET REPORT:\n' + String(ev.report).slice(0, 7000) + '\n\nTEMPLATE (' + TEMPLATE + '):\n' + template, tool, 16000);
  const html = String(r.html || '');
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const bad = [];
  if (html.length < 4000 || html.length > template.length * 2) bad.push('page size is off');
  if (title.trim().length < 20 || title.trim().length > 65) bad.push('title length ' + title.trim().length);
  if ((html.match(/<h1[\s>]/gi) || []).length !== 1) bad.push('not exactly one H1');
  if (!html.includes('rel="canonical" href="https://fixmy.energy/' + slug + '"')) bad.push('canonical is not https://fixmy.energy/' + slug);
  if (!jsonLdOk(html)) bad.push('JSON-LD does not parse');
  if (/salt lake|\butah\b|\b84\d{3}\b/i.test(html.replace(/<a [^>]*href="[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')) && !/salt lake|utah/i.test(city + ' ' + st)) bad.push('Salt Lake / Utah text left over');
  if (/\b(guarantee|#1|best in|cheapest)\b/i.test(html)) bad.push('unverifiable claim');
  if (bad.length) return { ok: false, error: 'The drafted page failed checks: ' + bad.join('; ') + '. Nothing was committed.' };
  const base = await (await fetch(GH + '/git/ref/heads/main', { headers: ghH() })).json();
  const sha = base && base.object && base.object.sha; if (!sha) return { ok: false, error: 'Could not read main.' };
  const branch = 'market/' + slug + '-' + new Date().toISOString().slice(0, 10);
  const br = await fetch(GH + '/git/refs', { method: 'POST', headers: ghH(), body: JSON.stringify({ ref: 'refs/heads/' + branch, sha }) });
  if (!br.ok) return { ok: false, error: 'Could not create the branch (' + br.status + ').' };
  const put = await fetch(GH + '/contents/' + file, { method: 'PUT', headers: ghH(), body: JSON.stringify({ message: 'Market page draft: ' + city + ', ' + st + '\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>', content: Buffer.from(html, 'utf8').toString('base64'), branch }) });
  if (!put.ok) return { ok: false, error: 'Could not commit the page (' + put.status + ').' };
  // sitemap entry
  try {
    const sm = await (await fetch(GH + '/contents/sitemap.xml?ref=main', { headers: ghH() })).json();
    const xml = Buffer.from(sm.content, 'base64').toString('utf8');
    if (xml.indexOf('/' + slug + '<') < 0) await fetch(GH + '/contents/sitemap.xml', { method: 'PUT', headers: ghH(), body: JSON.stringify({ message: 'Sitemap: add ' + slug, content: Buffer.from(xml.replace('</urlset>', '  <url><loc>https://fixmy.energy/' + slug + '</loc><lastmod>' + new Date().toISOString().slice(0, 10) + '</lastmod></url>\n</urlset>'), 'utf8').toString('base64'), sha: sm.sha, branch }) });
  } catch (e) {}
  const body = '**Market:** ' + city + ', ' + st + '\n\n' + r.summary + '\n\nDrafted from the market report in the Agent Inbox. **Not live until you merge.** Before merging check: every local fact has a source in the report, and the page does not promise in-person visits you cannot deliver there yet.\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_';
  const pr = await fetch(GH + '/pulls', { method: 'POST', headers: ghH(), body: JSON.stringify({ title: 'Market page draft: ' + city + ', ' + st, head: branch, base: 'main', body }) });
  if (!pr.ok) return { ok: false, error: 'Could not open the pull request (' + pr.status + ').' };
  const pj = await pr.json();
  return { ok: true, pr_url: pj.html_url, explanation: r.summary };
}
module.exports = { auditDraft, pageDraft };
