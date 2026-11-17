#!/usr/bin/env python3
"""Austin, TX (Texas) pages: hub + 18 city pages across the Austin metro.
Run order: county -> service -> city -> utah -> austin. Facts kept conservative (no office claims, no prices)."""
import importlib.util, json, re
spec = importlib.util.spec_from_file_location('cp', 'scripts/build-county-pages.py'); cp = importlib.util.module_from_spec(spec); spec.loader.exec_module(cp)
esc, page, CTA, SITE = cp.esc, cp.page, cp.CTA, cp.SITE

TXU = 'Which company supplies your power depends on the address. Around Austin it can be <strong>Austin Energy</strong> (the city utility), <strong>Pedernales Electric Cooperative</strong>, <strong>Bluebonnet Electric Cooperative</strong>, a city-owned utility, or <strong>Oncor</strong> wires with a retail electricity provider you choose. Each pays differently for solar power you send to the grid, and some pay little or nothing, so what an upgrade is worth depends on your bill. We confirm which one you are on before we recommend anything.'
CITYPWR = ' %s may be served by more than one utility depending on the street, so we check your bill first.'
DRY = 'Central Texas summers are long and hot, with hail, heavy storms and strong sun. Heat pushes inverters into shutdowns, hail damages panels, and monitoring that stopped reporting can hide a fault for months, so a quiet system is worth checking.'
CITIES = [
 ('austin','Austin',TXU,['round-rock','pflugerville','cedar-park']),
 ('round-rock','Round Rock',TXU,['austin','pflugerville','georgetown']),
 ('cedar-park','Cedar Park',TXU,['leander','austin','round-rock']),
 ('pflugerville','Pflugerville',TXU,['round-rock','austin','hutto']),
 ('georgetown','Georgetown',TXU + CITYPWR % 'Georgetown',['round-rock','leander','liberty-hill']),
 ('leander','Leander',TXU,['cedar-park','liberty-hill','georgetown']),
 ('kyle','Kyle',TXU,['buda','san-marcos','austin']),
 ('buda','Buda',TXU,['kyle','austin','dripping-springs']),
 ('san-marcos','San Marcos',TXU + CITYPWR % 'San Marcos',['kyle','buda','austin']),
 ('lakeway','Lakeway',TXU,['bee-cave','austin','dripping-springs']),
 ('bee-cave','Bee Cave',TXU,['lakeway','austin','dripping-springs']),
 ('dripping-springs','Dripping Springs',TXU,['bee-cave','buda','lakeway']),
 ('hutto','Hutto',TXU,['pflugerville','taylor','round-rock']),
 ('manor','Manor',TXU,['pflugerville','hutto','austin']),
 ('liberty-hill','Liberty Hill',TXU,['leander','georgetown','cedar-park']),
 ('bastrop','Bastrop',TXU,['elgin','austin','manor']),
 ('elgin','Elgin',TXU,['bastrop','manor','hutto']),
 ('taylor','Taylor',TXU,['hutto','georgetown','round-rock']),
]
names = {c[0]: c[1] for c in CITIES}
UT_FAQ = lambda n: [('Do you serve %s?' % n, 'Yes. We are expanding in Austin, TX. We start with your photos and utility bill, then arrange a technician visit or a guided video evaluation. The first evaluation is free.'),
  ('Does it matter who installed my system?', 'No. We work on systems from any installer, including companies that have closed.'),
  ('Is the first evaluation free?', 'Yes. We start with your photos and utility bill, then a technician visit or a guided video evaluation. No obligation.')]

def city_html(c):
    slug, name, util, near = c; s = 'solar-repair-%s-tx' % slug
    title = 'Solar Panel Repair & Inverter Diagnostics in %s, TX | Solar Review' % name
    desc = 'Solar not producing in %s, Texas? Free evaluation, inverter and panel diagnostics and Powerwall battery retrofits, even if your installer closed. Call (619) 777-6527.' % name
    faqs = UT_FAQ(name) + [('What should I send first?', 'A photo of your inverter (including its label), a photo of any error or fault light, and your most recent utility bill. With those we can usually tell you what we think is happening before anyone visits.')]
    near_links = ''.join('<a href="/solar-repair-%s-tx">%s</a>' % (n, names[n]) for n in near if n in names)
    body = ('<article class="wrap">\n<div class="eyebrow">%s, Texas</div>\n<h1>Solar Panel Repair and Inverter Diagnostics in %s, Texas</h1>\n'
      '<p class="lede">If your solar system in %s has stopped producing, shows an inverter error, or was installed by a company that is gone, we diagnose it and tell you plainly what is wrong. The first evaluation is free.</p>\n'
      '<p class="meta">Solar Review &middot; Austin, TX &middot; Updated November 2026</p>\n<h2>What we do in %s</h2>\n'
      '<p>We diagnose and repair existing solar systems (inverters, panels, optimizers, wiring, monitoring) and add Tesla Powerwall batteries to existing systems. You do not need to have bought your system from us. We start with photos and your bill, so most homeowners never have to wait for a first visit.</p>\n'
      '<h2>Your utility decides what upgrades are worth</h2>\n<p>%s</p>\n<h2>What is hard on solar here</h2>\n<p>%s</p>\n'
      '<p>Common problems we fix: <a href="/solar-panels-not-producing">solar panels not producing</a>, <a href="/solar-inverter-replacement">inverter replacement</a>, <a href="/solar-monitoring-offline">monitoring offline</a>, and <a href="/add-powerwall-to-existing-solar">adding a Powerwall to existing solar</a>.</p>\n%s\n'
      '<h2>Common questions</h2>\n%s\n<div class="related"><h3>Nearby</h3>%s<a href="/austin-solar-repair">All of Austin, TX</a></div>\n</article>') % (
      esc(name), esc(name), esc(name), esc(name), util, DRY, CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in faqs), near_links)
    svc = json.dumps({"@context":"https://schema.org","@type":"Service","name":"Solar panel repair and inverter diagnostics in "+name+", Texas",
      "provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
      "serviceType":["Solar system diagnostics","Solar inverter repair","Tesla Powerwall retrofit"],"areaServed":{"@type":"City","name":name+", Texas"},"url":SITE+"/"+s})
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]})
    bc = json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},{"@type":"ListItem","position":2,"name":"Austin, TX","item":SITE+"/austin-solar-repair"},{"@type":"ListItem","position":3,"name":name,"item":SITE+"/"+s}]})
    return s, page(title, desc, SITE+'/'+s, [svc, faqld, bc], body)

def hub_html():
    lst = ''.join('<li><a href="/solar-repair-%s-tx">%s</a></li>' % (c[0], c[1]) for c in CITIES)
    faqs = [('Do you serve Texas?', 'Yes, we are starting in the Austin, TX area. We start with photos and your bill, then a technician visit or a guided video evaluation.'), UT_FAQ('Austin, TX')[1]]
    body = ('<article class="wrap">\n<div class="eyebrow">Texas</div>\n<h1>Solar Repair and Inverter Diagnostics in Austin, TX</h1>\n'
      '<p class="lede">Solar not producing, an inverter error, or an installer that closed? We diagnose existing solar systems and add batteries across Austin, TX. The first evaluation is free.</p>\n'
      '<p class="meta">Solar Review &middot; Updated November 2026</p>\n<h2>Cities we serve</h2>\n<ul id="tx-city-list">%s</ul>\n'
      '<h2>How it works</h2>\n<p>Send photos of your inverter and a recent utility bill. We tell you what we see, then arrange a technician visit or a guided video evaluation if it makes sense. Nothing is sold before you know what is wrong.</p>\n'
      '<h2>Guides</h2>\n<p><a href="/solar-panels-not-producing">Solar panels not producing</a> &middot; <a href="/solar-inverter-replacement">Inverter replacement</a> &middot; <a href="/solar-monitoring-offline">Monitoring offline</a> &middot; <a href="/add-powerwall-to-existing-solar">Add a Powerwall</a> &middot; <a href="/solar-system-health-check">Free health check</a></p>\n%s\n'
      '<h2>Common questions</h2>\n%s\n</article>') % (lst, CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in faqs))
    svc = json.dumps({"@context":"https://schema.org","@type":"Service","name":"Solar repair and diagnostics in Austin, TX","provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
      "areaServed":{"@type":"AdministrativeArea","name":"Travis County, Texas"},"url":SITE+"/austin-solar-repair"})
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]})
    return 'austin-solar-repair', page('Solar Panel Repair & Inverter Diagnostics in Austin, TX | Solar Review',
      'Solar not producing in Texas? Free evaluation, inverter and panel diagnostics and Powerwall battery retrofits across Austin, TX, even if your installer closed.', SITE+'/austin-solar-repair', [svc, faqld], body)

pages = [hub_html()] + [city_html(c) for c in CITIES]
sm = open('sitemap.xml').read(); nt = open('netlify.toml').read()
for s, h in pages:
    open(s + '.html', 'w', encoding='utf-8').write(h)
    if '/' + s + '<' not in sm:
        sm = sm.replace('</urlset>', '  <url>\n    <loc>https://fixmy.energy/%s</loc>\n    <lastmod>2026-10-29</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>' % s)
    if 'from = "/%s"' % s not in nt:
        nt += '\n[[headers]]\n  for = "/%s"\n  [headers.values]\n    Cache-Control = "no-cache, must-revalidate"\n\n[[redirects]]\n  from = "/%s"\n  to = "/%s.html"\n  status = 200\n' % (s, s, s)
open('sitemap.xml','w').write(sm); open('netlify.toml','w').write(nt)
hub = open('southern-california-solar-repair.html', encoding='utf-8').read()
if 'id="tx-link"' not in hub:
    hub = hub.replace('<h2>Why homeowners call us</h2>', '<p id="tx-link">Also serving <a href="/austin-solar-repair">Austin, TX</a>.</p>\n<h2>Why homeowners call us</h2>', 1)
    open('southern-california-solar-repair.html', 'w', encoding='utf-8').write(hub)
print('wrote', len(pages), 'Texas pages')
