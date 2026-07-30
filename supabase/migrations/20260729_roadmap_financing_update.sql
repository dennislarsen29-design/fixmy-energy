-- ═══ Update roadmap task: financing lenders reshuffled (2026-07-29, per Dennis) ═══
-- Service Finance Company exited the solar/battery financing space -- removed as a candidate.
-- Credit Human contact info confirmed; GoodLeap added as the new second application; EnerBank
-- USA and Sunlight Financial researched as fallbacks; Mosaic confirmed bankrupt/excluded.
update public.roadmap_items set
  title = 'Direct Financing — Credit Human + GoodLeap (Service Finance dropped, solar/battery)',
  description = 'Stand up Solar Review''s own consumer financing so batteries, retrofits, and new-solar can be financed directly instead of through Cosmic''s credit-union referral program. Credit Human is the primary application (contact info confirmed 2026-07-29). Service Finance Company has exited the solar/battery financing space and is no longer a candidate for this line of business -- GoodLeap is the new second application (largest active solar+battery lender), with EnerBank USA and Sunlight Financial as researched fallbacks. Mosaic is confirmed bankrupt/wound down -- excluded. Wire whichever lender(s) confirm a dealer ID into the proposal + Sign & Pay flow, mirroring the existing Top Tier Service Finance quick-link.',
  dennis_action = 'Contact Credit Human Business Development (1-800-292-5235 option 6, or sustainablehomesales@credithuman.com) to move the application forward. Also start a GoodLeap partner application (goodleap.com/businesses/solar-and-storage -- confirm Solar Review clears their 100+ lifetime installs + business credit/BBB requirement first). Share whichever dealer ID(s) + application URL(s) come through so they can be wired into the portal -- either lender can go live independently of the other.',
  prompt = 'Add a direct consumer-financing option to the FixMy.Energy / Solar Review portal. Credit Human is the primary application in progress. Service Finance Company — originally considered as a second option — has pulled out of the solar/battery financing space, so it is no longer viable and should not be pursued further for this line of business (their general home-improvement products for other trades are unaffected, this is specific to solar/battery). GoodLeap and EnerBank USA have been researched as replacement alternatives.

CREDIT HUMAN — primary, application contact info confirmed 2026-07-29
- Phone: 1-800-292-5235, option 6 for Business Development (option 2 Onboarding, option 4 Underwriting, option 5 Funding, for later in the process).
- Email: sustainablehomesales@credithuman.com (Business Development — use this for a new dealer application, not the general contact form).
- Online form: credithuman.com/sustainablehome-form.
- Program page: credithuman.com/borrow/personal-loans/sustainablehome-dealer.
- Lead with Business Development (phone option 6 or the sales email), not the general contact form.

SERVICE FINANCE COMPANY — REMOVED as a candidate (2026-07-29)
Service Finance is exiting the solar/battery financing space. Their dealer #815133104 remains valid for Top Tier''s own (non-solar/battery) business, but Solar Review should not pursue a second SFC dealer number for FixMy/battery/new-solar as previously planned. Do not build the Service Finance quick-link for this line of business.

ALTERNATIVES — researched 2026-07-29, current status verified via web search (not assumed from memory)
- GoodLeap — RECOMMENDED second application. The largest, most active solar+battery-specific digital lender today, with direct battery-storage partnerships (e.g. Torus) and a "Direct Pay" program that pays distributors directly for equipment. Minimum requirements to become a partner: 100+ lifetime installs, plus a business credit/BBB/financials review — confirm Solar Review clears that bar before applying. Apply via goodleap.com/businesses/solar-and-storage (a direct phone number could not be confirmed via public search — the site blocks automated fetches, call their general line or use the partner application on that page).
- EnerBank USA — worth a call for stability. Now owned by Regions Bank (a large regional bank), not a standalone fintech — meaningful given how many solar-specific lenders have gone bankrupt recently (see Mosaic below, and Sunlight Financial''s own 2023 Chapter 11). Long-standing general home-improvement dealer program; their specific solar/battery enrollment terms were not confirmed via public search and should be verified directly with an EnerBank rep before applying.
- Sunlight Financial — viable but carries a bankruptcy history. Filed Chapter 11 in 2023, emerged the same year, and their CEO has publicly stated they are still funding loans and supporting installers as of 2026. Treat as a fallback option, not a primary pick, given that history.
- Mosaic — DO NOT PURSUE. Filed Chapter 11 in June 2025 and is effectively wound down as of 2026; the bankruptcy estate is reportedly running out of funds to defend ongoing lawsuits, and existing loans are now serviced by Solar Servicing LLC. Not a live dealer-enrollment option despite being a well-known name — do not confuse with Credit Human or GoodLeap when discussing options with Dennis or reps.

STRATEGIC NOTE
This is now the second point-of-sale lender to pull out of a product line Solar Review depends on (Wheelhouse''s sales process was separately dropped per Dennis''s own call, and now Service Finance is exiting solar/battery specifically). Whichever lender(s) Solar Review ultimately signs with, avoid single-lender dependency going forward — pursuing Credit Human AND GoodLeap in parallel (as already decided) gives a real fallback if either one changes terms or exits the space again.

BUILD STEPS (unchanged from the original plan, now targeting Credit Human + GoodLeap)
1. Contact Credit Human Business Development (info above) and GoodLeap partner application to start both dealer applications in parallel.
2. Add a financing quick-link in the admin + tech proposal/editor UI per lender once each dealer ID/application URL is confirmed, mirroring the existing Top Tier Service Finance quick-link pattern (copy dealer ID to clipboard + open the application URL).
3. On the customer proposal + Sign & Pay page, add an "Apply for financing" option for eligible tickets (battery retrofit, new solar) that opens whichever lender''s application is live.
4. Track financing status on the customer record: financing_status (none|applied|approved|declined|funded) and financing_provider (credit_human|goodleap|other) — provider is a real field from day one so multiple lenders can go live independently, not hardcoded to one.
5. Document the flow in CLAUDE.md and commit + push once at least one dealer ID is confirmed.

Deliver a plan first, then implement once Dennis confirms a dealer ID and whether an API/prefill URL is available, for either lender.',
  updated_at = now()
where key = 'credit-human-financing';
