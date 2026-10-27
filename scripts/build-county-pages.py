#!/usr/bin/env python3
"""Regenerates the Southern California county landing pages + hub from the data below.
Run: python3 scripts/build-county-pages.py   (writes *.html at the repo root).
Every fact here is deliberately conservative; verify before adding more. No fake offices."""
import json, re, html

HEAD_SRC = open('blog/vitl-power.html', encoding='utf-8').read()
# Reuse the exact tracking <script> blocks (GTM / GA4 / Meta Pixel), style block, nav and footer from an existing page.
tracking = re.findall(r'<script>\(function\(w,d,s,l,i\).*?</script>\n<script async src="https://www.googletagmanager.com.*?</script>\n<script>window.dataLayer.*?</script>\n<script>!function\(f,b,e,v,n,t,s\).*?</script>', HEAD_SRC, re.S)
tracking = tracking[0] if tracking else ''
fonts = '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>'
style = re.search(r'<style>.*?</style>', HEAD_SRC, re.S).group(0)
nav = re.search(r'<nav class="site-nav">.*?</nav>', HEAD_SRC, re.S).group(0)
footer = re.search(r'<footer>.*?</footer>', HEAD_SRC, re.S).group(0)
footer = footer.replace('<a href="#">Privacy Policy</a>', '<a href="/privacy">Privacy Policy</a>').replace('<a href="#">Terms of Service</a>', '<a href="/terms">Terms of Service</a>')
SITE = 'https://fixmy.energy'
PHONE = '(619) 777-6527'

COUNTIES = [
 dict(slug='solar-repair-los-angeles-county', name='Los Angeles County', short='Los Angeles',
  title='Solar Panel Repair & Inverter Diagnostics in Los Angeles County | Solar Review',
  desc='Solar not producing in Los Angeles County? Free evaluation, inverter and panel diagnostics, and Powerwall battery retrofits for SCE and LADWP homes, even if your installer closed.',
  eyebrow='Los Angeles County',
  h1='Solar Panel Repair and Inverter Diagnostics in Los Angeles County',
  lede='If your solar system in Los Angeles County has stopped producing, throws an inverter error, or the company that installed it is gone, we diagnose it and tell you plainly what is wrong. The first evaluation is free, and it does not matter who installed the system.',
  cities='Los Angeles, Pasadena, Glendale, Burbank, Long Beach, Torrance, Santa Clarita, Lancaster, Palmdale, Pomona, West Covina, Whittier, Downey, Norwalk, Van Nuys, Encino, and the surrounding communities',
  utilities=('Los Angeles County homes are served by more than one electric utility, and that changes what your solar is worth. Most of the county is served by <strong>Southern California Edison (SCE)</strong>. The City of Los Angeles is served by <strong>LADWP</strong>, and a few cities, including Pasadena, Glendale and Burbank, run their own municipal utilities. Many SCE-area cities buy power through a community choice program such as <strong>Clean Power Alliance</strong>.',
             'Export credits depend on which utility you are on and when your system was approved. SCE customers who applied after April 2023 are on net billing, where exported power earns far less than the retail rate. Older systems may still sit on an earlier net metering schedule, which is worth protecting. We check your bill before we recommend anything, because adding panels or changing equipment can change which rules apply.'),
  local=('Los Angeles County covers coastal neighborhoods, the San Fernando and San Gabriel valleys, and the high desert in Lancaster and Palmdale. Hot inland summers push inverters hard, and heat is a common thread in early inverter failures. In the high desert, dust and wind-blown debris can quietly cut production between cleanings. Wildfire smoke and ash can also depress output for days or weeks after a fire, then clear. We look at all of these before blaming the equipment.',),
  installers='Los Angeles County has seen a lot of installer turnover. SunPower, Titan Solar, Sunnova and Harness Power (based in Pasadena) all sold and installed systems here and are no longer operating as they were. If one of them installed your system, the warranty paperwork may still be valid, but there is often nobody left to honor service calls. We can read the system, tell you what is covered, and fix what is not.',
  faqs=[('Do you work on systems installed by a company that went out of business?','Yes. That is a large part of our work. We evaluate the system as it stands, identify the fault, and explain what the original equipment warranty still covers.'),
        ('Do you service homes on LADWP as well as SCE?','Yes. The repair and diagnostic work is the same. The difference is in export rules and rates, which we check against your bill before recommending upgrades.'),
        ('My system seems fine but my bill is high. Can you check?','Yes. Production can drop slowly without any alarm. We compare what the system should produce with what it actually produces, using your monitoring data and your bill.'),
        ('Can you add a battery to an existing system in Los Angeles County?','Often yes. A Tesla Powerwall retrofit can be added to many existing systems. Whether it also saves money depends on your utility and your rate plan, and we tell you that before you decide.')]),
 dict(slug='solar-repair-orange-county', name='Orange County', short='Orange County',
  title='Solar Panel Repair & Inverter Diagnostics in Orange County, CA | Solar Review',
  desc='Orange County solar not producing or installer gone? Free evaluation, inverter and panel diagnostics, and battery retrofits for SCE, SDG&E and Anaheim homes.',
  eyebrow='Orange County',
  h1='Solar Panel Repair and Inverter Diagnostics in Orange County',
  lede='When solar on an Orange County home underperforms, the cause is usually an inverter, a string, or a communication fault that monitoring does not flag clearly. We find it, explain it, and fix it, whoever installed the system.',
  cities='Anaheim, Santa Ana, Irvine, Huntington Beach, Fullerton, Orange, Garden Grove, Costa Mesa, Mission Viejo, Lake Forest, Tustin, Yorba Linda, San Clemente, and the surrounding communities',
  utilities=('Orange County is a patchwork. Most homes are on <strong>Southern California Edison (SCE)</strong>. The City of Anaheim is served by <strong>Anaheim Public Utilities</strong>. Parts of south Orange County, such as San Clemente, are served by <strong>San Diego Gas &amp; Electric (SDG&amp;E)</strong>. Several cities, including Irvine, Fullerton, Buena Park and Huntington Beach, buy power through <strong>OC Power Authority</strong>, a community choice program.',
             'Which utility and generation provider you have determines your export credits and rates. We read your bill first, since a battery or an expansion makes sense under some of these setups and not others.'),
  local=('Coastal Orange County has salt air and marine layer, which can mean cooler, lower-output mornings but gentler operating temperatures. Inland cities such as Yorba Linda and Anaheim Hills run hotter, and heat stress shows up in inverters and connectors. Many Orange County homes have older tile roofs, so any repair or panel removal needs to be done without damaging the roof underneath.',),
  installers='Orange County was home base for several installers that have since closed or restructured. Solcius, headquartered in Santa Ana, filed Chapter 7 in 2024. SunPower, Titan Solar and Sunnova also installed many systems here. If your original installer is gone, you still have equipment that likely carries a manufacturer warranty. The problem is usually having someone to file the claim and do the work, which is what we do.',
  faqs=[('My installer was Solcius or SunPower. Who services my system now?','We can. We evaluate the system, check what the manufacturer warranty still covers, and handle the repair, even though the company that sold it is gone.'),
        ('I am in San Clemente. Do you work on SDG&amp;E homes?'.replace('&amp;','&'),'Yes. We serve homes on SCE, SDG&E and Anaheim Public Utilities. The repair work is the same; export credits and rates differ, and we check your bill.'),
        ('Is the evaluation really free?','Yes. The first evaluation is free. If it turns up a problem that needs a paid diagnostic or repair, we explain what and why before anything is scheduled.'),
        ('Can a battery help during outages?','A battery with backup capability can keep selected circuits on during an outage. We look at your panel and your loads first, because what it can run depends on your home.')]),
 dict(slug='solar-repair-riverside-county', name='Riverside County', short='Riverside County',
  title='Solar Panel Repair & Inverter Diagnostics in Riverside County, CA | Solar Review',
  desc='Riverside County solar underperforming or installer closed? Free evaluation, heat-related inverter diagnostics, and battery retrofits across Riverside, Temecula, Palm Springs and the Coachella Valley.',
  eyebrow='Riverside County',
  h1='Solar Panel Repair and Inverter Diagnostics in Riverside County',
  lede='Riverside County is hard on solar equipment: long hot summers, dust, and a lot of systems installed during the boom years by companies that have since closed. We diagnose what is actually wrong and tell you what it will take to fix.',
  cities='Riverside, Corona, Moreno Valley, Murrieta, Temecula, Menifee, Hemet, Eastvale, Norco, Palm Springs, Palm Desert, Indio, Cathedral City, and the surrounding communities',
  utilities=('Most of Riverside County is served by <strong>Southern California Edison (SCE)</strong>. Several cities run their own electric utilities, including Riverside (<strong>Riverside Public Utilities</strong>), Corona and Moreno Valley, and parts of the Coachella Valley buy power through <strong>Desert Community Energy</strong>, a community choice program.',
             'These differences affect export credits and rates. Systems approved before April 2023 on SCE may still be on an earlier net metering schedule, so we check your bill and approval date before suggesting changes that could alter your rate rules.'),
  local=('Sustained heat is the defining condition. Inverters and power optimizers lose efficiency and live shorter lives when they run hot for months, and failures often cluster in the first summer heat wave after a mild spring. In the Coachella Valley and the Inland Empire, dust and fine soil settle on panels and cut output between rains. A system that looks fine on the app can still be losing a meaningful share of what it should make, which we check against what your roof should produce.',),
  installers='Riverside County had heavy door-to-door solar sales through the 2010s and early 2020s. Simply Solar, based in Rancho Cucamonga, filed Chapter 11 in July 2026 and served this region. SunPower, Titan Solar and Sunnova also installed many systems here. If one of those installed yours, the warranty may still apply, but a claim needs someone to file it and do the labor.',
  faqs=[('Can heat really kill an inverter?','Heat shortens inverter life and can trigger faults and shutdowns. It is one of several causes we check, along with failed strings, wiring and communication problems.'),
        ('Do you serve Palm Springs and the Coachella Valley?','Yes. We serve homeowners across Riverside County, including the Coachella Valley. Tell us your address when you book and we will confirm the best way to start.'),
        ('My installer was Simply Solar. Now what?','We can evaluate the system, find any fault, and explain what the manufacturer warranty still covers. You do not need the original installer.'),
        ('Will adding panels or a battery change my utility rules?','It can. Expanding a system can move it onto newer rules, while adding a battery generally keeps your existing arrangement. We confirm with your bill before you commit.')]),
 dict(slug='solar-repair-san-bernardino-county', name='San Bernardino County', short='San Bernardino County',
  title='Solar Panel Repair & Inverter Diagnostics in San Bernardino County, CA | Solar Review',
  desc='San Bernardino County solar not working or installer gone? Free evaluation, inverter diagnostics and battery retrofits in Rancho Cucamonga, Fontana, Ontario, Redlands and the High Desert.',
  eyebrow='San Bernardino County',
  h1='Solar Panel Repair and Inverter Diagnostics in San Bernardino County',
  lede='From Rancho Cucamonga to Victorville, solar systems in San Bernardino County run in some of the harshest conditions in the state. If yours is underperforming or the installer has disappeared, we diagnose it and tell you the real fix.',
  cities='Rancho Cucamonga, Ontario, Fontana, Rialto, San Bernardino, Redlands, Chino, Chino Hills, Upland, Highland, Yucaipa, Victorville, Hesperia, Apple Valley, and the surrounding communities',
  utilities=('Most of San Bernardino County is served by <strong>Southern California Edison (SCE)</strong>. Some communities are served by smaller providers, such as <strong>Bear Valley Electric Service</strong> in the Big Bear area and municipal utilities such as Colton.',
             'Export credits depend on your utility and when your system was approved. SCE customers who applied after April 2023 are on net billing; earlier systems may be on an older schedule worth protecting. We check before recommending any change.'),
  local=('The county spans the Inland Empire valley floor, the foothills, mountain communities and the High Desert. The High Desert brings strong sun, wind, and heavy dust, plus cold winter nights. Mountain communities add snow load and shading from trees. Valley neighborhoods run hot through summer. Each condition points to different failure patterns, so we begin by learning how your system is exposed before we guess at a cause.',),
  installers='Simply Solar, based in Rancho Cucamonga, filed Chapter 11 in July 2026 and sold a large number of systems across the county. SunPower, Titan Solar and Sunnova also installed many systems in the region. If your installer is gone, your equipment warranty may still stand. We help you use it, and we do the work the installer would have.',
  faqs=[('Do you serve the High Desert, like Victorville and Apple Valley?','Yes. We serve homeowners across San Bernardino County, including the High Desert. Give us your address when you book and we will confirm how to start.'),
        ('My installer filed bankruptcy. Is my warranty gone?','Not necessarily. Panel and inverter manufacturers often keep their own warranties. What is usually missing is someone to file the claim and do the repair, which we can handle.'),
        ('Why is my production lower in summer than I expected?','Heat reduces panel and inverter efficiency, and dust adds losses. Some drop is normal, but a large or sudden drop points to a fault we can find.'),
        ('Can I add storage to an older system?','Often yes. A Powerwall retrofit can be added to many existing systems. We confirm fit and rules for your utility first.')]),
 dict(slug='solar-repair-imperial-county', name='Imperial County', short='Imperial County',
  title='Solar Panel Repair & Inverter Diagnostics in Imperial County, CA | Solar Review',
  desc='Imperial County solar underperforming or installer gone? Free evaluation, extreme-heat inverter diagnostics and battery retrofits in Calexico, El Centro, Imperial and Brawley.',
  eyebrow='Imperial County',
  h1='Solar Panel Repair and Inverter Diagnostics in Imperial County',
  lede='Imperial County is one of the hottest places solar equipment runs. If your system in Calexico, El Centro or the Imperial Valley has stopped producing, throws an inverter error, or the company that installed it is gone, we diagnose it and tell you plainly what is wrong.',
  cities='Calexico, El Centro, Imperial, Brawley, Holtville, Calipatria, Westmorland, and the surrounding communities',
  utilities=('Most of Imperial County is served by the <strong>Imperial Irrigation District (IID)</strong>, not Southern California Edison or SDG&E. IID has its own rates and its own rules for exported solar power, so what a system earns here can differ from the rest of Southern California.',
             'We read your IID bill and your system paperwork first, since whether an expansion or a battery makes sense depends on those rules. We do not assume the answer from other utilities applies.'),
  local=('Summer here regularly brings extreme heat, along with dust and strong sun. Sustained heat is hard on inverters, optimizers and wiring, and failures often cluster in the hottest months. A system can lose output slowly without any alarm, so we compare what it should produce with what it actually produces before we guess at a cause.',),
  installers='Many Imperial Valley systems were sold by installers from outside the region, and some of those companies have since closed or stopped answering. If yours is one of them, your equipment warranty may still stand. We help you use it, and we do the work the installer would have.',
  faqs=[('Do you serve Calexico and the Imperial Valley?','Yes. Give us your address when you book and we will confirm how to start. We begin with your photos and utility bill, then arrange a technician visit or a guided video evaluation as fits your situation.'),
        ('My utility is IID. Does that change anything?','Yes. IID has its own rates and export rules, so we check your bill and system approval before recommending a change. The repair and diagnostic work itself is the same.'),
        ('My installer closed. Is my warranty gone?','Not necessarily. Panel and inverter manufacturers often keep their own warranties. What is usually missing is someone to file the claim and do the repair, which we can handle.'),
        ('Why does my system produce less in summer?','Heat reduces panel and inverter efficiency, and dust adds losses. Some drop is normal, but a large or sudden drop points to a fault we can find.')]),
]

def esc(t): return html.escape(t, quote=False)

def jsonld_service(c):
    return json.dumps({"@context":"https://schema.org","@type":"Service","name":"Solar panel repair and inverter diagnostics in "+c['name'],
      "provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
      "serviceType":["Solar system diagnostics","Solar inverter repair","Tesla Powerwall retrofit"],
      "areaServed":{"@type":"AdministrativeArea","name":c['name']+", California"},"url":SITE+"/"+c['slug']})

def jsonld_faq(c):
    return json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":re.sub('<[^>]+>','',a)}} for q,a in c['faqs']]})

def jsonld_bc(c):
    return json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},
      {"@type":"ListItem","position":2,"name":"Southern California","item":SITE+"/southern-california-solar-repair"},
      {"@type":"ListItem","position":3,"name":c['name'],"item":SITE+"/"+c['slug']}]})

def page(title, desc, canonical, schemas, body):
    return ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n'
      '<title>%s</title>\n<meta name="description" content="%s"/>\n<link rel="canonical" href="%s"/>\n'
      '<meta property="og:type" content="website"/>\n<meta property="og:title" content="%s"/>\n<meta property="og:description" content="%s"/>\n<meta property="og:url" content="%s"/>\n'
      '%s\n%s\n%s\n%s\n</head>\n<body>\n%s\n%s\n%s\n</body>\n</html>\n') % (
      esc(title), html.escape(desc, quote=True), canonical, html.escape(title, quote=True), html.escape(desc, quote=True), canonical,
      tracking, fonts, '\n'.join('<script type="application/ld+json">%s</script>' % s for s in schemas), style, nav, body, footer)

OTHERS_NOTE = 'Not sure which area you are in? <a href="/southern-california-solar-repair">See everywhere we serve in Southern California</a>.'
CTA = ('<div class="cta-box"><h3>Get a free evaluation</h3><p>Tell us about your system and we will start with your photos and your bill. Where it makes sense, we will schedule a technician visit or a guided video evaluation. No obligation.</p>'
       '<a href="/book" class="cta-btn">Book a Free Evaluation &rarr;</a> <a href="tel:6197776527" style="margin-left:12px;font-weight:600;">Call %s</a></div>') % PHONE

def county_html(c):
    others = ''.join('<a href="/%s">%s</a>' % (o['slug'], o['name']) for o in COUNTIES if o is not c)
    faq = ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in c['faqs'])
    body = ('<article class="wrap">\n<div class="eyebrow">%s</div>\n<h1>%s</h1>\n<p class="lede">%s</p>\n<p class="meta">Solar Review &middot; Serving all of Southern California &middot; Updated October 2026</p>\n'
      '<h2>What we do</h2>\n<p>We diagnose and repair existing solar systems: inverters, panels, optimizers, wiring and monitoring. We also add Tesla Powerwall batteries to existing systems. The first evaluation is free, and you do not need to have bought your system from us.</p>\n'
      '<p><strong>Areas we serve in %s:</strong> %s.</p>\n'
      '<h2>Your utility decides what upgrades are worth</h2>\n<p>%s</p>\n<p>%s</p>\n'
      '<h2>What is hard on solar here</h2>\n<p>%s</p>\n'
      '<h2>If your installer closed</h2>\n<p>%s</p>\n'
      '<p>See our guides for specific cases: <a href="/sunpower">SunPower</a>, <a href="/titan">Titan Solar</a>, <a href="/sunnova">Sunnova</a>, and <a href="/freedom-forever">Freedom Forever</a>.</p>\n'
      '%s\n<h2>Common questions</h2>\n%s\n'
      '<div class="related"><h3>Other Southern California areas</h3>%s<a href="/southern-california-solar-repair">All of Southern California</a></div>\n<p style="font-size:0.85rem;color:var(--muted);">%s</p>\n</article>') % (
      esc(c['eyebrow']), esc(c['h1']), esc(c['lede']), esc(c['name']), esc(c['cities']), c['utilities'][0], c['utilities'][1], c['local'][0], esc(c['installers']), CTA, faq, others, OTHERS_NOTE)
    return page(c['title'], c['desc'], SITE+'/'+c['slug'], [jsonld_service(c), jsonld_faq(c), jsonld_bc(c)], body)

def hub_html():
    cards = ''.join('<li><a href="/%s"><strong>%s</strong></a> &mdash; %s</li>' % (c['slug'], c['name'], esc(c['cities'].split(', and')[0].split(', ')[0] + ', ' + c['cities'].split(', ')[1] + ' and more')) for c in COUNTIES)
    faqs = [('Do you serve all of Southern California?','Yes. We serve homeowners in Los Angeles, Orange, Riverside, San Bernardino, Imperial and San Diego counties.'),
            ('Do you have an office near me?','Our team is based in San Diego County. For homeowners elsewhere in Southern California we start with your photos and utility bill, and schedule a technician visit or a guided video evaluation as fits your situation.'),
            ('Does it matter who installed my system?','No. We work on systems from any installer, including companies that have closed.')]
    hub = {"@context":"https://schema.org","@type":"Service","name":"Solar repair and diagnostics across Southern California","provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
           "areaServed":[{"@type":"AdministrativeArea","name":n+", California"} for n in ["San Diego County","Los Angeles County","Orange County","Riverside County","San Bernardino County","Imperial County"]],"url":SITE+"/southern-california-solar-repair"}
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]})
    bc = json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},{"@type":"ListItem","position":2,"name":"Southern California","item":SITE+"/southern-california-solar-repair"}]})
    body = ('<article class="wrap">\n<div class="eyebrow">Southern California</div>\n<h1>Solar Repair and Diagnostics Across Southern California</h1>\n'
      '<p class="lede">Solar Review diagnoses and repairs existing solar systems and retrofits Tesla Powerwall batteries for homeowners in Los Angeles, Orange, Riverside, San Bernardino, Imperial and San Diego counties, whoever installed the system.</p>\n'
      '<p class="meta">Solar Review &middot; Updated October 2026</p>\n<h2>Choose your area</h2>\n<ul>%s<li><a href="/"><strong>San Diego County</strong></a> &mdash; our home base</li></ul>\n'
      '<h2>Why homeowners call us</h2>\n<p>Millions of Southern California homes have solar from companies that have since closed, restructured or stopped answering. Production can fall for years without an alarm. We compare what your system should make with what it makes, find the fault, and tell you plainly what it will take to fix, including what the manufacturer warranty still covers.</p>\n%s\n'
      '<h2>Common questions</h2>\n%s\n</article>') % (cards, CTA, ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in faqs))
    return page('Solar Repair & Inverter Diagnostics Across Southern California | Solar Review',
      'Free solar evaluation, inverter and panel diagnostics, and Powerwall battery retrofits in Los Angeles, Orange, Riverside, San Bernardino, Imperial and San Diego counties.',
      SITE+'/southern-california-solar-repair', [json.dumps(hub), faqld, bc], body)

for c in COUNTIES: open(c['slug']+'.html', 'w', encoding='utf-8').write(county_html(c))
open('southern-california-solar-repair.html', 'w', encoding='utf-8').write(hub_html())
print('wrote', len(COUNTIES) + 1, 'pages; tracking block found:', bool(tracking))
