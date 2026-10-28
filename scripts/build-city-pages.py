#!/usr/bin/env python3
"""Generates 20 city landing pages (solar-repair-<city>.html), sitemap, netlify.toml entries.
Run: python3 scripts/build-city-pages.py. Reuses helpers from build-county-pages.py.
Facts are conservative (utility/CCA per this repo's CLAUDE.md); unverified specifics are left out."""
import importlib.util, json, re, html, sys
spec = importlib.util.spec_from_file_location('cp', 'scripts/build-county-pages.py'); cp = importlib.util.module_from_spec(spec); spec.loader.exec_module(cp)
esc, page, CTA, SITE = cp.esc, cp.page, cp.CTA, cp.SITE
SDCP = 'The city is in <strong>San Diego Community Power (SDCP)</strong> territory, with delivery by <strong>SDG&amp;E</strong>. That matters because SDCP runs battery-storage programs, and whether a Powerwall pencils out depends on your rate plan and your solar contract.'
CEA = 'Power here is delivered by <strong>SDG&amp;E</strong> and generated through <strong>Clean Energy Alliance</strong>, the community choice program for several North County cities. Your rate plan and any solar contract still decide what a battery or an inverter repair is worth.'
NOCCA = 'This area is served by <strong>SDG&amp;E</strong> and is not in a community choice program, so your bill and rate plan come straight from SDG&amp;E. That makes the bill itself the first thing we look at.'
SCE = 'Homes here are served by <strong>Southern California Edison (SCE)</strong>. SCE customers on net billing earn less for exported power than older net-metering customers, which is why storage and a healthy inverter matter.'
COAST = 'Coastal air brings salt and marine layer. Connectors and mounting hardware age faster, and cooler, overcast mornings can hide a production problem for months.'
INLAND = 'Inland heat is hard on inverters and connectors. Many systems here run hot every summer, and a fault can sit unnoticed because the roof is still making plenty of power on a sunny day.'
DESERT = 'Extreme summer heat and dust are the main stressors. Inverters derate or shut down when they overheat, and dirty panels lose output quickly.'
# (slug, display name, county slug, county name, utility paragraph, local paragraph, nearby slugs, faq)
CITIES = [
 ('san-diego','San Diego','','San Diego County',SDCP,COAST,['chula-vista','la-mesa','del-mar'],'Is San Diego in SDCP territory?','Most of the City of San Diego is served by San Diego Community Power, with delivery by SDG&E. We check your address when we review your bill.'),
 ('escondido','Escondido','','San Diego County',CEA,INLAND,['san-marcos','vista','poway'],'Does Escondido have a community choice program?','Escondido buys power through Clean Energy Alliance, with delivery by SDG&E. We look at your actual bill to see what that means for you.'),
 ('oceanside','Oceanside','','San Diego County',CEA,COAST,['carlsbad','vista','san-marcos'],'Can you work on a system installed by a company that closed?','Yes. We work on any brand and any installer, including companies that have shut down.'),
 ('carlsbad','Carlsbad','','San Diego County',CEA,COAST,['oceanside','san-marcos','del-mar'],'My Carlsbad system looks fine. Why check it?','A system can lose output for years with no alarm. We compare what it should make with what your bill shows.'),
 ('chula-vista','Chula Vista','','San Diego County',SDCP,COAST,['san-diego','la-mesa','el-cajon'],'Does a battery qualify for incentives in Chula Vista?','Chula Vista is in SDCP territory. Eligibility depends on your system and usage, and we confirm it during the evaluation rather than promise it.'),
 ('el-cajon','El Cajon','','San Diego County',NOCCA,INLAND,['santee','la-mesa','poway'],'Why does summer heat matter for my inverter?','Heat stress is a common cause of inverter faults. We look at error codes and production history to find it.'),
 ('santee','Santee','','San Diego County',NOCCA,INLAND,['el-cajon','la-mesa','poway'],'Do you work on Enphase and SolarEdge systems?','Yes. We work on Enphase, SolarEdge, SMA, SunPower and other brands.'),
 ('la-mesa','La Mesa','','San Diego County',SDCP,INLAND,['el-cajon','san-diego','chula-vista'],'Is La Mesa served by SDCP?','Yes. La Mesa is a San Diego Community Power member city, delivered by SDG&E.'),
 ('san-marcos','San Marcos','','San Diego County',CEA,INLAND,['escondido','vista','carlsbad'],'What does the free evaluation include?','We review your photos and utility bill first, then a technician visit or a guided video evaluation. There is no obligation.'),
 ('vista','Vista','','San Diego County',CEA,INLAND,['oceanside','san-marcos','escondido'],'Can you add a battery to my existing solar?','Usually yes. We check your panel, inverter and rate plan first to see if it makes sense.'),
 ('poway','Poway','','San Diego County',NOCCA,INLAND,['escondido','el-cajon','santee'],'Do I need the original installer?','No. We service systems from any installer.'),
 ('rancho-santa-fe','Rancho Santa Fe','','San Diego County','Rancho Santa Fe homes are served by <strong>SDG&amp;E</strong>. Whether the address is in a community choice program depends on the exact parcel, so we confirm it from your bill instead of assuming.',COAST,['del-mar','carlsbad','escondido'],'Do you work on larger estate systems?','Yes. Bigger systems often have several inverters, so a single failed string can hide behind healthy ones. We check each one.'),
 ('temecula','Temecula','riverside-county','Riverside County',SCE,INLAND,['murrieta','corona','riverside'],'Do you serve Temecula from San Diego?','Yes. We are San Diego-based and start with your photos and bill, then schedule a visit or a guided video evaluation.'),
 ('murrieta','Murrieta','riverside-county','Riverside County',SCE,INLAND,['temecula','corona','riverside'],'Is Murrieta on SCE?','Most of Murrieta is served by Southern California Edison. We confirm from your bill.'),
 ('corona','Corona','riverside-county','Riverside County','Corona has its own city electric utility for part of the city, and Southern California Edison serves other areas. We confirm from your bill which one you are on, because it changes what upgrades are worth.',INLAND,['riverside','temecula','rancho-cucamonga'],'Does my utility change what a repair is worth?','Yes. Your rate plan decides how much a working system or a battery saves.'),
 ('riverside','Riverside','riverside-county','Riverside County','Much of the City of Riverside is served by <strong>Riverside Public Utilities</strong>, the city utility. Other nearby areas are on Southern California Edison. We confirm from your bill.',INLAND,['corona','rancho-cucamonga','temecula'],'My system is from a company that closed. Can you still help?','Yes. We work on any brand and any installer.'),
 ('irvine','Irvine','orange-county','Orange County','Irvine buys power through <strong>OC Power Authority</strong>, a community choice program, with delivery by Southern California Edison. Your plan and solar contract decide what a repair or battery is worth.',COAST,['anaheim','long-beach','riverside'],'Is Irvine in a community choice program?','Irvine is served by OC Power Authority, with delivery by SCE.'),
 ('anaheim','Anaheim','orange-county','Orange County','Anaheim is served by <strong>Anaheim Public Utilities</strong>, the city-owned utility, not Southern California Edison. That changes rates and programs, so we check your bill first.',INLAND,['irvine','long-beach','riverside'],'Is Anaheim on SCE?','No. Anaheim has its own city utility, Anaheim Public Utilities.'),
 ('long-beach','Long Beach','los-angeles-county','Los Angeles County',SCE,COAST,['anaheim','irvine','san-diego'],'Do you serve Long Beach?','Yes. We start with photos and your bill, then arrange a visit or a guided video evaluation.'),
 ('rancho-cucamonga','Rancho Cucamonga','san-bernardino-county','San Bernardino County',SCE,INLAND,['corona','riverside','temecula'],'Why check a system that seems to be working?','Production can drop with no alarm. We compare expected output with what your bill shows.'),
]
# Calexico/El Centro (IID) kept to county page; replace with two more high-volume markets
CITIES = [c for c in CITIES]
names = {c[0]: c[1] for c in CITIES}

def city_html(c):
    slug, name, cty_slug, cty_name, util, local, near, fq, fa = c
    s = 'solar-repair-' + slug
    title = 'Solar Panel Repair & Inverter Diagnostics in %s, CA | Solar Review' % name
    desc = 'Solar not producing in %s? Free evaluation, inverter and panel diagnostics, and Powerwall battery retrofits, even if your installer closed. Call (619) 777-6527.' % name
    faqs = [(fq, fa), ('Does it matter who installed my system?', 'No. We work on systems from any installer, including companies that have closed.'),
            ('Is the first evaluation free?', 'Yes. We start with your photos and utility bill, then a technician visit or a guided video evaluation. No obligation.')]
    near_links = ''.join('<a href="/solar-repair-%s">%s</a>' % (n, names[n]) for n in near if n in names)
    cty_link = ('<a href="/%s">%s</a>' % (cty_slug, cty_name)) if cty_slug else '<a href="/">San Diego County</a>'
    body = ('<article class="wrap">\n<div class="eyebrow">%s, California</div>\n<h1>Solar Panel Repair and Inverter Diagnostics in %s</h1>\n'
      '<p class="lede">If your solar system in %s has stopped producing, shows an inverter error, or was installed by a company that is gone, we diagnose it and tell you plainly what is wrong. The first evaluation is free.</p>\n'
      '<p class="meta">Solar Review &middot; Updated October 2026</p>\n<h2>What we do in %s</h2>\n'
      '<p>We diagnose and repair existing solar systems (inverters, panels, optimizers, wiring, monitoring) and add Tesla Powerwall batteries to existing systems. You do not need to have bought your system from us.</p>\n'
      '<h2>Your utility decides what upgrades are worth</h2>\n<p>%s</p>\n<h2>What is hard on solar here</h2>\n<p>%s</p>\n'
      '<p>See our guides if your installer closed: <a href="/sunpower">SunPower</a>, <a href="/titan">Titan Solar</a>, <a href="/sunnova">Sunnova</a>, <a href="/freedom-forever">Freedom Forever</a>.</p>\n%s\n'
      '<h2>Common questions</h2>\n%s\n<div class="related"><h3>Nearby</h3>%s%s<a href="/southern-california-solar-repair">All of Southern California</a></div>\n</article>') % (
      esc(name), esc(name), esc(name), esc(name), util, local, CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in faqs), near_links, cty_link)
    svc = json.dumps({"@context":"https://schema.org","@type":"Service","name":"Solar panel repair and inverter diagnostics in "+name,
      "provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
      "serviceType":["Solar system diagnostics","Solar inverter repair","Tesla Powerwall retrofit"],
      "areaServed":{"@type":"City","name":name+", California"},"url":SITE+"/"+s})
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":re.sub('<[^>]+>','',a)}} for q,a in faqs]})
    bc = json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},
      {"@type":"ListItem","position":2,"name":"Southern California","item":SITE+"/southern-california-solar-repair"},
      {"@type":"ListItem","position":3,"name":name,"item":SITE+"/"+s}]})
    return s, page(title, desc, SITE+'/'+s, [svc, faqld, bc], body)

pages = [city_html(c) for c in CITIES]
for s, h in pages: open(s + '.html', 'w', encoding='utf-8').write(h)
# sitemap / netlify.toml (idempotent)
sm = open('sitemap.xml').read(); nt = open('netlify.toml').read()
for s, _ in pages:
    if '/' + s + '<' not in sm:
        sm = sm.replace('</urlset>', '  <url>\n    <loc>https://fixmy.energy/%s</loc>\n    <lastmod>2026-10-28</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>' % s)
    if 'from = "/%s"' % s not in nt:
        nt += '\n[[headers]]\n  for = "/%s"\n  [headers.values]\n    Cache-Control = "no-cache, must-revalidate"\n\n[[redirects]]\n  from = "/%s"\n  to = "/%s.html"\n  status = 200\n' % (s, s, s)
open('sitemap.xml','w').write(sm); open('netlify.toml','w').write(nt)
# link the cities from the hub so crawlers can reach them
hub = open('southern-california-solar-repair.html', encoding='utf-8').read()
if 'id="city-list"' not in hub:
    lst = '<h2>Cities we serve</h2>\n<ul id="city-list">' + ''.join('<li><a href="/%s">%s</a></li>' % (s, n) for (s, _), n in zip(pages, [c[1] for c in CITIES])) + '</ul>\n'
    hub = hub.replace('<h2>Why homeowners call us</h2>', lst + '<h2>Why homeowners call us</h2>', 1)
    open('southern-california-solar-repair.html', 'w', encoding='utf-8').write(hub)
print('wrote', len(pages), 'city pages')
