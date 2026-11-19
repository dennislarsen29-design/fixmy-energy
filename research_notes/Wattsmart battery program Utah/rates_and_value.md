# Wattsmart Battery Program and Utah RMP solar rate schedules: battery valuation

NOTE: WebFetch could not reach any site (pscdocs.utah.gov, utahcleanenergy.org, solarpowerworldonline.com all failed DNS: outside the session's allowed domains). Everything below is from WebSearch result summaries only; no page was read in full. Treat as leads to verify.

## 1. Utah solar rate schedules and current export credit

### Takeaway
Schedule 137 export credit for 2026 is reported as 4.855 c/kWh Jun-Sep and 4.033 c/kWh Oct-May (effective Mar 1, 2026), matching the figures in the question; the rate is reset annually. Schedule 135 is legacy net metering (closed Nov 2017, expected to end Dec 31, 2035).

### Cited Findings
- RMP's Jan 26, 2026 annual compliance filing lists 4.855 c/kWh (Jun-Sep) and 4.033 c/kWh (Oct-May); the text is garbled in places (stray 5.704 and 4.033199) — [PSC filing](https://pscdocs.utah.gov/electric/26docs/26035T03/343554Trf1-26-2026.pdf) (via search summary)
- PSC approved the Schedule 137 (Net Billing Service) sheet 137.3 revisions, effective March 1, 2026, in a Feb 23, 2026 letter (docket 26-035-T03); the inputs notice was docket 25-035-64 filed Dec 1, 2025 — [approval letter](https://pscdocs.utah.gov/electric/26docs/26035T03/343975TrfAprvlLtrfromPSC2-23-2026.pdf), [docket](https://psc.utah.gov/2025/12/01/docket-no-25-035-64)
- The summer export credit is about 15% lower than other months (per the Jan 2026 filing, summarized) — same docket sources
- Third-party guides agree on 4.855 / 4.033 as of Mar 1, 2026 — [Gardner Energy](https://gardner-energy.com/net-metering-in-utah-2026-how-rocky-mountain-power-net-billing-works/)
- Conflicting figures: DSIRE lists 5.704 c summer / 4.199 c winter (Feb 2026) — [DSIRE](https://programs.dsireusa.org/system/program/detail/743); Permitdesign lists 5.636 / 4.745 — [Permitdesign](https://permitdesign.com/residential-solar-permit-design/utah/salt-lake-city/). Likely older or different filings; unresolved.
- Original Schedule 137 rates (2020 order, docket 17-035-61): 5.969 c summer / 5.639 c winter; recalculated annually, typically effective March 1 — [PSC order](https://pscdocs.utah.gov/electric/17docs/1703561/3161911703561o10-30-2020.pdf)
- Schedule 135: service "expected to terminate on December 31, 2035" per 2017 order in docket 14-035-114; closed to new applications Nov 15, 2017; transfers to a later owner at the premises — [PSC docs](https://pscdocs.utah.gov/electric/14docs/14035114/297824ExACommOCS11-08-2017.pdf)
- Schedule 136 (net billing) opened Oct 1, 2020 with a one-time $85 application fee — [PSC order](https://pscdocs.utah.gov/electric/17docs/1703561/3161911703561o10-30-2020.pdf)

### Inferences
- The 4.855/4.033 figures are best supported (primary filing plus a secondary guide); DSIRE's numbers look stale.

### Gaps
- Exact year ranges for Schedule 136 vs 137 interconnection dates, and whether 136 customers share the 2035 sunset: not confirmed (no source states it).
- Export-credit determination method (avoided-cost inputs) not read.
- Any update after Mar 2026 not checked (a 2026 Schedule 135 redline, docket 26-035-T06, and Schedule 1 docket 26-035-T08 exist but were not read).

## 2. Retail rate structure

### Takeaway
Schedule 1 (residential) is tiered and seasonal; the best-found figures are Dec 1, 2025 tariff numbers, but a later 2026 redline conflicts and was not resolvable.

### Cited Findings
- Schedule 1 energy charges (Dec 1, 2025 tariff): Jun-Sep 9.3199 c/kWh first 400 kWh, 12.0130 c/kWh above; Oct-May 8.2477 c first 400, 10.6309 c above — [PSC tariff filing](https://pscdocs.utah.gov/electric/26docs/26035T08/346341Trf8-5-2026.pdf) (via search summary)
- A later redlined sheet shows different values (e.g., 9.8332 c first 400 kWh Jun-Sep) but is garbled with inconsistent dates — same source; not relied on.
- A Schedule 1 TOU listing on OpenEI has a 1/1/2026 effective date; rates not clearly identified — [OpenEI](https://openei.org/IURDB/rate/view/69c30f2893a800cd5603da5c)

### Inferences
- Marginal retail on the upper tier is ~10.6-12.0 c/kWh; this is the plausible value of an avoided evening kWh for a customer above 400 kWh/month (energy charge only; excludes basic charge, adjustments, and surcharges, so true avoided cost may be higher).

### Gaps
- Basic charge, current 2026 final rates, any TOU/Schedule 2/2A or battery-friendly rate, and a "blended 2026 $/kWh" were not found.

## 3. Does a battery change schedule/grandfathering; interconnection

### Takeaway
Sources say enrolling in Wattsmart does not change existing net metering terms, but this is from secondary summaries; the tariff-level rules on adding storage/changing a legacy system were not verified.

### Cited Findings
- Multiple sources say enrollment doesn't change an existing solar customer's net metering; one Utah source attributes this to RMP — [Elite Electric](https://eliteelectricpro.com/rmp-wattsmart-battery-rebate-2026/), [BYOP Electric](https://byopelectric.com/blog/add-battery-to-existing-solar-utah)
- Retrofit initiative for existing solar with sonnen and ES Solar — [Utility Dive](https://www.utilitydive.com/news/es-solar-sonnen-deploy-18-mwh-of-home-battery-retrofits-through-rocky-mountain-power/726583/)

### Gaps
- Whether adding storage or increasing capacity triggers loss of 135/136 status, and interconnection application requirements: not found.

## 4. Wattsmart Battery Program terms

### Takeaway
Program pays an upfront incentive plus annual bill credit for letting RMP dispatch the battery; incentive figures conflict across sources and need verification on RMP's page.

### Cited Findings
- Participants allow RMP to draw from batteries; solar must charge it; batteries from RMP's approved list — [Utah Clean Energy](https://utahcleanenergy.org/rocky-mountain-power-wattsmart-battery-program/), [KUTV](https://kutv.com/news/eye-on-utah/utah-solar-battery-program-hopes-to-create-virtual-power-plants) (summaries)
- Older: $600/kW upfront for solar installed before Sept 1, 2021 adding storage vs $400/kW for new solar+storage; $15/kW-year credit — [Solar Power World](https://www.solarpowerworldonline.com/2024/09/rocky-mountain-power-is-paying-solar-customers-more-incentives-if-they-add-storage-later/)
- A 2026 installer guide claims a cap of $2,000 for batteries >=10 kW and $1,000 for smaller, approved battery currently Powerwall 3 — [Elite Electric](https://eliteelectricpro.com/rmp-wattsmart-battery-rebate-2026/) (third-party, unverified; conflicts with $/kW figures)
- Utah brochure: incentive capped at 70% of equipment cost; existing batteries may get bill credits only; Pacific Power version requires a 4-year commitment; customers can leave with 30 days' notice — [RMP brochure](https://www.rockymountainpower.net/content/dam/pcorp/documents/en/rockymountainpower/savings-energy-choices/wattsmart-batteries/RMP_BatteryStorageProgram_customer_FINAL.pdf), [SolarEdge](https://www.solaredge.com/us/incentives/rocky-mountain-power)

### Gaps
- Current (Nov 2026) incentive amounts, whether the program is still open, dispatch limits (how much of the battery RMP can use, which affects the customer's own savings): not verified.

## 5. Value logic and worked example

### Takeaway
Reasoning is an inference, not sourced; it holds on Schedule 137 but is weak for legacy customers.

### Inferences (assumptions explicit)
- Schedule 137: shifting an exported kWh to evening use earns (avoided retail - export credit). Using energy-charge-only figures: upper tier 10.63 c (Oct-May) or 12.01 c (Jun-Sep) minus 4.033 c or 4.855 c = about 6.6 c/kWh winter, 7.2 c/kWh summer. If the customer is in the lower tier, spread is smaller: 8.25-4.03 = 4.2 c winter, 9.32-4.86 = 4.5 c summer.
- Example: 13.5 kWh Powerwall 3, say ~12.15 kWh usable per cycle (90% usable/round-trip assumption; the 12.15 figure appears in this project's own CLAUDE.md, not a sourced spec), 365 cycles only if enough surplus solar exists daily. Upper tier: ~12.15 x 365 x ~0.07 = ~$310/yr. Lower tier: ~12.15 x 365 x ~0.043 = ~$190/yr. Excludes any Wattsmart credit ($15/kW-yr x ~5 kW = ~$75/yr if that figure holds).
- Schedule 135 (legacy net metering): exports are credited roughly at retail (full net metering), so shifting yields about zero energy savings; battery value is backup and Wattsmart payments only. Whether 136 customers behave the same is unverified.
- These spreads are small, so Wattsmart payments and backup value may dominate.

### Gaps
- Real Schedule 135/136 credit mechanics; demand/tier interactions; Powerwall 3 usable capacity from Tesla spec not cited.

## 6. State incentives and federal tax rules

### Gaps
- Not researched: no search done on the federal ITC for residential storage after the 2025 budget law or any Utah state credit. No claim made.
