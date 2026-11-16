// Live-site SEO audit used by seo-audit-scan.js (the same checks as scripts/seo-audit.js, but over HTTP).
const SITE = 'https://fixmy.energy';
const PRIVATE = /^\/(portal|sign|booked|book|thank-you|proposal-preview|loan-sign|loan-view|onboarding|business-model|check-preview|admin)/i;
function text(h, re) { const m = h.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; }
function unesc(s) { return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&#39;/g, "'"); }
function auditHtml(url, h) {
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(h)) return null;
  const title = unesc(text(h, /<title[^>]*>([\s\S]*?)<\/title>/i));
  const desc = unesc(text(h, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || text(h, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i));
  const issues = [];
  if (!title) issues.push({ sev: 'high', code: 'no_title', msg: 'Missing <title>' });
  else if (title.length > 65) issues.push({ sev: 'med', code: 'long_title', msg: 'Title ' + title.length + ' chars (over 65)' });
  if (!desc) issues.push({ sev: 'high', code: 'no_desc', msg: 'Missing meta description' });
  else if (desc.length > 160) issues.push({ sev: 'med', code: 'long_desc', msg: 'Meta description ' + desc.length + ' chars (over 160)' });
  const h1s = (h.match(/<h1[\s>]/gi) || []).length;
  if (h1s !== 1) issues.push({ sev: h1s ? 'med' : 'high', code: 'h1', msg: h1s + ' <h1> tags (want 1)' });
  if (!/<link[^>]+rel=["']canonical["']/i.test(h)) issues.push({ sev: 'med', code: 'canonical', msg: 'No canonical link' });
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { JSON.parse(m[1]); } catch (e) { issues.push({ sev: 'high', code: 'bad_jsonld', msg: 'Invalid JSON-LD' }); break; } }
  const noAlt = (h.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).length;
  if (noAlt) issues.push({ sev: 'med', code: 'alt', msg: noAlt + ' image(s) missing alt text' });
  const words = h.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').split(' ').length;
  if (words < 300) issues.push({ sev: 'med', code: 'thin', msg: 'Thin page (~' + words + ' words)' });
  return { url, title, desc, issues };
}
async function pagesFromSitemap() {
  const r = await fetch(SITE + '/sitemap.xml'); if (!r.ok) throw new Error('sitemap ' + r.status);
  const xml = await r.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim().replace(/^https?:\/\/[^/]+/, '') || '/').filter(p => !PRIVATE.test(p));
}
async function run(maxPages) {
  const paths = (await pagesFromSitemap()).slice(0, maxPages || 160);
  const pages = []; let i = 0;
  async function worker() { while (i < paths.length) { const p = paths[i++]; try { const r = await fetch(SITE + p, { redirect: 'follow' }); if (!r.ok) { pages.push({ url: p, issues: [{ sev: 'high', code: 'http', msg: 'HTTP ' + r.status }] }); continue; } const a = auditHtml(p, await r.text()); if (a) pages.push(a); } catch (e) { pages.push({ url: p, issues: [{ sev: 'high', code: 'fetch', msg: e.message }] }); } } }
  await Promise.all([1, 2, 3, 4, 5].map(worker));
  return { urls: paths, pages };
}
module.exports = { auditHtml, run };
