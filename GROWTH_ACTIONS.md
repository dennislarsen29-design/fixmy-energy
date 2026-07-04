# Growth Audit — Dennis's Action Steps

Tracked by Claude's daily accountability check-in. Statuses: ☐ open · ⏳ in progress · ✅ done · ⛔ blocked.
Full audit: https://claude.ai/code/artifact/0c2828a2-6213-43cd-8afd-e13b19c8aff7

## Now — unblocks work already shipped
- ✅ **Attribution migration ran 2026-07-04** (part of the combined block — see below).
- ☐ **Build the bb-followup GHL workflow** — Automations → New → Trigger: Contact Tag Added = `bb-followup` → Action: Send SMS (LC Phone), e.g. "Great meeting you today — here's the link to grab your free evaluation: https://fixmy.energy/book". The portal already fires the tag on every *Interested* / *Callback* knock or dial outcome.
- ☐ **Check GHL partial handling** — confirm no workflow keys off webhook payloads with `status='partial'`; only completed homepage leads hit the webhook-trigger now.
- ⏳ **Search Console** — ✅ verified + sitemap submitted 2026-07-04; ✅ Manual actions: none; ✅ Security issues: none (drop is algorithmic — recovery = fixes already shipped + content plan). Still open: (b) ☰ → *Performance* → stretch to 12–16 months, screenshot the traffic curve for Claude; (c) Settings → Users and permissions → add main Google account as Owner.

## This week
- ✅ **SEO dashboard connected 2026-07-04** — service account created (org key-creation policy overridden then re-locked), granted GSC Full + GA4 Viewer, key stored in Supabase `app_config` (Netlify env var hit AWS's 4KB limit and broke deploys — resolved), test pull returned `ok:true, ga4:true`. GSC data rows start flowing ~1–2 days after property verification; SEO Pulse fills automatically. First "▶ seo" agent run makes sense once a few days of data exist (~Tuesday).
- ✅ **All migrations confirmed 2026-07-04** — attribution columns + `seo_metrics`/`seo_queries` + `app_config` all ran with "Success. No rows returned." Attribution now lands in columns; nightly SEO sync has its tables.
- ☐ **Google Business Profile pass** — name exactly "Solar Review", primary category *Solar energy system service*, add services incl. per-installer items ("SunPower system repair"), seed 8–10 Q&As, set website link to `https://fixmy.energy/?utm_source=gbp&utm_medium=organic`.
- ☐ **Review-ask workflow in GHL** — SMS 3 days post-diagnostic with the direct Google review link. Reply to every review within 48h.
- ☐ **Google Local Services Ads signup** — ads.google.com/localservices. Pay-per-lead, sits above regular ads for "solar repair near me". Start ~$500/mo.

## Next two weeks
- ☐ **Meta campaigns** — retargeting first ($10–15/day, site visitors 60d minus bookers), then upload the Black Box list as a customer audience. Pixel + events are already live on /, /book, and all installer pages.
- ☐ **Dialing numbers** — buy 2–3 local numbers in GHL (~$1.15/mo each), register at freecallerregistry.com, cap ~100–125 calls/day each.
- ☐ **Local PR pitch** — KPBS / Union-Tribune / NBC7: "San Diego's orphaned-solar rescue" (SunPower/Sunnova collapse angle). One placement = backlink + ad-ready social proof.

## Decisions parked
- **Domain** — brand is Solar Review sitewide, but fixmy.energy stays the live domain. If a solarreview domain is acquired (Namecheap), do NOT switch the site to it without a planned 301 migration — changing domains casually would torch the SEO recovery in progress. Owning the name defensively is fine.
- **Internal "FixMy" pipeline label** — the diagnostic/battery business line is still called FixMy inside the portal. Rename only when Dennis picks a product name for that line.
- **Rep agreement DBA text** — says "Solar Review Corp (DBA: FIXMy.Energy)". Update the agreement template when/if the DBA filing is retired.

## Done
- ✅ 2026-07-04 — Growth audit delivered; Day-1–30 fixes shipped (funnel, attribution, SEO penalty risks, conversion tags, installer-page tracking)
- ✅ 2026-07-04 — Full rebrand to Solar Review on all customer-facing surfaces
- ✅ 2026-07-04 — Day-31–60 dev items: nightly enrich-only Black Box run, /book ad-variant headlines (?t=battery/repair/bill/sunpower/titan/sunnova), knock/dial → GHL bb-followup hook, FAQPage schema on installer pages, index.html 814KB → ~475KB total (131KB HTML + cached/lazy images)
