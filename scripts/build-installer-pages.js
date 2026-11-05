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
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
    { '@type': 'Question', name: 'Is ' + ins.label + ' still in business?', acceptedAnswer: { '@type': 'Answer', text: facts[id] || (ins.label + ' is no longer operating.') } },
    { '@type': 'Question', name: 'Who services ' + ins.label + ' solar systems in California now?', acceptedAnswer: { '@type': 'Answer', text: 'Solar Review (fixmy.energy) provides independent diagnostics, repair, monitoring, and battery retrofits for ' + ins.label + ' systems across San Diego County and across California.' } },
    { '@type': 'Question', name: 'Is my ' + ins.label + ' warranty still valid?', acceptedAnswer: { '@type': 'Answer', text: 'Workmanship warranties generally die with the installer, but equipment warranties from the panel, inverter, and battery manufacturers usually survive. An independent inspection tells you what is still covered.' } } ] };
  rep('</head>', '<script type="application/ld+json">' + JSON.stringify(faq) + '</script>\n<script>window.__INSTALLER=' + JSON.stringify(id) + ';</script>\n</head>');
  // The page script still reads ?installer= for the form, badges and tracking: fall back to the baked id,
  // and stop it adding a second (duplicate) FAQPage block.
  h = h.split("new URLSearchParams(window.location.search).get('installer')").join("(new URLSearchParams(window.location.search).get('installer') || window.__INSTALLER || '')");
  rep('document.head.appendChild(ldTag);', '/* FAQPage is baked into the static HTML */');
  fs.writeFileSync(path.join(root, 'installers', id + '.html'), h);
});
console.log('built', Object.keys(map).join(', '));
