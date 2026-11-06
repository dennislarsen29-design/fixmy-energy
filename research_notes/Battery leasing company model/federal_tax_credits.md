# Federal tax credits for a small TPO residential battery lessor (2026, post-OBBBA)

Scope: Solar Review Corp (California S-Corp) owning Tesla Powerwall 3 batteries (13.5 kWh, ~11.5 kW) retrofitted onto existing home solar and leasing them to homeowners in CA and UT.

Method note (read first): research was done 2026-11-06 with web search only. Every attempt to open a source page directly (law-firm sites, vendor guides) was blocked by the research sandbox's network, so all findings below come from search-result summaries of the cited pages, not from reading the full documents or statute. Treat each item as "what the cited source says," and have a CPA / tax attorney confirm against P.L. 119-21 (OBBBA), IRC §§48E, 50, 168, 6418, Treas. Reg. §1.48E, Notice 2025-08, Notice 2025-42, Notice 2026-15 and Notice 2026-39. Nothing here is legal or tax advice. Labels used: [Statute], [Regs/IRS guidance], [Commentary], [Vendor] (installer/marketing — weakest).

## 1. Is leased residential storage still eligible for §48E after OBBBA, and through when?

### Takeaway
Yes. OBBBA cut off wind and solar on an accelerated schedule but left energy storage technology (EST) on the original 48E schedule: full credit for storage that begins construction through 2033, then 75% (2034), 50% (2035), zero for construction starting 2036+. OBBBA's new leased-residential exclusion (48E(i)) covers only solar water heating and small wind property, not batteries or solar electric.

### Cited Findings
- [Commentary] OBBBA's accelerated cutoff (placed in service after 12/31/2027 unless construction began by 7/4/2026) applies to "applicable wind and solar facilities"; the amendment "does not affect related energy storage technology." — [Eide Bailly](https://www.eidebailly.com/insights/alerts/2025/obbb-energy-credits); [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2025/08/irs-releases-updated-obbba-related-energy-credit-guidance)
- [Commentary] BESS remains eligible for the full 48E ITC for construction beginning through 2033, phasing to 75% in 2034, 50% in 2035, zero in 2036. — [Fallbrook Financial](https://fallbrookfinancialservices.com/battery-storage-tax-credits-obbba/); [ICS Tax](https://ics-tax.com/news/48e-investment-tax-credit-obba-phaseout/). A vendor source instead says "through 2032"; the 2033/2034/2035 schedule is the better-supported reading but should be checked against §48E(e). — [Solar Permit Solutions (vendor)](https://www.solarpermitsolutions.com/blog/solar-battery-tax-credit-2026)
- [Commentary, describing statute] OBBBA added §48E(i): for taxable years beginning after July 4, 2025, no 48E credit for property leased to a third party where the property is described in §25D(d)(1) (solar water heating) or §25D(d)(4) (small wind); 45Y similarly disallowed. Gibson Dunn notes the heading says "solar leasing arrangements" but the operative cross-reference reaches only solar water heating (which isn't 48E property anyway) and small wind. — [Gibson Dunn](https://www.gibsondunn.com/focus-on-clean-energy-tax-provisions-in-the-one-big-beautiful-bill-act/); [Kirkland](https://www.kirkland.com/publications/kirkland-alert/2025/08/one-big-beautiful-bill-act-brings-big-changes-to-green-energy-tax-credits); [RSM](https://rsmus.com/insights/services/business-tax/obbba-tax-clean-energy.html)
- [Commentary] A House draft would have denied the credit for leased residential solar as well; the enacted law preserved leased solar electric. — [Tax Foundation](https://taxfoundation.org/blog/big-beautiful-bill-green-energy-tax-credit-changes/)
- [Commentary] Beginning-of-construction Notice 2025-42 (Physical Work Test only, 5% safe harbor removed except solar ≤1.5 MWac) applies only to wind and solar facilities; "battery energy storage systems — are not otherwise impacted by this Notice." — [Jackson Walker](https://www.jw.com/news/insights-obbba-construction-notice-2025-42/); [Crowe](https://www.crowe.com/insights/tax-news-highlights/new-rules-for-wind-and-solar-energy-projects)

### Inferences
- Standalone storage retrofitted to an existing solar array is a separate EST; the battery's eligibility does not depend on the (older, already-placed-in-service) solar. The July 4, 2026 / 12/31/2027 wind-solar cliffs do not apply to it.
- Because Notice 2025-42 doesn't reach storage, storage beginning of construction should still follow the pre-OBBBA rules (physical work or 5% safe harbor, Notice 2013-29 line / Notice 2022-61), but no source explicitly confirmed this for storage. Separately, FEOC rules use their own beginning-of-construction test.
- The practical deadline that matters for this business is FEOC (section 5), not the storage sunset.

### Gaps
- Exact statutory text of §48E(e) storage phase-out and §48E(i) not read directly (sandbox blocked congress.gov/law firm pages).
- No source specifically addressed whether a Powerwall "retrofit" onto existing solar is ever treated as part of the solar facility (it shouldn't be, but confirm).

## 2. Section 25D ended for homeowner-owned systems — why TPO is the only federal path

### Takeaway
OBBBA terminated §25D for expenditures after 12/31/2025, so a homeowner who buys a Powerwall in 2026 gets no federal credit; only a business owner (lessor/PPA provider) can claim §48E, which is why leases are the remaining federal-credit route.

### Cited Findings
- [Commentary] OBBBA terminated the §25D residential clean energy credit for expenditures after December 31, 2025. — [Gibson Dunn](https://www.gibsondunn.com/focus-on-clean-energy-tax-provisions-in-the-one-big-beautiful-bill-act/); [Eide Bailly](https://www.eidebailly.com/insights/alerts/2025/obbb-energy-credits)
- [Vendor] Leases, operating PPAs and prepaid PPAs remain eligible under 48E; the credit goes to the owner, not the homeowner. — [Bodhi](https://www.bodhi.solar/blog/top-residential-solar-questions-one-big-beautiful-bill-answered); [Sunraise Capital](https://sunraisecapital.com/blog/48e-tpo-solar-tax-credit-2027-obbba-pathway)
- [Commentary] Prepaid leases are emerging as a way for residential customers to indirectly access the federal credit in 2026. — [pv magazine USA](https://pv-magazine-usa.com/2026/04/15/prepaid-leases-emerge-as-residential-solar-customer-pathway-to-accessing-federal-tax-credits/)
- [Vendor] A leased system never qualified for 25D because 25D required the homeowner to own the property. — [Solar Roost](https://solarroost.com/guides/solar-lease-ppa-48e-credit/)

### Inferences
- The lessor must be the real tax owner (benefits and burdens), not a disguised seller/lender; a lease that looks like an installment sale (nominal buyout, homeowner bears risk) risks recharacterization and loss of the credit. This is a CPA/attorney item for the lease form.

### Gaps
- No source addressed IRS true-lease vs disguised-sale tests specifically for residential battery leases in 2026.

## 3. Base rate 6% vs 30%: prevailing wage & apprenticeship (PWA), the under-1 MW exception, per-home vs aggregated

### Takeaway
48E's base rate is 6%; it is multiplied by 5 (to 30%) if PWA is met OR the facility/EST is under 1 MW. Each Powerwall is ~11.5 kW, so the One Megawatt Exception should apply; the final regs aggregate ESTs for this test only when they share owner, placed-in-service year AND interconnection point, which separate homes do not.

### Cited Findings
- [Regs] For electrical energy storage property, the EST One Megawatt Exception is determined using the storage device's maximum net output. — [26 CFR §1.48E-3 (Cornell)](https://www.law.cornell.edu/cfr/text/26/1.48E-3); [Tax Notes §1.48E-3](https://www.taxnotes.com/research/federal/cfr26/1.48E-3)
- [Regs, via commentary] Solely for the One Megawatt Exception, ESTs of the same technology are treated as having integrated operations (aggregated) if owned by the same taxpayer, placed in service in the same year, and transmit through the same interconnection point; aggregation matters only for the exemption test. — [Ever.green summary of final regs](https://ever.green/insight/45y-and-48e-tax-credit-final-rules); final regs published 1/15/2025 — [Federal Register](https://www.federalregister.gov/documents/2025/01/15/2025-00196/section-45y-clean-electricity-production-credit-and-section-48e-clean-electricity-investment-credit)
- [Regs] The final regs include a related-taxpayer rule (§1.48E-1(c)) that applies to the One Megawatt Exception. — [Ever.green](https://ever.green/insight/45y-and-48e-tax-credit-final-rules)
- [Vendor] 48E(a)(2) base 6%; 30% for storage with capacity under 1 MW. — [Solar Permit Solutions](https://www.solarpermitsolutions.com/blog/solar-battery-tax-credit-2026). (Another vendor says "6% for TPO residential systems" — that is wrong for sub-1 MW systems and should be disregarded.)

### Inferences
- Each home's Powerwall (separate meter/interconnection point) is its own EST for the 1 MW test → 30% base without PWA paperwork. Expansion packs at the same home are part of the same EST (still far below 1 MW).
- The prevailing-wage/apprentice documentation burden therefore does not apply to this business model.

### Gaps
- Full text of the aggregation conditions not read directly; confirm "same interconnection point" language in §1.48E-3(c).

## 4. Bonus credits

### Takeaway
Domestic content (+10 pts) requires 50% US manufactured-product content for 2026 construction starts (55% after 2026) and a component-level supply-chain certification — Powerwall 3 qualification is unconfirmed by any primary Tesla source. Energy community (+10 pts) is address-specific and checkable on the federal map. The 48E(h) low-income bonus (+10/+20) is a competitive allocation that, per the proposed regs, excludes standalone storage.

### Cited Findings — Domestic content
- [Statute, via commentary] OBBBA raised 48E's domestic content adjusted percentage to match 45Y: 40% for construction begun before June 16, 2025; 45% from June 16, 2025 through 2025; 50% for 2026; 55% after 2026. — [Reunion](https://www.reunioninfra.com/insights/domestic-content-bonus-credit-requirements-thresholds-and-safe-harbor); [Tax Notes §48E](https://www.taxnotes.com/research/federal/usc26/48E); [Arnold & Porter](https://www.arnoldporter.com/en/perspectives/advisories/2025/07/from-ira-to-obbba-a-new-era-for-clean-energy-tax-credits)
- [IRS guidance] Notice 2025-08 provides an updated elective safe harbor table for battery energy storage systems (revised cost percentages); taxpayers use either the Table 1 classifications or the safe harbor, exclusively; Treasury intends annual updates. — [IRS Notice 2025-08](https://www.irs.gov/pub/irs-drop/n-25-08.pdf); [RSM](https://rsmus.com/insights/tax-alerts/2025/treasury-issues-notice-2025-08-for-domestic-content-bonus-credit.html)
- [Vendor] Powerwall 3 is assembled in Lathrop, CA "with some cells sourced from Tesla partners"; bonus eligibility depends on the cell supply chain at manufacture — get a written cell-origin declaration per project. — [NuWatt](https://nuwattenergy.com/en/battery-storage/products/tesla-powerwall-3)
- [Vendor] A distributor lists a "Powerwall 3 Domestic Content Model (TSL-PWRW3-DOM)" — no Tesla documentation found for it. — [CSE Solar](https://csesolarusa.com/product/tesla-powerwall-3/)
- [Primary, Tesla SEC filing] Tesla's Q3 2026 10-Q reports its first Megapack with LFP cells made at Gigafactory Nevada; it does not (per the search summary) state Powerwall domestic content/FEOC status. — [Tesla 10-Q Q3 2026](https://www.sec.gov/Archives/edgar/data/0001318605/000162828026066775/tsla-20260930.htm)

### Cited Findings — Energy community
- [IRS guidance] Notice 2026-39 (June 10, 2026) updated the Statistical Area and Coal Closure lists using 2025 unemployment data; brownfield category not updated; lists stay in effect until 2026-data lists issue. — [IRS Notice 2026-39](https://www.irs.gov/pub/irs-drop/n-26-39.pdf); [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2026/06/notice-2026-39-energy-community-bonus-credit.html); [Baker Tilly](https://www.bakertilly.com/insights/notice-2026-39-updating-energy-community-bonus)
- [Commentary] Addresses can be checked on the energycommunities.gov map, or Novogradac's mapping tool (updated for Notice 2026-39). — [Novogradac](https://www.novoco.com/notes-from-novogradac/irs-updates-energy-community-bonus-credit-eligibility-novogradac-policy-map-updated-to-reflect-2026-changes); [Aurora Solar](https://aurorasolar.com/home-solar/blog/energy-101/what-is-an-energy-community-solar)

### Cited Findings — Low-income 48E(h)
- [IRS] Competitive capacity allocation: +10 pts for facilities in low-income communities / Indian land, +20 pts for qualified low-income residential building or economic benefit projects. — [IRS](https://www.irs.gov/node/125331)
- [Commentary] 1.8 GW/year total; category splits cited in older sources (600 MW LIC, 200 MW Indian land, 800 MW economic benefit — verify). 2026 applications opened Feb 2, 2026; one source says the window closed Aug 7, 2026 with no 2027 window announced as of Sept 2026. — [IRA Tracker](https://iratracker.org/actions/treasury-releases-final-rules-to-expand-clean-energy-investments-and-lower-costs-in-low-income-communities/); [Wipfli](https://www.wipfli.com/insights/articles/irs-announces-low-income-community-bonus-for-clean-electricity-itc); [McCalmont (vendor)](https://mccalmont.net/incentives/federal/)
- [Commentary on proposed regs] Standalone energy storage is not a "qualified facility" and so cannot receive the 48E(h) bonus (unlike the older 48(e) program). — [Legal500](https://www.legal500.com/intelligence/united-states/energy-and-natural-resources/proposed-regulations-regarding-section-48e-clean-electricity-low-income-communities-bonus-credit-program)

### Inferences
- Domestic content: do not price 40% into the model unless Tesla/distributor provides a signed, batch-specific domestic content certification that supports the 50% (2026) / 55% (2027+) test; otherwise assume 30%.
- Energy community: few coastal San Diego tracts are likely to qualify; check each address. Utah coal-closure tracts are a possibility but must be checked per address.
- Low-income: treat as unavailable for retrofit storage (and the program window is annual/competitive regardless).

### Gaps
- Whether the 2026 BESS safe harbor table changed after Notice 2025-08 (an annual update was promised) — not found.
- Whether the final 48E(h) regs changed the standalone-storage exclusion — unconfirmed.
- No primary Tesla statement on Powerwall 3 domestic content found.

## 5. Prohibited foreign entity (FEOC) "material assistance" rules for storage

### Takeaway
For storage beginning construction in 2026 the material assistance cost ratio (MACR, non-PFE share of direct costs of manufactured products) must be at least 55%, rising ~5 pts/year to 75%; failing it disallows the entire credit. Powerwall 3 compliance is plausible but not confirmed by Tesla; get a supplier certification.

### Cited Findings
- [IRS guidance] Notice 2026-15 (Feb 12, 2026) is interim guidance introducing the MACR; taxpayers may rely on it for facilities/ESTs beginning construction after 12/31/2025 until 60 days after new safe harbor tables are published; proposed regs to follow. — [Nixon Peabody](https://www.nixonpeabody.com/insights/alerts/2026/03/20/foreign-entities-of-concern-the-material-assistance-rule-and-irs-notice-2026-15); [KPMG](https://kpmg.com/us/en/taxnewsflash/news/2026/02/notice-2026-15-guidance-energy-tax-credits-material-assistance-prohibited-foreign-entities.html); [Baker Botts](https://www.bakerbotts.com/thought-leadership/publications/2026/february/treasury-and-irs-provide-guidance-regarding-energy-tax-credit-limits)
- [Commentary] EST threshold: 55% (2026), 60%, 65%, 70%, 75% in following years; failing MACR "entirely disallowed." — [Alvarez & Marsal](https://www.alvarezandmarsal.com/thought-leadership/irs-issues-notice-2026-15-first-guidance-on-prohibited-foreign-entity-rules-for-energy-tax-credits); [Grant Thornton](https://www.grantthornton.com/insights/alerts/tax/2025/insights/energy-incentives-under-obbba-what-you-need-to-know)
- [Commentary] 45Y/48E projects beginning construction before 1/1/2026 are not subject to project-level material assistance requirements; only manufactured products (not steel/iron) count. — [RSM](https://rsmus.com/insights/tax-alerts/2026/irs-guidance-material-assistance-prohibited-foreign-entity.html); [Tax Law Center](https://taxlawcenter.org/blog/treasury-releases-first-round-of-prohibited-foreign-entity-guidance)
- [Commentary] Notice 2026-15 does not resolve the ownership/"effective control" tests. — [Tax Law Center](https://taxlawcenter.org/blog/treasury-releases-first-round-of-prohibited-foreign-entity-guidance)
- [Vendor/blog] One estimate: if only the cells come from a PFE, the ratio is ~48% — below 55%. — [China Prospect](https://chinaprospect.com/battery-storage-tax-credit-foreign-entity-rules/)
- [Trade press] Tesla's US storage cells were largely sourced from Chinese suppliers; LG Energy Solution signed a $4.3B US-made LFP deal for Megapack 3. — [Energy-Storage.News](https://www.energy-storage.news/teslas-energy-division-gross-margin-declines-19-despite-battery-storage-deployment-rebound/)
- [Vendor, unsupported] Several installer pages list Powerwall 3 as FEOC compliant with no Tesla citation. — [NuWatt matrix](https://nuwattenergy.com/en/domestic-content-feoc-equipment-matrix-2026); [Solar Spec Hub](https://solarspechub.com/guides/feoc-solar-panels-2026/)
- [Commentary] §6418 transfers now also carry foreign-entity restrictions (credits cannot be transferred to a specified foreign entity). — [Beancount guide](https://beancount.io/blog/2026/05/12/section-6418-transferable-energy-tax-credits-sell-section-45-48-cash-buyers-discount-obbba-guide)

### Inferences
- The lessor (Solar Review Corp) itself must not be a PFE/foreign-influenced entity — almost certainly fine for a US-owned S-Corp, but confirm no foreign debt/ownership triggers.
- Because cells dominate battery cost, a Powerwall with Chinese-PFE cells is at real risk of failing 55%. The credit is all-or-nothing, so a written MACR certification from Tesla or the distributor per unit/batch is a must-have before booking any credit.
- The threshold rises every year, so units installed later need re-checking.

### Gaps
- No primary Tesla statement on Powerwall 3 FEOC/MACR; Q3 2026 10-Q text not read directly.
- Recapture rule for later "effective control" payments to PFEs (10-year look-back reported in commentary for other contexts) not confirmed for 48E storage here.

## 6. Credit basis

### Takeaway
Basis is the lessor's cost of the energy property (equipment + installation, plus properly allocable soft costs); a fair-market-value step-up via a related-party sale is a long-standing IRS/Treasury scrutiny area and needs an independent appraisal.

### Cited Findings
- [Treasury, historical 1603 guidance, 2011] Basis "is more closely scrutinized in cases involving related parties"; claims materially above benchmarks get closer scrutiny; residential <10 kW benchmark was $7/W then. — [Treasury, Evaluating Cost Basis for Solar PV](https://home.treasury.gov/system/files/216/N-Evaluating_Cost_Basis_for_Solar_PV_Properties-final.pdf); [Troutman](https://www.troutman.com/insights/tax-basis-for-solar-pv-projects-treasury-guidance/)
- [Commentary] Tax equity investors usually require an independent appraisal confirming FMV; IRS recognizes income, market and cost approaches. Without a sale, basis carries over (no step-up). — [Akin (Burton)](https://akingump.com/images/content/3/5/v2/35209/Sale-Leasbacks-Feb-2015-D-Burton.pdf)
- [Historical] Treasury's Inspector General probed SolarCity and others over inflated FMV claims. — [ILSR](https://archive.ilsr.org/treasury-dept-fingers-solarcity-leasing/)

### Inferences
- For Solar Review installing through Cosmic/its own crew and owning the battery itself: basis ≈ actual cost paid (Powerwall + install + permitting/interconnection directly allocable). Internal "dealer margin" charged by Solar Review to itself is not cost. A step-up only exists if a separate entity sells the system at arm's length; using a related entity to inflate basis invites challenge.
- If credits are sold under §6418, buyers will diligence basis; an independent cost/FMV report helps pricing.

### Gaps
- No post-2024 IRS guidance on residential lease FMV under 48E found. Allocation of soft costs (sales commissions, customer acquisition) to basis vs expense not confirmed — CPA item.

## 7. Recapture (5-year) and lease/buyout interaction

### Takeaway
Under §50(a), if the property is disposed of or stops being qualifying property within 5 years of placed-in-service, the unvested credit is recaptured: 100% in year 1, 80% yr 2, 60% yr 3, 40% yr 4, 20% yr 5, none after. Selling the battery to the homeowner (buyout) before the 5th anniversary is a disposition. A 6-year lease with buyout only after year 5 avoids recapture.

### Cited Findings
- [Vendor] Recapture falls 20% per year from 100% in year one to 20% in year five; none after. — [NuWatt](https://nuwattenergy.com/en/solar-lease-ppa-2026/section-48-homeowner-guide)
- [Commentary] A transferee (credit buyer) remains liable for recapture even though the seller operates the project — hence indemnities/insurance in transfer deals. — [CFO Dive](https://www.cfodive.com/spons/structure-matters-how-itc-transfers-mitigate-risk-and-maintain-compliance/699715/)
- [Commentary] Casualty events (fire/loss) can trigger recapture unless property is restored. — [Norton Rose Fulbright Project Finance](https://www.projectfinance.law/tax-equity-news/2021/june/itc-recapture-following-a-casualty-event/)
- [Vendor] Residential TPO providers typically limit buyouts during the recapture period. — [Solar.com](https://solar.com/learn/lease-to-own-solar-panels/)

### Inferences
- Lease design: no buyout option exercisable before the 5-year anniversary of placed-in-service (or buyout price that includes the recapture cost). Homeowner moving/selling the house → lease assignment to the new owner (not a disposition by the lessor) avoids recapture; removal/relocation should be reviewed.
- Recapture also bites if the lessor company is sold/converted in a way treated as a disposition, or if the battery stops being used as qualifying EST.

### Gaps
- §50 statute and §1.6418-5 recapture allocation (seller notification duties) not read directly.

## 8. Transferability (§6418)

### Takeaway
A small company can sell 48E credits for cash to an unrelated taxpayer, once, for a price typically ~$0.86–0.95 per $1 (small deals at the low end), after registering each facility in IRS Energy Credits Online. Tiny single-home credits (~$4.5k) are uneconomic alone; they must be pooled into an annual portfolio sale through a broker/marketplace.

### Cited Findings
- [Statute] §6418 permits a one-time transfer for cash; election due by the return due date for the year the credit arises; transferred credits cannot be re-transferred. — [26 USC §6418 (Cornell)](https://www.law.cornell.edu/uscode/text/26/6418)
- [Commentary] §6418 survived OBBBA, now with foreign-entity restrictions. — [Beancount guide](https://beancount.io/blog/2026/05/12/section-6418-transferable-energy-tax-credits-sell-section-45-48-cash-buyers-discount-obbba-guide)
- [Market data, Crux] 2024: small solar ITC deals averaged ~86¢ rising to ~91¢. Q1 2026 pricing largely flat vs Q4 2025; variation driven by credit quality, seller quality and type. Full-year 2026 transfer value estimated $47.5–49B. — [Crux 1Q2026 Q&A](https://www.cruxclimate.com/blog/1q2026-market-update-qa-josh-price); [PV Tech](https://www.pv-tech.org/clean-energy-tax-credit-transfers-fall-crux-us-49-billion/); [Crux 2025 report](https://www.cruxclimate.com/blog/cruxs-2025-market-intelligence-report-what-tax-credit-buyers-need-to-know)
- [Commentary/vendor] Typical ranges cited: $0.88–0.94; $0.82–0.92; 6–15% discount. — [Beancount](https://beancount.io/blog/2026/05/12/section-6418-transferable-energy-tax-credits-sell-section-45-48-cash-buyers-discount-obbba-guide); [Sunraise Capital (vendor)](https://sunraisecapital.com/blog/ira-solar-tax-credit-transferability-2026-section-6418); [Crux guide](https://www.crux.com/blog/transferable-tax-credits)
- [IRS] Pre-filing registration via IRS Energy Credits Online; a registration number is needed for each eligible facility and must appear on the return; failure makes the election ineffective; each entity registers under its own EIN; register no earlier than the start of the tax year the credit arises; one firm recommends ~120 days before filing (not a hard deadline). — [IRS](https://www.irs.gov/node/128071); [EY](https://taxnews.ey.com/news/2024-0529-irs-announces-additional-office-hours-focused-on-pre-filing-registration-process-for-elective-payment-and-transfer-of-clean-energy-and-chips-credits); [Baker Botts](https://www.bakerbotts.com/thought-leadership/publications/2024/january/irs-opens-prefiling-registration-tool-for-elective-payment); [Flaster Greenberg](https://www.flastergreenberg.com/printpilot-alert-315.pdf?1778867408)
- Platforms/brokers referenced in sources: Crux, Reunion, Basis Climate, Tri-Merit, Fallbrook. — [Crux](https://www.crux.com/blog/transferable-tax-credits); [Reunion](https://www.reunioninfra.com/insights/transferable-tax-credit-comprehensive-guide); [Tri-Merit FAQ](https://tri-merit.com/tax-credit-transfer/tax-credit-transfer-faq/); [Fallbrook](https://fallbrookfinancialservices.com/understanding-transferability-selling-your-renewable-energy-tax-credits/)

### Inferences
- Plan an annual "vintage" sale: register every home's battery in ECO during the year, then sell the pooled credits after year-end via a marketplace. Expect the low end of pricing (≈80–88¢) for a small, first-time residential seller, plus diligence costs; buyers will want recapture insurance or indemnity, and MACR/domestic content documentation.
- Proceeds from a transfer are not taxable income to the seller under §6418 (and the buyer's payment is not deductible) — standard rule, confirm with CPA; the S-Corp makes the election at the entity level.
- Alternative: claim the credit directly against shareholders' own tax (subject to passive limits, §9).

### Gaps
- No public data on minimum deal sizes or 2026 small-residential-storage pricing (Crux's breakdowns are client-only). Whether ECO allows grouping many homes under fewer registrations was not confirmed.

## 9. Depreciation and S-Corp shareholder limits

### Takeaway
OBBBA permanently restored 100% bonus depreciation for property acquired after Jan 19, 2025; depreciable basis is reduced by half the credit. 48E storage reportedly keeps 5-year MACRS (OBBBA removed the 5-year class for §48 energy property beginning construction after 2024), though sources conflict. Shareholders face basis, at-risk, passive-activity and excess-business-loss limits; equipment leasing is generally a rental (passive) activity.

### Cited Findings
- [Commentary] 100% bonus depreciation permanently reinstated for property acquired after Jan 19, 2025 (election available for 40% in the first year ending after that date). — [Accounting Today](https://www.accountingtoday.com/opinion/what-cpas-should-know-about-the-return-of-100-bonus-depreciation-in-2025); [CRI](https://www.criadv.com/insight/obbba-bonus-depreciation-section-179-changes/)
- [Commentary] Depreciable basis = cost less one-half of the ITC. — [Etica](https://eticaag.com/maximizing-tax-benefits-macrs-bonus-depreciation-bess/)
- [Commentary] OBBBA removed the 5-year designation under §168(e)(3)(B)(vi) for §48 energy property (solar, wind, storage) beginning construction after 12/31/2024; property qualifying under §45Y/§48E continues as 5-year MACRS. Conflicting: Gibson Dunn says solar/wind 5-year treatment unaffected; Eide Bailly ties the change to placed-in-service date. — [Louis Plung](https://www.louisplung.com/obbba-changes-to-energy-credits/); [FBT Gibbons](https://fbtgibbons.com/one-big-beautiful-bill-act-cuts-the-power-phase%E2%80%91outs-foreign%E2%80%91entity-restrictions-and-domestic-content-in-clean%E2%80%91energy-credits/); [Gibson Dunn](https://www.gibsondunn.com/focus-on-clean-energy-tax-provisions-in-the-one-big-beautiful-bill-act/); [Eide Bailly](https://www.eidebailly.com/insights/alerts/2025/obbb-energy-credits)
- [Commentary] Energy property under 48 and 48E remains eligible for bonus depreciation. — [Eide Bailly](https://www.eidebailly.com/insights/alerts/2025/obbb-energy-credits)
- [Commentary] S shareholders' losses pass through basis (§1366(d)), at-risk (§465, applied at shareholder level, nonrecourse borrowing generally not at risk), passive (§469) and excess business loss (§461(l)) limits; general business credits from passive activities are limited to passive tax and carry forward. — [The Tax Adviser](https://www.thetaxadviser.com/issues/2023/apr/interaction-of-s-shareholders-loss-limitations/); [The Tax Adviser (passive credits)](https://www.thetaxadviser.com/issues/2007/aug/claimingpassiveactivitycredits/)
- [Statute excerpt] §49 limits the credit base for property used in an activity subject to §465 when financed by nonqualified nonrecourse debt. — [uscode.house.gov §49](https://uscode.house.gov/us/usc/119-121/t26/s49/)

### Inferences
- Even if the 5-year class question is unsettled, 100% bonus makes the class largely moot for federal purposes (whole reduced basis deducted year 1, if the shareholders can use it).
- Leasing batteries is a rental activity → losses/credits likely passive for shareholders unless an exception applies; Dennis's other income (Solar Review commission business) is non-passive, so passive losses/credits may be trapped. Selling credits under §6418 sidesteps the passive-credit problem for the credit (but not for depreciation losses).
- Financing batteries with nonrecourse debt could shrink the credit base (§49) and at-risk amount — use recourse/qualified financing or confirm with CPA.
- California does not conform to federal bonus depreciation (general knowledge, not sourced here — CPA to confirm state treatment and CA's 1.5% S-Corp tax).

### Gaps
- Enrolled text of OBBBA's §168(e)(3)(B)(vi) change not read; 48E storage class life must be confirmed.
- No source addressed whether a lessor with substantial services is outside the §469 rental definition.

## 10. Worked example — $15,000 installed Powerwall 3 retrofit

### Takeaway
At 30%: $4,500 credit (≈$3,960 cash if sold at 88¢) plus $12,750 of year-1 bonus depreciation. Each +10 pts adds $1,500 of credit and removes $750 of depreciable basis. Arithmetic below is mine, built on the rules cited above; tax rates are illustrative.

### Cited Findings
- Rules used: 30% via One Megawatt Exception ([§1.48E-3](https://www.law.cornell.edu/cfr/text/26/1.48E-3)); +10 domestic content / +10 energy community ([Reunion](https://www.reunioninfra.com/insights/domestic-content-bonus-credit-requirements-thresholds-and-safe-harbor); [Notice 2026-39](https://www.irs.gov/pub/irs-drop/n-26-39.pdf)); basis reduced by half the credit ([Etica](https://eticaag.com/maximizing-tax-benefits-macrs-bonus-depreciation-bess/)); 100% bonus ([Accounting Today](https://www.accountingtoday.com/opinion/what-cpas-should-know-about-the-return-of-100-bonus-depreciation-in-2025)); transfer price ~88¢ ([Beancount](https://beancount.io/blog/2026/05/12/section-6418-transferable-energy-tax-credits-sell-section-45-48-cash-buyers-discount-obbba-guide)); recapture 100/80/60/40/20 ([NuWatt](https://nuwattenergy.com/en/solar-lease-ppa-2026/section-48-homeowner-guide)).

| Credit rate | Credit | Cash if sold @ $0.88 | Depreciable basis (15,000 − ½ credit) | Yr-1 deduction (100% bonus) | Tax value of deduction @ 24% / 37% fed. |
|---|---|---|---|---|---|
| 30% (base, <1 MW) | $4,500 | $3,960 | $12,750 | $12,750 | $3,060 / $4,718 |
| 40% (+DC or +EC) | $6,000 | $5,280 | $12,000 | $12,000 | $2,880 / $4,440 |
| 50% (+DC and +EC) | $7,500 | $6,600 | $11,250 | $11,250 | $2,700 / $4,163 |

Recapture exposure at 30% if disposed of (e.g., early buyout): yr1 $4,500, yr2 $3,600, yr3 $2,700, yr4 $1,800, yr5 $900, after yr5 $0.

### Inferences
- Realistic planning case is 30% only, until a Tesla MACR + domestic-content certification and an address-level energy community check exist. A battery that fails FEOC gets $0 credit (but still depreciation on full $15,000).
- Depreciation value is only real if shareholders have usable non-passive capacity or passive income; otherwise it is deferred.
- A 6-year lease with buyout after year 5 keeps the full credit; any buyout in years 1–5 should be priced to recover the recapture amount.

### Gaps
- Actual transfer price for a sub-$100k residential storage pool in 2026 is not publicly available; 88¢ is an assumption at the low-middle of cited ranges.
- Soft-cost inclusion in basis (could raise basis above equipment+install) unconfirmed.

## Items for CPA / tax attorney (consolidated)
1. Confirm §48E storage phase-out dates and that §48E(i) leased-property bar does not reach batteries (read P.L. 119-21 text).
2. Confirm per-home One Megawatt Exception (no aggregation across homes) → 30% without PWA.
3. Obtain Tesla/distributor written MACR (≥55% for 2026 starts) and domestic content certifications per batch; confirm Solar Review is not a PFE.
4. True-lease structuring (lessor = tax owner), buyout timing vs 5-year recapture, assignment on home sale.
5. Basis: what soft costs are includable; avoid related-party step-ups; consider independent cost report.
6. §6418: ECO registration per facility, annual pooled sale, broker selection, recapture indemnity/insurance.
7. Depreciation class (5-year vs other) for 48E storage, 100% bonus election, CA nonconformity, shareholder passive/at-risk/§461(l) limits, §49 nonrecourse financing limit.
8. Utah: no state items researched here (federal only).
