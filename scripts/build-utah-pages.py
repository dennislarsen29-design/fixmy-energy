#!/usr/bin/env python3
"""Salt Lake Valley (Utah) pages: hub + 16 city pages within ~25 miles of South Jordan.
Run order: county -> service -> city -> utah. Facts kept conservative (no office claims, no prices)."""
import importlib.util, json, re
spec = importlib.util.spec_from_file_location('cp', 'scripts/build-county-pages.py'); cp = importlib.util.module_from_spec(spec); spec.loader.exec_module(cp)
esc, page, CTA, SITE = cp.esc, cp.page, cp.CTA, cp.SITE

RMP = 'Most homes in the Salt Lake Valley are served by <strong>Rocky Mountain Power</strong>. Solar customers who signed up more recently are generally credited at a lower rate for power they send to the grid than older customers were, which is why a healthy inverter and, in some cases, a battery matter. We confirm your plan from your bill.'
CITYPWR = ' %s runs its own city electric utility for part of the area, so some addresses are not on Rocky Mountain Power. We confirm from your bill which one you are on.'
DRY = 'Utah has strong sun, cold winters and hot dry summers. Snow load, freeze and thaw, and summer heat all stress inverters, connectors and roof mounts, and a fault can go unnoticed because winter production is low anyway.'
CITIES = [
 ('south-jordan','South Jordan',RMP,['west-jordan','riverton','herriman']),
 ('west-jordan','West Jordan',RMP,['south-jordan','taylorsville','sandy']),
 ('sandy','Sandy',RMP,['draper','midvale','cottonwood-heights']),
 ('draper','Draper',RMP,['sandy','south-jordan','bluffdale']),
 ('riverton','Riverton',RMP,['south-jordan','herriman','bluffdale']),
 ('herriman','Herriman',RMP,['riverton','south-jordan','west-jordan']),
 ('bluffdale','Bluffdale',RMP,['draper','riverton','lehi']),
 ('midvale','Midvale',RMP,['sandy','murray','taylorsville']),
 ('murray','Murray',RMP + CITYPWR % 'Murray',['midvale','millcreek','taylorsville']),
 ('taylorsville','Taylorsville',RMP,['murray','west-valley-city','west-jordan']),
 ('west-valley-city','West Valley City',RMP,['taylorsville','salt-lake-city','west-jordan']),
 ('salt-lake-city','Salt Lake City',RMP,['millcreek','west-valley-city','holladay']),
 ('millcreek','Millcreek',RMP,['salt-lake-city','murray','holladay']),
 ('holladay','Holladay',RMP,['millcreek','cottonwood-heights','salt-lake-city']),
 ('cottonwood-heights','Cottonwood Heights',RMP,['sandy','holladay','midvale']),
 ('lehi','Lehi',RMP + CITYPWR % 'Lehi',['draper','bluffdale','south-jordan']),
]
names = {c[0]: c[1] for c in CITIES}
UT_FAQ = lambda n: [('Do you serve %s?' % n, 'Yes. We are expanding in the Salt Lake Valley. We start with your photos and utility bill, then arrange a technician visit or a guided video evaluation. The first evaluation is free.'),
  ('Does it matter who installed my system?', 'No. We work on systems from any installer, including companies that have closed.'),
  ('Is the first evaluation free?', 'Yes. We start with your photos and utility bill, then a technician visit or a guided video evaluation. No obligation.')]

def city_html(c):
    slug, name, util, near = c; s = 'solar-repair-%s-ut' % slug
    title = 'Solar Panel Repair & Inverter Diagnostics in %s, UT | Solar Review' % name
    desc = 'Solar not producing in %s, Utah? Free evaluation, inverter and panel diagnostics and Powerwall battery retrofits, even if your installer closed. Call (619) 777-6527.' % name
    faqs = UT_FAQ(name)
    near_links = ''.join('<a href="/solar-repair-%s-ut">%s</a>' % (n, names[n]) for n in near if n in names)
    body = ('<article class="wrap">\n<div class="eyebrow">%s, Utah</div>\n<h1>Solar Panel Repair and Inverter Diagnostics in %s, Utah</h1>\n'
      '<p class="lede">If your solar system in %s has stopped producing, shows an inverter error, or was installed by a company that is gone, we diagnose it and tell you plainly what is wrong. The first evaluation is free.</p>\n'
      '<p class="meta">Solar Review &middot; Salt Lake Valley &middot; Updated October 2026</p>\n<h2>What we do in %s</h2>\n'
      '<p>We diagnose and repair existing solar systems (inverters, panels, optimizers, wiring, monitoring) and add Tesla Powerwall batteries to existing systems. You do not need to have bought your system from us. We start with photos and your bill, so most homeowners never have to wait for a first visit.</p>\n'
      '<h2>Your utility decides what upgrades are worth</h2>\n<p>%s</p>\n<h2>What is hard on solar here</h2>\n<p>%s</p>\n'
      '<p>Common problems we fix: <a href="/solar-panels-not-producing">solar panels not producing</a>, <a href="/solar-inverter-replacement">inverter replacement</a>, <a href="/solar-monitoring-offline">monitoring offline</a>, and <a href="/add-powerwall-to-existing-solar">adding a Powerwall to existing solar</a>.</p>\n%s\n'
      '<h2>Common questions</h2>\n%s\n<div class="related"><h3>Nearby</h3>%s<a href="/utah-solar-repair">All of the Salt Lake Valley</a></div>\n</article>') % (
      esc(name), esc(name), esc(name), esc(name), util, DRY, CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in faqs), near_links)
    svc = json.dumps({"@context":"https://schema.org","@type":"Service","name":"Solar panel repair and inverter diagnostics in "+name+", Utah",
      "provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
      "serviceType":["Solar system diagnostics","Solar inverter repair","Tesla Powerwall retrofit"],"areaServed":{"@type":"City","name":name+", Utah"},"url":SITE+"/"+s})
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]})
    bc = json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},{"@type":"ListItem","position":2,"name":"Salt Lake Valley","item":SITE+"/utah-solar-repair"},{"@type":"ListItem","position":3,"name":name,"item":SITE+"/"+s}]})
    return s, page(title, desc, SITE+'/'+s, [svc, faqld, bc], body)

def hub_html():
    lst = ''.join('<li><a href="/solar-repair-%s-ut">%s</a></li>' % (c[0], c[1]) for c in CITIES)
    faqs = [('Do you serve Utah?', 'Yes, in the Salt Lake Valley, starting around South Jordan. We start with photos and your bill, then a technician visit or a guided video evaluation.'), UT_FAQ('the Salt Lake Valley')[1]]
    body = ('<article class="wrap">\n<div class="eyebrow">Utah</div>\n<h1>Solar Repair and Inverter Diagnostics in the Salt Lake Valley</h1>\n'
      '<p class="lede">Solar not producing, an inverter error, or an installer that closed? We diagnose existing solar systems and add batteries across the Salt Lake Valley. The first evaluation is free.</p>\n'
      '<p class="meta">Solar Review &middot; Updated October 2026</p>\n<h2>Cities we serve</h2>\n<ul id="ut-city-list">%s</ul>\n'
      '<h2>How it works</h2>\n<p>Send photos of your inverter and a recent utility bill. We tell you what we see, then arrange a technician visit or a guided video evaluation if it makes sense. Nothing is sold before you know what is wrong.</p>\n'
      '<h2>Guides</h2>\n<p><a href="/solar-panels-not-producing">Solar panels not producing</a> &middot; <a href="/solar-inverter-replacement">Inverter replacement</a> &middot; <a href="/solar-monitoring-offline">Monitoring offline</a> &middot; <a href="/add-powerwall-to-existing-solar">Add a Powerwall</a> &middot; <a href="/solar-system-health-check">Free health check</a></p>\n%s\n'
      '<h2>Common questions</h2>\n%s\n</article>') % (lst, CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in faqs))
    svc = json.dumps({"@context":"https://schema.org","@type":"Service","name":"Solar repair and diagnostics in the Salt Lake Valley","provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
      "areaServed":{"@type":"AdministrativeArea","name":"Salt Lake County, Utah"},"url":SITE+"/utah-solar-repair"})
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]})
    return 'utah-solar-repair', page('Solar Panel Repair & Inverter Diagnostics in the Salt Lake Valley, UT | Solar Review',
      'Solar not producing in Utah? Free evaluation, inverter and panel diagnostics and Powerwall battery retrofits across the Salt Lake Valley, even if your installer closed.', SITE+'/utah-solar-repair', [svc, faqld], body)

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
if 'id="ut-link"' not in hub:
    hub = hub.replace('<h2>Why homeowners call us</h2>', '<p id="ut-link">Also serving the <a href="/utah-solar-repair">Salt Lake Valley, Utah</a>.</p>\n<h2>Why homeowners call us</h2>', 1)
    open('southern-california-solar-repair.html', 'w', encoding='utf-8').write(hub)
print('wrote', len(pages), 'Utah pages')
