#!/usr/bin/env python3
"""Southern Utah (St. George area) pages: hub + 5 city pages. Same template as build-utah-pages.py.
Facts kept conservative: no office claims, no prices, utility wording hedged (many Washington County towns run city or co-op power,
so Rocky Mountain Power programs such as Wattsmart may not apply -- we say 'we confirm from your bill').
Run after build-county-pages / build-utah-pages: python3 scripts/build-southern-utah-pages.py"""
import importlib.util, json
spec = importlib.util.spec_from_file_location('cp', 'scripts/build-county-pages.py'); cp = importlib.util.module_from_spec(spec); spec.loader.exec_module(cp)
esc, page, CTA, SITE = cp.esc, cp.page, cp.CTA, cp.SITE

UTIL = ('Electric service in the St. George area is split. Some homes are on a <strong>city-run electric utility</strong>, some on a local co-op, and some on <strong>Rocky Mountain Power</strong>. '
        'Which one you are on changes what exported solar power is worth and which battery programs you can join. We confirm it from your bill before recommending anything.')
HEAT = ('Southern Utah has some of the strongest sun and hottest summers in the state. Heat is hard on inverters and connectors, dust and monsoon storms add wear, and a fault can hide because production is high most of the year. '
        'A system that quietly loses output in July is easy to miss until the bill arrives.')
CITIES = [
 ('st-george','St. George',['washington','santa-clara','ivins','hurricane']),
 ('washington','Washington',['st-george','hurricane','santa-clara']),
 ('hurricane','Hurricane',['washington','st-george','ivins']),
 ('ivins','Ivins',['santa-clara','st-george','washington']),
 ('santa-clara','Santa Clara',['ivins','st-george','washington']),
]
names = {c[0]: c[1] for c in CITIES}
FAQ = lambda n: [
  ('Do you serve %s?' % n, 'Yes. We start with your photos and utility bill and do the first evaluation by guided video, so you do not need to wait for a visit. If hands-on work is needed, we arrange it through a licensed Utah installation partner. The first evaluation is free and there is no obligation.'),
  ('Does it matter who installed my system?', 'No. We work on systems from any installer, including companies that have closed.'),
  ('Is the first evaluation free?', 'Yes. We start with your photos and utility bill, then a guided video evaluation. No obligation.'),
  ('Which utility am I on?', 'It depends on your address. Some St. George area homes are on a city electric utility, some on a co-op and some on Rocky Mountain Power. Your bill says which, and we check it before recommending a battery or upgrade.')]

def city_html(c):
    slug, name, near = c; s = 'solar-repair-%s-ut' % slug
    title = 'Solar Panel Repair & Inverter Diagnostics in %s, UT | Solar Review' % name
    desc = 'Solar not producing in %s, Utah? Free video evaluation, inverter and panel diagnostics and Powerwall battery retrofits, even if your installer closed. Call (619) 777-6527.' % name
    faqs = FAQ(name) + [('What should I send first?', 'A photo of your inverter (including its label), a photo of any error or fault light, and your most recent utility bill. With those we can usually tell you what we think is wrong before anyone visits.')]
    near_links = ''.join('<a href="/solar-repair-%s-ut">%s</a>' % (n, names[n]) for n in near if n in names)
    body = ('<article class="wrap">\n<div class="eyebrow">%s, Utah</div>\n<h1>Solar Panel Repair and Inverter Diagnostics in %s, Utah</h1>\n'
      '<p class="lede">If your solar system in %s has stopped producing, shows an inverter error, or was installed by a company that is gone, we diagnose it and tell you plainly what is wrong. The first evaluation is free.</p>\n'
      '<p class="meta">Solar Review &middot; Southern Utah &middot; Updated November 2026</p>\n<h2>What we do in %s</h2>\n'
      '<p>We diagnose and repair existing solar systems (inverters, panels, optimizers, wiring, monitoring) and add Tesla Powerwall batteries to existing systems. You do not need to have bought your system from us. We start with a guided video evaluation, so you get answers without waiting for an appointment.</p>\n'
      '<h2>Your utility decides what upgrades are worth</h2>\n<p>%s</p>\n<h2>What is hard on solar here</h2>\n<p>%s</p>\n'
      '<p>Common problems we fix: <a href="/solar-panels-not-producing">solar panels not producing</a>, <a href="/solar-inverter-replacement">inverter replacement</a>, <a href="/solar-monitoring-offline">monitoring offline</a>, and <a href="/add-powerwall-to-existing-solar">adding a Powerwall to existing solar</a>.</p>\n%s\n'
      '<h2>Common questions</h2>\n%s\n<div class="related"><h3>Nearby</h3>%s<a href="/southern-utah-solar-repair">All of Southern Utah</a></div>\n</article>') % (
      esc(name), esc(name), esc(name), esc(name), UTIL, HEAT, CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in faqs), near_links)
    svc = json.dumps({"@context":"https://schema.org","@type":"Service","name":"Solar panel repair and inverter diagnostics in "+name+", Utah",
      "provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
      "serviceType":["Solar system diagnostics","Solar inverter repair","Tesla Powerwall retrofit"],"areaServed":{"@type":"City","name":name+", Utah"},"url":SITE+"/"+s})
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]})
    bc = json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},{"@type":"ListItem","position":2,"name":"Southern Utah","item":SITE+"/southern-utah-solar-repair"},{"@type":"ListItem","position":3,"name":name,"item":SITE+"/"+s}]})
    return s, page(title, desc, SITE+'/'+s, [svc, faqld, bc], body)

def hub_html():
    lst = ''.join('<li><a href="/solar-repair-%s-ut">%s</a></li>' % (c[0], c[1]) for c in CITIES)
    faqs = [('Do you serve Southern Utah?', 'Yes, St. George and the nearby cities of Washington, Hurricane, Ivins and Santa Clara. We start with photos and your bill and do the first evaluation by guided video.'), FAQ('Southern Utah')[1]]
    body = ('<article class="wrap">\n<div class="eyebrow">Southern Utah</div>\n<h1>Solar Repair and Inverter Diagnostics in St. George and Southern Utah</h1>\n'
      '<p class="lede">Solar not producing, an inverter error, or an installer that closed? We diagnose existing solar systems and add batteries across the St. George area. The first evaluation is free and starts by video.</p>\n'
      '<p class="meta">Solar Review &middot; Updated November 2026</p>\n<h2>Cities we serve</h2>\n<ul id="sut-city-list">%s</ul>\n'
      '<h2>How it works</h2>\n<p>Send photos of your inverter and a recent utility bill. We tell you what we see, then do a guided video evaluation. If hands-on work is needed we arrange it through a licensed Utah installation partner. Nothing is sold before you know what is wrong.</p>\n'
      '<h2>Guides</h2>\n<p><a href="/solar-panels-not-producing">Solar panels not producing</a> &middot; <a href="/solar-inverter-replacement">Inverter replacement</a> &middot; <a href="/solar-monitoring-offline">Monitoring offline</a> &middot; <a href="/add-powerwall-to-existing-solar">Add a Powerwall</a></p>\n%s\n'
      '<h2>Common questions</h2>\n%s\n<div class="related"><h3>Also serving</h3><a href="/utah-solar-repair">Salt Lake City, UT</a></div>\n</article>') % (lst, CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in faqs))
    svc = json.dumps({"@context":"https://schema.org","@type":"Service","name":"Solar repair and diagnostics in Southern Utah","provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
      "areaServed":{"@type":"AdministrativeArea","name":"Washington County, Utah"},"url":SITE+"/southern-utah-solar-repair"})
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]})
    return 'southern-utah-solar-repair', page('Solar Panel Repair & Inverter Diagnostics in St. George, UT | Solar Review',
      'Solar not producing in St. George or Southern Utah? Free video evaluation, inverter and panel diagnostics and Powerwall battery retrofits, even if your installer closed.', SITE+'/southern-utah-solar-repair', [svc, faqld], body)

pages = [hub_html()] + [city_html(c) for c in CITIES]
sm = open('sitemap.xml').read(); nt = open('netlify.toml').read()
for s, h in pages:
    open(s + '.html', 'w', encoding='utf-8').write(h)
    if '/' + s + '<' not in sm:
        sm = sm.replace('</urlset>', '  <url>\n    <loc>https://fixmy.energy/%s</loc>\n    <lastmod>2026-11-21</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>' % s)
    if 'from = "/%s"' % s not in nt:
        nt += '\n[[headers]]\n  for = "/%s"\n  [headers.values]\n    Cache-Control = "no-cache, must-revalidate"\n\n[[redirects]]\n  from = "/%s"\n  to = "/%s.html"\n  status = 200\n' % (s, s, s)
open('sitemap.xml','w').write(sm); open('netlify.toml','w').write(nt)
hub = open('utah-solar-repair.html', encoding='utf-8').read()
if 'id="sut-link"' not in hub:
    hub = hub.replace('<h2>How it works</h2>', '<p id="sut-link">Also serving <a href="/southern-utah-solar-repair">St. George and Southern Utah</a>.</p>\n<h2>How it works</h2>', 1)
    open('utah-solar-repair.html', 'w', encoding='utf-8').write(hub)
print('wrote', len(pages), 'Southern Utah pages')
