#!/usr/bin/env python3
"""Generates problem/service landing pages (high-intent searches). Run: python3 scripts/build-service-pages.py
# ORDER MATTERS: each script re-imports build-county-pages.py (which rewrites the hub). Run: county -> service -> city.
Content is practical, no prices, no promised outcomes. Reuses helpers from build-county-pages.py."""
import importlib.util, json, re
spec = importlib.util.spec_from_file_location('cp', 'scripts/build-county-pages.py'); cp = importlib.util.module_from_spec(spec); spec.loader.exec_module(cp)
esc, page, CTA, SITE = cp.esc, cp.page, cp.CTA, cp.SITE

PAGES = [
dict(slug='solar-panels-not-producing', h1='Solar Panels Not Producing Power? Causes and What to Check',
 title='Solar Panels Not Producing Power? Causes & Fixes | Solar Review',
 desc='Solar system making less power or none at all? Check these five things first, learn what the common causes are, and when to call a technician. Free evaluation in Southern California.',
 lede='If your solar system seems to be making less power than it used to, or nothing at all, the cause is usually one of a short list. Some you can check in five minutes. Others need a technician.',
 sections=[
 ('Check these first (safe, no tools)', '<ol><li><strong>Look at the inverter.</strong> A solid green light normally means it is producing. Red, flashing or blank means a fault or no power. Write down any error code or take a photo.</li><li><strong>Check your monitoring app.</strong> If it says offline, the panels may be fine and only the internet link is down. See <a href="/solar-monitoring-offline">monitoring offline</a>.</li><li><strong>Compare to last year.</strong> Open the same month from last year. A big drop on a similarly sunny stretch is a real signal.</li><li><strong>Look for new shade.</strong> Tree growth, a new building or a satellite dish can shade part of an array.</li><li><strong>Look at your bill.</strong> If your bill rose with no change in how you use power, your system may be making less than you think.</li></ol><p>Do not open the inverter, panel boxes or wiring. Switches on the outside are fine to read, but leave the rest to a licensed technician.</p>'),
 ('Common causes', '<ul><li><strong>Inverter fault or failure.</strong> The most common cause. String inverters often fail in the 10 to 15 year range, and heat shortens that.</li><li><strong>One failed unit.</strong> On systems with microinverters or optimizers, one bad unit cuts output without shutting the system down, so it can go unnoticed for months.</li><li><strong>Tripped breaker or rapid shutdown device.</strong> Power can be lost to the whole array from one switch.</li><li><strong>Ground fault or wiring damage.</strong> Often shows as an isolation or ground-fault error on the inverter.</li><li><strong>Dirty or shaded panels.</strong> Dust, bird droppings and shade lower output but rarely stop it.</li><li><strong>Monitoring only.</strong> The system works but the data link dropped.</li></ul>'),
 ('Why a drop can go unnoticed', '<p>On a sunny day a partly failed system still looks busy. That is why a drop is easy to miss: the roof is making power, just less than it should. The most reliable check is comparing expected output with what your actual bill shows over a full year, not looking at one afternoon.</p>'),
 ('What we do', '<p>We review your photos, inverter model and error codes, and your utility bill, and then tell you plainly what we think is wrong, whether it is covered by a warranty, and what a fix involves. We work on any brand and any installer, including companies that have closed. The first evaluation is free and has no obligation.</p>'),
 ],
 faqs=[('How do I know if my solar panels are working?','Check the inverter light and your monitoring app, and compare this month to the same month last year. A system can look fine on a sunny day and still be making much less than it should.'),
       ('Can solar panels stop working without any warning?','Yes. An inverter fault, one failed microinverter or a tripped switch may not trigger a visible alarm, so a drop can go unnoticed for months.'),
       ('Will my warranty cover it?','It depends on the part and who made it. Many inverters and panels carry long manufacturer warranties even if the installer has closed. We check what applies to your equipment.')]),
dict(slug='solar-inverter-replacement', h1='Solar Inverter Replacement and Repair',
 title='Solar Inverter Replacement & Repair in Southern California | Solar Review',
 desc='Inverter failing or showing an error? Learn the warning signs, when a repair is enough, when replacement makes sense, and how a Powerwall can replace your old inverter.',
 lede='The inverter is the part of a solar system most likely to fail first. Here is how to tell whether yours needs repair or replacement, and what the options are.',
 sections=[
 ('Warning signs', '<ul><li>An error code or red or flashing light on the inverter.</li><li>The inverter display is blank, or it clicks on and off.</li><li>Your monitoring shows zero or very low output on a sunny day.</li><li>Production that falls sharply when it gets hot.</li><li>The unit is more than ten years old and your bill has crept up.</li></ul>'),
 ('Repair or replace?', '<p>Not every fault means a new inverter. A tripped breaker, a loose connector, a communications fault or a single failed microinverter can often be fixed on its own. A replacement makes sense when the unit has failed, repeated faults point to a failing board, or the part is no longer supported. Under warranty, the manufacturer often supplies the replacement unit even if the installer is gone.</p>'),
 ('Typical warranty periods', '<p>String inverters commonly carry a warranty of around ten to twelve years, and some brands offer an extension. Microinverters are often warrantied much longer, and panels longer still. Terms differ by model and year, so we check your serial numbers rather than assume.</p>'),
 ('A Powerwall can replace your old inverter', '<p>The Tesla Powerwall 3 has a built-in solar inverter. On many systems, existing panel strings can connect straight to the Powerwall 3, so you may not need to buy a separate inverter at all and you gain backup power in the same project. Whether that fits depends on your panels, string layout and rate plan, and we confirm it after we look at your system.</p>'),
 ('Brands we work on', '<p>SolarEdge, Enphase, SMA, SunPower, Fronius and others. See our guides on <a href="/blog/solaredge-inverter-error-codes">SolarEdge error codes</a> and <a href="/blog/enphase-microinverter-troubleshooting">Enphase troubleshooting</a>.</p>'),
 ],
 faqs=[('How long do solar inverters last?','String inverters often last roughly ten to fifteen years, with heat shortening that. Microinverters usually last longer.'),
       ('Does an inverter replacement need a permit?','Often yes. We handle the paperwork and the utility steps with the work.'),
       ('Can I replace the inverter without replacing the panels?','Usually yes. The panels often keep working for decades. We check that the new inverter matches your panel setup.')]),
dict(slug='solar-monitoring-offline', h1='Solar Monitoring Offline? How to Reconnect and What It Means',
 title='Solar Monitoring Offline? How to Fix It | Solar Review',
 desc='Enphase, SolarEdge or SunPower app shows your system offline? Learn the common causes, what to try first, and when offline hides a real production problem.',
 lede='When your solar app says offline, the first question is whether the system stopped making power or only stopped reporting. They are different problems with different fixes.',
 sections=[
 ('Try these first', '<ol><li>Check your home internet and Wi-Fi. A new router, a changed Wi-Fi password or a power outage is the most common cause.</li><li>Look at the inverter or gateway light. Many units show a Wi-Fi or network status light.</li><li>Restart your router, then wait about 15 to 30 minutes for the equipment to reconnect.</li><li>Check your utility bill or meter to see if power is still being produced and exported.</li></ol>'),
 ('Offline versus not producing', '<p>Many homeowners learn their system was down only after the app stops updating. If the app has been offline for weeks and your bill has gone up, assume the system may not be producing until a technician confirms it. If the app is offline but your bill looks normal, it is usually only the data link.</p>'),
 ('Why installers closing matters', '<p>Some monitoring portals are tied to the installer account. If your installer closed, you may need the account moved to you, or a new gateway set up. We help with that, and we can read your production from your utility bill data meanwhile.</p>'),
 ('When to call', '<p>If your system has been offline for more than a few days and the steps above did not help, send us photos of the inverter and gateway and your last bill. We will tell you what we think is happening.</p>'),
 ],
 faqs=[('Why did my solar app go offline?','Most often a changed router, Wi-Fi password or internet outage. It can also mean the inverter or gateway has a fault.'),
       ('Is my solar still working if the app is offline?','Sometimes yes. The app may only have lost its connection. Check your bill and the inverter light to tell the difference.'),
       ('My installer closed. Can I still get monitoring?','Often yes. The account can usually be moved to you or reset. We can help.')]),
dict(slug='add-powerwall-to-existing-solar', h1='Add a Tesla Powerwall to Existing Solar',
 title='Add a Powerwall to Existing Solar in Southern California | Solar Review',
 desc='Already have solar panels? Learn how a Tesla Powerwall 3 works with existing panels, how net metering affects it, and how we check whether it makes sense for your bill.',
 lede='If you already have solar, adding a battery can give you backup power and shift more of your solar use into the evening. Whether it pays off depends on your rate plan and how you use power.',
 sections=[
 ('How it works with existing panels', '<p>The Tesla Powerwall 3 stores 13.5 kWh and has a built-in solar inverter, so on many systems your existing panels connect to it directly. Older systems with their own inverter can also be paired with a battery. We check your equipment before recommending which approach fits.</p>'),
 ('Your net metering version matters', '<p>Homes on older net metering (NEM 1.0 or 2.0) generally keep that status when a battery is added, which is a big reason to look at storage rather than a new solar contract. Adding more panels can change that, so we check the rules before any expansion. Newer net billing plans value evening power more, which is where a battery helps most.</p>'),
 ('Possible incentives', '<p>Some utilities and community choice programs offer battery incentives. In San Diego, the community choice program offers storage incentives for eligible homes. Eligibility depends on your address, usage and program rules, and we confirm it before you decide.</p>'),
 ('What we check first', '<ul><li>Your utility bill and rate plan.</li><li>Your solar production history and inverter.</li><li>Your electrical panel and where a battery can go.</li><li>Your net metering status and what it allows.</li></ul>'),
 ('Not everyone needs one', '<p>If your bill is already very low and you rarely lose power, a battery may not be worth it, and we will say so. The free evaluation tells you where you stand.</p>'),
 ],
 faqs=[('Can I add a Powerwall to solar panels I already have?','In most cases yes. We check your inverter, panel and rate plan to choose the right setup.'),
       ('Will adding a battery change my net metering?','Adding a battery generally does not change it, but adding panels can. We check the rules before any expansion.'),
       ('How big is a Powerwall 3?','It stores 13.5 kWh. Some homes use more than one.')]),
dict(slug='solar-system-health-check', h1='Free Solar System Health Check',
 title='Free Solar System Health Check | Solar Review',
 desc='A free check of your existing solar system: production, inverter, warranty, net metering and battery options. Photos and a utility bill are all we need to start.',
 lede='Most solar systems older than five years have never had a real checkup. A health check compares what your system should make with what it actually makes, and finds problems before they cost you.',
 sections=[
 ('What we look at', '<ul><li>Your inverter model, age and any error codes.</li><li>Production compared with what your bill shows.</li><li>Your net metering version and when it ends.</li><li>Warranty coverage on your equipment, even if your installer closed.</li><li>Whether a battery or other upgrade makes sense for your usage.</li></ul>'),
 ('What you send us', '<p>Photos of your inverter and its label, a photo of your electric meter, and a recent utility bill. If you can share your 15-minute usage data from your utility, that helps us see exactly when your system stopped or dropped, but it is optional.</p>'),
 ('What you get back', '<p>A plain-language summary: what is working, what is not, what it costs you, and your options. If a technician visit or a guided video evaluation is the next step, we tell you why. There is no obligation, and we do not sell you something you do not need.</p>'),
 ('Who it is for', '<p>Anyone with solar who is not sure it is working as it should, especially if your installer closed, your bill went up, or the system is over ten years old.</p>'),
 ],
 faqs=[('Is the health check really free?','Yes. We start with your photos and bill, then a technician visit or guided video evaluation where it makes sense, with no obligation.'),
       ('Do I have to be home?','For a technician visit, an adult should be there. A guided video evaluation can be done from your phone.'),
       ('Do you check systems from any installer?','Yes, any brand and any installer, including companies that have closed.')]),
]

def html_for(d):
    s = d['slug']
    secs = ''.join('<h2>%s</h2>\n%s\n' % (esc(h), body) for h, body in d['sections'])
    faq = ''.join('<div class="faq-q">%s</div><p>%s</p>' % (esc(q), esc(a)) for q, a in d['faqs'])
    others = ''.join('<a href="/%s">%s</a>' % (o['slug'], o['h1'].split(':')[0].split('?')[0]) for o in PAGES if o is not d)
    body = ('<article class="wrap">\n<div class="eyebrow">Southern California</div>\n<h1>%s</h1>\n<p class="lede">%s</p>\n<p class="meta">Solar Review &middot; Updated October 2026</p>\n%s%s\n'
            '<h2>Common questions</h2>\n%s\n<div class="related"><h3>Related</h3>%s<a href="/southern-california-solar-repair">All of Southern California</a></div>\n</article>') % (
            esc(d['h1']), esc(d['lede']), secs, CTA, faq, others)
    svc = json.dumps({"@context":"https://schema.org","@type":"Service","name":d['h1'],"provider":{"@type":"Organization","name":"Solar Review","url":SITE,"telephone":"+1-619-777-6527"},
        "areaServed":[{"@type":"AdministrativeArea","name":n+", California"} for n in ["San Diego County","Los Angeles County","Orange County","Riverside County","San Bernardino County"]],"url":SITE+"/"+s})
    faqld = json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in d['faqs']]})
    bc = json.dumps({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},{"@type":"ListItem","position":2,"name":d['h1'],"item":SITE+"/"+s}]})
    return page(d['title'], d['desc'], SITE+'/'+s, [svc, faqld, bc], body)

sm = open('sitemap.xml').read(); nt = open('netlify.toml').read()
for d in PAGES:
    s = d['slug']; open(s + '.html', 'w', encoding='utf-8').write(html_for(d))
    if '/' + s + '<' not in sm:
        sm = sm.replace('</urlset>', '  <url>\n    <loc>https://fixmy.energy/%s</loc>\n    <lastmod>2026-10-29</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>' % s)
    if 'from = "/%s"' % s not in nt:
        nt += '\n[[headers]]\n  for = "/%s"\n  [headers.values]\n    Cache-Control = "no-cache, must-revalidate"\n\n[[redirects]]\n  from = "/%s"\n  to = "/%s.html"\n  status = 200\n' % (s, s, s)
open('sitemap.xml','w').write(sm); open('netlify.toml','w').write(nt)
# hub links to the guides
hub = open('southern-california-solar-repair.html', encoding='utf-8').read()
g = '<h2>Solar problems we fix</h2>\n<ul id="svc-list">' + ''.join('<li><a href="/%s">%s</a></li>' % (d['slug'], esc(d['h1'])) for d in PAGES) + '</ul>\n'
if 'id="svc-list"' in hub: hub = re.sub(r'<h2>Solar problems we fix</h2>\s*<ul id="svc-list">.*?</ul>\n?', lambda m: g, hub, count=1, flags=re.S)
else: hub = hub.replace('<h2>Why homeowners call us</h2>', g + '<h2>Why homeowners call us</h2>', 1)
open('southern-california-solar-repair.html', 'w', encoding='utf-8').write(hub)
print('wrote', len(PAGES), 'service pages')
