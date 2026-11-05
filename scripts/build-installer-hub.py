#!/usr/bin/env python3
"""Builds /defunct-solar-installers (hub listing every closed installer we cover).
Run: python3 scripts/build-installer-hub.py   Facts mirror CLAUDE.md's Defunct Solar Installer Database."""
import importlib.util, json, html
spec = importlib.util.spec_from_file_location('bcp', 'scripts/build-county-pages.py'); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
# (name, what happened, page-or-None)
L = [
 ('SunPower','Chapter 11, August 2024; assets sold','sunpower'),
 ('Titan Solar','Chapter 7 liquidation, June 2024','titan'),
 ('Sunnova','Chapter 11, June 2025','sunnova'),
 ('Freedom Forever','Chapter 11 April 2026, converted to Chapter 7 liquidation August 2026','freedom-forever'),
 ('Mosaic (solar lender)','Chapter 11, June 2025 (a lender, not an installer)','mosaic'),
 ('Sullivan Solar Power','Shut down late 2021','sullivan'),
 ('Petersen-Dean','Chapter 11, June 2020','petersen-dean'),
 ('Sungevity','Chapter 11, March 2017','sungevity'),
 ('Simply Solar','Chapter 11, July 2026','simply-solar'),
 ('Solare Energy','Closed in 2026 (San Diego County installer since 1989)','solare-energy'),
 ('Lumio','Chapter 11, March 2024','lumio'),
 ('Sunworks / Solcius','Chapter 7, February 2024','sunworks'),
 ('PosiGen','Chapter 11, November 2025','posigen'),
 ('Infinity Energy','Ceased operations 2023',None),
 ('Suntuity Renewables','Shut down around 2024',None),
 ('ADT Solar / SunPro Solar','Shut down January 2023',None),
 ('Pink Energy','Chapter 7, October 2022',None),
 ('Harness Power','Shut down spring 2023 (Pasadena)',None),
 ('Vision Solar','Chapter 7, July 2021',None),
 ('American Solar Direct','Shut down 2019',None),
 ('RGS Energy (Real Goods Solar)','Delisted and defunct, 2019',None),
 ('Verengo','Shut down 2014',None),
 ('OneRoof Energy','Shut down 2016',None),
 ('Kota Energy','Shut down around 2022',None),
]
def li(n,w,p):
    name = '<a href="/%s">%s</a>' % (p, html.escape(n)) if p else '<strong>%s</strong>' % html.escape(n)
    return '<li>%s &mdash; %s</li>' % (name, html.escape(w))
items = ''.join(li(*x) for x in L)
faqs = [('My solar installer went out of business. What happens to my warranty?','Workmanship warranties generally end with the installer, but equipment warranties from the panel, inverter and battery manufacturers usually remain. An independent inspection tells you what is still covered.'),
        ('Who services my solar system now?','Solar Review services systems from any installer, including the companies listed on this page. We start with your photos and utility bill, then schedule a technician visit or a guided video evaluation.'),
        ('Is my installer on this list?','If not, it does not matter. We work on any installer\'s system. This list covers the companies we hear about most.')]
ld_faq = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]})
ld_bc = json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":b.SITE+"/"},{"@type":"ListItem","position":2,"name":"Closed solar installers","item":b.SITE+"/defunct-solar-installers"}]})
body = ('<article class="wrap">\n<div class="eyebrow">Closed solar installers</div>\n<h1>Solar Installers That Went Out of Business: Who Services Your System Now</h1>\n'
 '<p class="lede">If the company that installed your solar went bankrupt or shut down, your system still needs care. Here are the California installers that have closed, and where to get help.</p>\n'
 '<p class="meta">Solar Review &middot; Updated November 2026</p>\n<h2>Closed or bankrupt solar installers</h2>\n<ul>%s</ul>\n%s\n<h2>Common questions</h2>\n%s\n</article>') % (
 items, b.CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (b.esc(q), b.esc(a)) for q, a in faqs))
open('defunct-solar-installers.html','w',encoding='utf-8').write(b.page('Solar Installers That Went Out of Business | Who Services Your System | Solar Review',
 'List of California solar installers that went bankrupt or closed, including SunPower, Titan, Sunnova and Freedom Forever, and where to get your system serviced.',
 b.SITE+'/defunct-solar-installers',[ld_faq,ld_bc],body))
print('ok')
