#!/usr/bin/env node
// Free site audit: crawls every public .html file in the repo and flags SEO problems.
// Usage: node scripts/seo-audit.js [--out reports/seo-audit.md]
// No network, no dependencies. Checks: title/meta length, H1 count, canonical, JSON-LD validity,
// image alt text, broken internal links, thin pages,
// sitemap coverage, duplicate titles/descriptions, noindex.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : path.join(root, 'reports', 'seo-audit.md');
const PRIVATE = /^(portal|sign|booked|book|thank-you|proposal-preview|loan-sign|loan-view|onboarding|business-model|check-preview|admin)/i;

function walk(d, out) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (/^(node_modules|\.git|netlify|reports|research_notes|scripts|assets|supabase)$/.test(f.name)) continue;
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, out); else if (f.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const files = walk(root, []);
const toUrl = f => '/' + path.relative(root, f).replace(/\\/g, '/').replace(/\.html$/, '').replace(/\/index$/, '').replace(/^index$/, '');
const exists = new Set(files.map(toUrl));
// netlify.toml rewrites also create valid URLs
try {
  const toml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
  for (const m of toml.matchAll(/from\s*=\s*"([^"]+)"/g)) if (!m[1].includes('*')) exists.add(m[1].replace(/\/$/, '') || '/');
} catch (e) {}
let sitemap = '';
try { sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'); } catch (e) {}

const issues = []; const titles = {}, descs = {};
const add = (sev, url, msg) => issues.push({ sev, url, msg });
let audited = 0;

for (const f of files) {
  const url = toUrl(f) || '/';
  if (PRIVATE.test(path.basename(f))) continue;
  const h = fs.readFileSync(f, 'utf8');
  const noindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(h);
  if (noindex) continue;
  audited++;
  const title = ((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const desc = ((h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || h.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] || '').trim();
  if (!title) add('high', url, 'Missing <title>');
  else { if (title.length > 65) add('med', url, `Title ${title.length} chars (over 65, Google truncates)`); if (title.length < 25) add('low', url, `Title only ${title.length} chars`); (titles[title] = titles[title] || []).push(url); }
  if (!desc) add('high', url, 'Missing meta description');
  else { if (desc.length > 160) add('med', url, `Meta description ${desc.length} chars (over 160)`); if (desc.length < 70) add('low', url, `Meta description only ${desc.length} chars`); (descs[desc] = descs[desc] || []).push(url); }
  const h1s = (h.match(/<h1[\s>]/gi) || []).length;
  if (h1s !== 1) add(h1s ? 'med' : 'high', url, `${h1s} <h1> tags (want exactly 1)`);
  if (!/<link[^>]+rel=["']canonical["']/i.test(h)) add('med', url, 'No canonical link');
  // JSON-LD
  const ld = [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  if (!ld.length) add('low', url, 'No JSON-LD structured data');
  let faqLd = 0;
  for (const j of ld) { try { const o = JSON.parse(j); const arr = Array.isArray(o) ? o : (o['@graph'] || [o]); for (const x of arr) if (x['@type'] === 'FAQPage') faqLd += (x.mainEntity || []).length; } catch (e) { add('high', url, 'Invalid JSON-LD (does not parse)'); } }
  // images
  const noAlt = (h.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).length;
  if (noAlt) add('med', url, `${noAlt} image(s) missing alt text`);
  // thin content
  const text = h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const words = text.split(' ').length;
  if (words < 300) add('med', url, `Thin page: about ${words} words`);
  // internal links
  const bad = new Set();
  for (const m of h.matchAll(/<a\b[^>]*\bhref=["']([^"'#?]+)[^"']*["']/gi)) {
    let href = m[1].trim();
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    if (/\.(pdf|jpg|jpeg|png|webp|svg|ico|js|css|xml|txt|mp4|ics)$/i.test(href) || href.startsWith('/.netlify') || href.startsWith('/assets/')) continue;
    const n = href.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (!exists.has(n) && !exists.has(n + '/') && !(n === '/' )) bad.add(href);
  }
  if (bad.size) add('high', url, `Broken internal link(s): ${[...bad].slice(0, 5).join(', ')}`);
  // sitemap coverage
  if (url !== '/' && !sitemap.includes('fixmy.energy' + url + '<') && !sitemap.includes('fixmy.energy' + url + '/<')) add('low', url, 'Not in sitemap.xml');
}
for (const [t, urls] of Object.entries(titles)) if (urls.length > 1) add('med', urls.join(', '), `Duplicate title: "${t.slice(0, 60)}"`);
for (const [d, urls] of Object.entries(descs)) if (urls.length > 1) add('med', urls.join(', '), `Duplicate meta description (${urls.length} pages)`);

const order = { high: 0, med: 1, low: 2 };
issues.sort((a, b) => order[a.sev] - order[b.sev]);
const count = s => issues.filter(i => i.sev === s).length;
let md = `# SEO audit\n\nGenerated ${new Date().toISOString().slice(0, 10)} · ${audited} public pages checked\n\n**${count('high')} high · ${count('med')} medium · ${count('low')} low**\n\n`;
for (const [sev, label] of [['high', 'High (fix first)'], ['med', 'Medium'], ['low', 'Low']]) {
  const list = issues.filter(i => i.sev === sev); if (!list.length) continue;
  md += `## ${label}\n\n`; for (const i of list) md += `- \`${i.url}\` — ${i.msg}\n`; md += '\n';
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, md);
console.log(`Audited ${audited} pages: ${count('high')} high, ${count('med')} medium, ${count('low')} low → ${path.relative(root, outFile)}`);
