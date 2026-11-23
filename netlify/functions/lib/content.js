// Content engine shared helpers (2026-11-23, per Dennis).
// One weekly batch: 1 blog article + 3 short posts (Google Business Profile, Facebook, Instagram, Nextdoor).
// Quoya drafts -> Dennis approves each item in the portal -> content-publish posts it at its time.
//   blog  -> commits blog/<slug>.html + blog.html card + sitemap + netlify.toml rewrite + llms.txt straight
//            to main through the GitHub Git Data API (one commit = one Netlify deploy).
//   short -> GHL Social Planner (accounts Dennis picked in the portal, stored in pipeline_state
//            'content_channels'); Nextdoor has no posting API, so its text is marked "copy ready" and emailed.
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const REPO = 'dennislarsen29-design/fixmy-energy';
const GH = 'https://api.github.com/repos/' + REPO;
const GHL = 'https://services.leadconnectorhq.com';
const SITE = 'https://fixmy.energy';
const TEMPLATE = 'blog/nem-3-solar-export-credits.html';
// Equipment-only photo labels. Never Front of House (house number), Utility Bill (account data) or people.
const SAFE_LABELS = ['Solar Array', 'Roof Photo', 'Inverter Photo', 'Battery Placement Wall Photo', 'Panel Placard', 'MSP Sticker Photo', 'Serial Number'];
const SITE_IMAGES = [
  { url: SITE + '/assets/hero.jpg', label: 'Homepage hero (rooftop solar)' },
  { url: SITE + '/assets/cta-band.jpg', label: 'Solar install photo' },
  { url: SITE + '/assets/powerwall-split.jpg', label: 'Powerwall on a wall' }
];
const CHANNELS = ['gbp', 'facebook', 'instagram', 'nextdoor'];

function sbH(key, extra) { return Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {}); }
async function sbGet(path, key) {
  const r = await fetch(SB + path, { headers: sbH(key) });
  if (!r.ok) throw new Error('GET ' + path.split('?')[0] + ' ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return r.json();
}
async function sbPatch(path, body, key) {
  const r = await fetch(SB + path, { method: 'PATCH', headers: sbH(key, { Prefer: 'return=representation' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('PATCH ' + path.split('?')[0] + ' ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return r.json();
}
async function sbPost(path, body, key) {
  const r = await fetch(SB + path, { method: 'POST', headers: sbH(key, { Prefer: 'return=representation' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('POST ' + path.split('?')[0] + ' ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return r.json();
}
async function stateGet(k, key) {
  try { const r = await sbGet('/pipeline_state?key=eq.' + k + '&select=value', key); const v = r[0] && r[0].value; return typeof v === 'string' ? JSON.parse(v) : (v || null); } catch (e) { return null; }
}
async function stateSet(k, value, key) {
  const r = await fetch(SB + '/pipeline_state?on_conflict=key', { method: 'POST', headers: sbH(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: k, value, updated_at: new Date().toISOString() }) });
  return r.ok;
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function slugify(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, ''); }

// Keep only safe article markup: h2 h3 p ul ol li strong em br a(href internal or fixmy.energy).
function sanitizeArticle(html) {
  let s = String(html || '');
  s = s.replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, function (m, tag, attrs) {
    tag = tag.toLowerCase();
    const closing = m.charAt(1) === '/';
    if (['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br'].indexOf(tag) > -1) return closing ? '</' + tag + '>' : '<' + tag + '>';
    if (tag === 'a') {
      if (closing) return '</a>';
      const h = /href\s*=\s*"([^"]*)"/i.exec(attrs) || /href\s*=\s*'([^']*)'/i.exec(attrs);
      let href = h ? h[1].trim() : '';
      if (/^https?:\/\/(www\.)?fixmy\.energy/i.test(href)) href = href.replace(/^https?:\/\/(www\.)?fixmy\.energy/i, '') || '/';
      if (!/^\/[a-z0-9\-\/#?=&.]*$/i.test(href) && !/^tel:\d+$/.test(href)) return '<a>';
      return '<a href="' + esc(href) + '">';
    }
    return '';
  });
  s = s.replace(/<a>([\s\S]*?)<\/a>/g, '$1');     // dropped (external) links become plain text
  return s.trim();
}

// Plain text guardrail shared by agent + API: no prices, dollar figures, guarantees, affiliation claims.
function textProblems(t) {
  const out = [];
  const s = String(t || '');
  if (/\$\s?\d/.test(s)) out.push('contains a dollar figure');
  if (/\b\d{1,3}\s?%/.test(s) && !/\b(roughly|about|around)\b/i.test(s)) out.push('contains a percentage');
  if (/\bguarantee/i.test(s)) out.push('says "guarantee"');
  if (/\b(authorized|certified|official)\s+(tesla|solaredge|enphase|sma|lg)\b/i.test(s) || /\bpartner(ed)?\s+with\s+(tesla|solaredge|enphase)\b/i.test(s)) out.push('claims a manufacturer affiliation');
  return out;
}

// ── images ────────────────────────────────────────────────────────────────────────────
async function imageOptions(key, n) {
  const opts = [];
  try {
    const q = '/job_photos?select=url,label&label=in.(' + SAFE_LABELS.map(l => '"' + l + '"').join(',') + ')&url=not.is.null&order=id.desc&limit=200';
    const rows = await sbGet(q, key);
    const pool = rows.filter(r => /^https:\/\/[^\s]+\.(jpe?g|png|webp)(\?|$)/i.test(r.url || ''));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    pool.slice(0, n || 6).forEach(r => opts.push({ url: r.url, source: 'job_photo', label: r.label }));
  } catch (e) { /* no photos is fine — site images still offered */ }
  SITE_IMAGES.forEach(x => opts.push({ url: x.url, source: 'site', label: x.label }));
  return opts;
}

// ── blog page ─────────────────────────────────────────────────────────────────────────
function buildBlogHtml(template, post) {
  const url = SITE + '/blog/' + post.slug;
  const title = post.title, desc = post.meta_description;
  const faq = Array.isArray(post.faq) ? post.faq.filter(f => f && f.q && f.a) : [];
  let h = template;
  h = h.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + ' — Solar Review</title>');
  h = h.replace(/<meta name="description" content="[^"]*"\/?>/, '<meta name="description" content="' + esc(desc) + '"/>');
  h = h.replace(/<link rel="canonical" href="[^"]*"\/?>/, '<link rel="canonical" href="' + url + '"/>');
  h = h.replace(/<meta property="og:title" content="[^"]*"\/?>/, '<meta property="og:title" content="' + esc(title) + '"/>');
  h = h.replace(/<meta property="og:description" content="[^"]*"\/?>/, '<meta property="og:description" content="' + esc(desc) + '"/>');
  h = h.replace(/<meta property="og:url" content="[^"]*"\/?>/, '<meta property="og:url" content="' + url + '"/>' + (post.image_url ? '\n<meta property="og:image" content="' + esc(post.image_url) + '"/>' : ''));
  h = h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
  const date = (post.published_on || new Date().toISOString()).slice(0, 10);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc, datePublished: date, dateModified: date, mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'Solar Review' }, publisher: { '@type': 'Organization', name: 'Solar Review', logo: { '@type': 'ImageObject', url: SITE + '/assets/logo-solar-review.png' } }, image: post.image_url || undefined },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Solar Guides', item: SITE + '/blog' },
      { '@type': 'ListItem', position: 3, name: title, item: url }] }
  ];
  if (faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  const ldHtml = ld.map(o => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n');
  h = h.replace('</head>', ldHtml + '\n</head>');
  const month = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let art = '<article class="wrap">\n';
  art += '  <div class="eyebrow">' + esc(post.eyebrow || 'Solar Guide') + '</div>\n';
  art += '  <h1>' + esc(title) + '</h1>\n';
  if (post.lede) art += '  <p class="lede">' + esc(post.lede) + '</p>\n';
  art += '  <p class="meta">Solar Review · Published ' + month + '</p>\n';
  if (post.image_url) art += '  <img src="' + esc(post.image_url) + '" alt="' + esc(post.image_alt || title) + '" loading="lazy" style="width:100%;border-radius:14px;margin:6px 0 24px;display:block;"/>\n';
  art += sanitizeArticle(post.body) + '\n';
  art += '  <div class="cta-box">\n    <h3>Want a second set of eyes on your system?</h3>\n    <p>Free evaluation, no obligation. We service systems from any installer, including companies that have closed.</p>\n    <a href="/book" class="cta-btn">Book a Free Evaluation →</a>\n  </div>\n';
  if (faq.length) {
    art += '  <h2>Frequently asked questions</h2>\n';
    faq.forEach(f => { art += '  <p class="faq-q">' + esc(f.q) + '</p>\n  <p>' + esc(f.a) + '</p>\n'; });
  }
  const rel = (Array.isArray(post.related) ? post.related : []).filter(r => r && r.href && r.label && /^\/[a-z0-9\-\/]+$/i.test(r.href)).slice(0, 4);
  if (rel.length) art += '  <div class="related">\n    <h3>Related reading</h3>\n    ' + rel.map(r => '<a href="' + esc(r.href) + '">' + esc(r.label) + '</a>').join('') + '\n  </div>\n';
  art += '  <div class="cta-box">\n    <h3>Solar not doing what it should?</h3>\n    <p>Call <a href="tel:6197776527">(619) 777-6527</a> or book online.</p>\n    <a href="/book" class="cta-btn">Book Your Free Eval →</a>\n  </div>\n';
  art += '</article>';
  h = h.replace(/<article class="wrap">[\s\S]*?<\/article>/, art);
  return h;
}

function blogCard(post) {
  return '<a class="card" href="/blog/' + post.slug + '"><span class="tag">' + esc(post.eyebrow || 'Guide') + '</span><h2>' + esc(post.title) + '</h2><p>' + esc(post.meta_description) + '</p><span class="go">Read the guide →</span></a>';
}

// ── GitHub: several files in ONE commit to main ───────────────────────────────────────
function ghH() { return { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'solar-review-content-engine', 'Content-Type': 'application/json' }; }
async function ghFile(path) {
  const r = await fetch(GH + '/contents/' + path + '?ref=main', { headers: ghH() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub read ' + path + ' ' + r.status);
  const j = await r.json();
  return Buffer.from(j.content, 'base64').toString('utf8');
}
async function ghCommit(files, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await (await fetch(GH + '/git/ref/heads/main', { headers: ghH() })).json();
    if (!ref.object) throw new Error('GitHub: cannot read main');
    const base = await (await fetch(GH + '/git/commits/' + ref.object.sha, { headers: ghH() })).json();
    const tree = [];
    for (const f of files) {
      const b = await fetch(GH + '/git/blobs', { method: 'POST', headers: ghH(), body: JSON.stringify({ content: Buffer.from(f.content, 'utf8').toString('base64'), encoding: 'base64' }) });
      if (!b.ok) throw new Error('GitHub blob ' + b.status);
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: (await b.json()).sha });
    }
    const t = await fetch(GH + '/git/trees', { method: 'POST', headers: ghH(), body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
    if (!t.ok) throw new Error('GitHub tree ' + t.status);
    const c = await fetch(GH + '/git/commits', { method: 'POST', headers: ghH(), body: JSON.stringify({ message, tree: (await t.json()).sha, parents: [ref.object.sha] }) });
    if (!c.ok) throw new Error('GitHub commit ' + c.status);
    const commit = await c.json();
    const u = await fetch(GH + '/git/refs/heads/main', { method: 'PATCH', headers: ghH(), body: JSON.stringify({ sha: commit.sha, force: false }) });
    if (u.ok) return commit.sha;
    if (u.status !== 422) throw new Error('GitHub ref update ' + u.status);   // 422 = main moved; rebuild on the new tip
  }
  throw new Error('GitHub: main kept moving, try again');
}

async function publishBlog(post) {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set in Netlify');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(post.slug || '')) throw new Error('bad slug');
  const path = 'blog/' + post.slug + '.html';
  if (await ghFile(path)) throw new Error('A blog page with this address already exists: /blog/' + post.slug + ' (change the slug)');
  const [tpl, blog, sitemap, toml, llms] = await Promise.all([ghFile(TEMPLATE), ghFile('blog.html'), ghFile('sitemap.xml'), ghFile('netlify.toml'), ghFile('llms.txt')]);
  if (!tpl || !blog || !sitemap || !toml) throw new Error('could not read site files from GitHub');
  const files = [{ path, content: buildBlogHtml(tpl, post) }];
  const card = blogCard(post);
  const firstCard = blog.indexOf('<a class="card"');
  if (firstCard < 0) throw new Error('blog.html card list not found');
  files.push({ path: 'blog.html', content: blog.slice(0, firstCard) + card + '\n' + blog.slice(firstCard) });
  const today = new Date().toISOString().slice(0, 10);
  files.push({ path: 'sitemap.xml', content: sitemap.replace('</urlset>', '  <url><loc>' + SITE + '/blog/' + post.slug + '</loc><lastmod>' + today + '</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>') });
  if (toml.indexOf('from = "/blog/' + post.slug + '"') < 0) files.push({ path: 'netlify.toml', content: toml.replace(/\s*$/, '') + '\n\n[[redirects]]\n  from = "/blog/' + post.slug + '"\n  to = "/blog/' + post.slug + '.html"\n  status = 200\n' });
  if (llms && llms.indexOf('/blog/' + post.slug) < 0) {
    const line = '- ' + post.title + ': ' + SITE + '/blog/' + post.slug;
    const anchor = /(- Battery storage and SGIP:[^\n]*\n)/;
    files.push({ path: 'llms.txt', content: anchor.test(llms) ? llms.replace(anchor, '$1' + line + '\n') : llms.replace(/\s*$/, '') + '\n' + line + '\n' });
  }
  const sha = await ghCommit(files, 'Blog: ' + post.title + '\n\nPublished from the portal content queue (approved by ' + (post.approved_by || 'admin') + ').');
  return { sha, url: SITE + '/blog/' + post.slug };
}

// ── GHL Social Planner ────────────────────────────────────────────────────────────────
function ghlH() { return { Authorization: 'Bearer ' + process.env.GHL_API_KEY, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' }; }
function loc() { return process.env.GHL_LOCATION_ID || 'gXWwbOVymY0iRfj7c1It'; }
function platformOf(a) {
  const p = String(a.platform || a.type || a.provider || '').toLowerCase();
  if (/google|gmb|gbp/.test(p)) return 'gbp';
  if (/insta/.test(p)) return 'instagram';
  if (/face|fb/.test(p)) return 'facebook';
  return p || 'other';
}
async function ghlAccounts() {
  if (!process.env.GHL_API_KEY) throw new Error('GHL_API_KEY is not set');
  const r = await fetch(GHL + '/social-media-posting/' + loc() + '/accounts', { headers: ghlH() });
  const t = await r.text();
  if (!r.ok) throw new Error('GHL accounts HTTP ' + r.status + ': ' + t.slice(0, 160));
  let j = {}; try { j = JSON.parse(t); } catch (e) {}
  const list = (j.results && j.results.accounts) || j.accounts || (Array.isArray(j.results) ? j.results : []) || [];
  return list.map(a => ({ id: a.id || a._id, name: a.name || a.displayName || a.username || '', platform: platformOf(a), raw_platform: a.platform || a.type || '', expired: !!(a.isExpired || a.expired) }));
}
async function ghlPost(accountIds, text, imageUrl, userId) {
  const body = { accountIds, summary: text, type: 'post', status: 'published' };
  if (userId) body.userId = userId;
  if (imageUrl) body.media = [{ url: imageUrl, type: /\.png(\?|$)/i.test(imageUrl) ? 'image/png' : 'image/jpeg' }];
  const r = await fetch(GHL + '/social-media-posting/' + loc() + '/posts', { method: 'POST', headers: ghlH(), body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200));
  return t.slice(0, 200);
}

module.exports = { SB, SITE, CHANNELS, SAFE_LABELS, sbGet, sbPatch, sbPost, stateGet, stateSet, esc, slugify, sanitizeArticle, textProblems, imageOptions, buildBlogHtml, blogCard, publishBlog, ghlAccounts, ghlPost, ghFile };
