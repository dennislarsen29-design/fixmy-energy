#!/usr/bin/env node
// Generates STATIC installer pages (installers/<id>.html) from check-preview.html (2026-11-05).
// The old routes set title/meta/H1/FAQ with JavaScript, so crawlers and the SEO self-correction loop
// saw a generic page. Here those values are baked into the HTML. Edit the map in check-preview.html,
// then run:  node scripts/build-installer-pages.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'check-preview.html'), 'utf8');
function grab(name) {
  const i = src.indexOf('var ' + name + ' = {'); if (i < 0) throw new Error('missing ' + name);
  const j = src.indexOf('\n    };', i) + 6;
  return new Function('return ' + src.slice(i + ('var ' + name + ' = ').length, j))();
}
const map = grab('map'), facts = grab('statusFacts');
const extraData = {}; JSON.parse(fs.readFileSync(path.join(__dirname, 'installer-data.json'), 'utf8')).forEach(r => { extraData[r[0]] = { imp: r[5] }; });
const guides = (()=>{ try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'installer-guides.json'), 'utf8')); } catch (e) { return {}; } })();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
fs.mkdirSync(path.join(root, 'installers'), { recursive: true });
Object.keys(map).forEach(id => {
  const ins = map[id];
  let h = src;
  const rep = (a, b) => { if (h.indexOf(a) < 0) throw new Error('anchor missing: ' + a.slice(0, 40)); h = h.replace(a, () => b); };
  rep('<title>Free Solar Health Check · Solar Review California</title>', '<title>' + esc(ins.title) + '</title>');
  rep(/<meta name="description" content="[^"]*"\/>/.exec(h)[0], '<meta name="description" content="' + esc(ins.desc) + '"/>');
  rep('<link rel="canonical" id="canonicalLink" href="https://fixmy.energy/check-preview.html"/>', '<link rel="canonical" id="canonicalLink" href="https://fixmy.energy/' + id + '"/>');
  rep("<h1>Your installer closed.<br><em>We didn't.</em></h1>", '<h1>' + ins.headline.replace(/\\'/g, "'") + '</h1>');
  const extra = (extraData[id] || {}).imp;
  const qa = [
    ['Is ' + ins.label + ' still in business?', facts[id] || (ins.label + ' is no longer operating.')],
    ['Who services ' + ins.label + ' solar systems in California now?', 'Solar Review (fixmy.energy) provides independent diagnostics, repair, monitoring, and battery retrofits for ' + ins.label + ' systems across San Diego County and across California.'],
    ['Is my ' + ins.label + ' warranty still valid?', 'Workmanship warranties generally die with the installer, but equipment warranties from the panel, inverter, and battery manufacturers usually survive. An independent inspection tells you what is still covered.'],
    ['What should I do about my ' + ins.label + ' system?', extra || ('Start with a free evaluation. We compare what your system should produce with what it actually produces, read any inverter error codes, and tell you plainly what is wrong and what the manufacturer warranties still cover.')],
    ['How much does an evaluation cost?', 'The first evaluation is free. We start with your photos and your utility bill, then schedule a technician visit or a guided video evaluation, and we explain any repair cost before work begins.']
  ];
  ((guides[id] || {}).extraQa || []).forEach(x => qa.push(x));
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map(x => ({ '@type': 'Question', name: x[0], acceptedAnswer: { '@type': 'Answer', text: x[1] } })) };
  const url = 'https://fixmy.energy/' + id;
  const page = { '@context': 'https://schema.org', '@type': 'WebPage', name: ins.title, url: url, description: ins.desc, dateModified: '2026-11-13', inLanguage: 'en-US',
    about: { '@type': 'Thing', name: ins.label + ' solar systems' }, publisher: { '@type': 'Organization', name: 'Solar Review', url: 'https://fixmy.energy', telephone: '+1-619-777-6527' } };
  const svc = { '@context': 'https://schema.org', '@type': 'Service', name: 'Independent service for ' + ins.label + ' solar systems', serviceType: 'Solar system diagnostics, repair and battery retrofit', url: url,
    provider: { '@type': 'Organization', name: 'Solar Review', url: 'https://fixmy.energy', telephone: '+1-619-777-6527' },
    areaServed: ['San Diego County', 'Los Angeles County', 'Orange County', 'Riverside County', 'San Bernardino County'].map(n => ({ '@type': 'AdministrativeArea', name: n + ', California' })) };
  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://fixmy.energy/' },
    { '@type': 'ListItem', position: 2, name: 'Closed solar installers', item: 'https://fixmy.energy/defunct-solar-installers' },
    { '@type': 'ListItem', position: 3, name: ins.label, item: url } ] };
  const others = Object.keys(map).filter(k => k !== id);
  const start = others.indexOf(id) >= 0 ? 0 : (Object.keys(map).indexOf(id) * 3) % others.length;
  const rel = [0, 1, 2, 3].map(n => others[(start + n) % others.length]);
  const visFaq = '<section class="faq-static" style="max-width:820px;margin:0 auto;padding:32px 20px;font-family:inherit;">\n<h2>Common questions about ' + esc(ins.label) + ' solar systems</h2>\n' +
    qa.map(x => '<h3 style="font-size:1.02rem;margin:18px 0 4px;">' + esc(x[0]) + '</h3><p style="margin:0;line-height:1.6;">' + esc(x[1]) + '</p>').join('\n') +
    '\n<p style="margin-top:22px;"><strong>Related:</strong> <a href="/defunct-solar-installers">All closed solar installers</a> ' + rel.map(k => '&middot; <a href="/' + k + '">' + esc(map[k].label) + '</a>').join(' ') + '</p>\n</section>\n';
  rep('</head>', [faq, page, svc, bc].map(o => '<script type="application/ld+json">' + JSON.stringify(o) + '</script>').join('\n') + '\n<script>window.__INSTALLER=' + JSON.stringify(id) + ';</script>\n</head>');
  rep('<div class="form-wrap" id="book">', visFaq + ((guides[id] || {}).html || '') + '<div class="form-wrap" id="book">');
  // The page script still reads ?installer= for the form, badges and tracking: fall back to the baked id,
  // and stop it adding a second (duplicate) FAQPage block.
  h = h.split("new URLSearchParams(window.location.search).get('installer')").join("(new URLSearchParams(window.location.search).get('installer') || window.__INSTALLER || '')");
  rep('document.head.appendChild(ldTag);', '/* FAQPage is baked into the static HTML */');
  fs.writeFileSync(path.join(root, 'installers', id + '.html'), h);
});
console.log('built', Object.keys(map).join(', '));
