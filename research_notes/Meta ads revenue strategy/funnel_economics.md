# Funnel economics for local solar service / battery sales (Meta ad break-even targets)

Method note: ~15 searches; page fetch of Rework failed (DNS), so most figures are from search-result summaries of vendor blogs. Almost nothing here is from independent audited data. Items marked ASSUMPTION are mine, not sourced.

## 1. Benchmarks: show rate, reminders, appointment-to-proposal, close rates, sales cycle

### Takeaway
Solar vendor blogs put show rates around 60-80% (lower for purchased leads, higher for referrals/confirmed inbound) and close rates on held consultations around 22-38%, but these are vendor numbers with no disclosed sample. Independent evidence on reminders (healthcare) suggests a 16-40% relative cut in no-shows; no home-services-specific independent study found. No credible benchmark found for service/repair or battery-retrofit close rates.

### Cited Findings
- Show rate (consultations held / appointments set): main benchmark 65-80% for well-qualified, well-confirmed leads; by source: self-generated 75-85%, inbound digital 60-75%, purchased 45-65%, referrals 80-90%. Under 60% signals a qualification/confirmation problem — [Rework solar KPIs](https://resources.rework.com/libraries/solar-home-energy-growth/solar-sales-kpis-metrics) (vendor blog, summarized via search)
- "Sit rate" 70-85% for confirmed inbound appointments; door-to-door lower — [SurgePV](https://www.surgepv.com/blog/solar-sales-kpis-metrics)
- Confirmation rate benchmark 78-90%; under 75% suggests passive confirmation process — [Rework](https://resources.rework.com/libraries/solar-home-energy-growth/solar-sales-kpis-metrics)
- Set rate (appointments set / leads contacted): 30-45% digital inbound, 40-60% for qualified leads, 15-25% cold door-knocking — [Rework](https://resources.rework.com/libraries/solar-home-energy-growth/solar-sales-kpis-metrics)
- Close rate (signed / consultations held) in residential solar 22-38%; best-in-class 35-45% on self-generated leads; referral leads 35-55% — [Rework](https://resources.rework.com/libraries/solar-home-energy-growth/solar-sales-kpis-metrics)
- Reminders: a 21-study review cited by a blog found digital reminders cut missed appointments by about a quarter (no-shows ~15% vs ~21%) (BMJ Open 2016) — [Entagl summary](https://www.entagl.com/blog/reduce-no-shows-reminders-confirmation-calls); another summary of systematic reviews: ~29% reduction for automated reminders, ~39% for manual phone calls — same source. A peer-reviewed study of 1,193 appointments found text reminders had the lowest no-show rate (1.90%) but differences vs phone/email were not statistically significant — [PubMed 35609163](https://www.pubmed.ncbi.nlm.nih.gov/35609163/)
- Vendor claims of 30-50% (Sakari) up to 80% (GoReminders, home services) reduction in no-shows are unverified marketing — [Sakari](https://sakari.io/features/appointment-service-reminders), [GoReminders](https://www.goreminders.com/home-services-appointment-reminders-scheduling)
- Sales cycle: 4-10 weeks first contact to signed contract (SurgePV, vendor); 30-60 days residential at 15-25% conversion (QuickEstimate; **Indian market**, not US) — [SurgePV](https://www.surgepv.com/blog/solar-lead-response-time), [QuickEstimate](https://quickestimate.co/blog/sales-pipeline-management)
- Referral leads: one installer analysis ~29% close vs 2-5% for purchased digital leads; home-services referrals 30-50% close vs 8-15% marketplace — [Rework referral programs](https://resources.rework.com/libraries/solar-home-energy-growth/solar-referral-programs), [GetTheReferral](https://www.getthereferral.com/2026-referral-benchmark-report) (vendors; "close" definitions differ)

### Inferences
- A fair planning show rate for Meta-sourced, text-confirmed bookings is ~55-70% (inbound digital band, shaded down because a free eval has no commitment). ASSUMPTION.
- The 22-38% solar close rate likely applies to full-system sales, not to $13-17k Powerwall retrofits or $300-500 diagnostics; for FixMy use the owner's own history instead (see Gaps).
- Reminder uplift: if baseline no-show is 35%, a 25-30% relative cut gives ~25% no-show, i.e. show rate 65% -> ~75%. ASSUMPTION built on healthcare data.

### Gaps
- No independent (non-vendor) US solar show-rate or close-rate dataset found.
- No benchmark for repair/service-lead close rate, paid-diagnostic attach rate, or Powerwall-retrofit close rate.
- No sourced US sales-cycle figure for battery retrofits.
- Rework pages could not be fetched; figures are from search summaries only.

## 2. Inbound vs outbound; speed-to-lead; contact rates; touches

### Takeaway
The "5 minutes" effect rests on a 2007 vendor-linked study (contact ~100x more likely at 5 vs 30 min; direction reliable, magnitude not a current benchmark). Cold-call data suggests ~50-200+ dials per appointment, consistent with the business's ~14 appointments from ~9,000 leads being poor but not unusual.

### Cited Findings
- 2007 Oldroyd/InsideSales study (6 companies, 15,000+ leads, 100,000+ calls): calling within 5 min made contact ~100x more likely and qualification ~21x more likely than at 30 min; it compared 5 vs 30 min only, did not measure closed deals; the "78% buy from first responder" stat has no found source; HBR's separate 2011 study audited 2,241 US companies — [Ainora roundup](https://ainora.lt/blog/lead-response-time-statistics-every-study-2026), [Teamgate](https://teamgate.com/blog/lead-response-time-study)
- Velocify 2012: calling within 1 min raised conversion likelihood 391% — [Ainora roundup](https://ainora.lt/blog/lead-response-time-statistics-every-study-2026) (secondary)
- Velocify (~3.5M leads, 400+ companies): 93% of converted leads reached by the 6th call; leads needing >7 calls are 45% less likely to convert; optimal ~6 calls and ~5 emails (secondary coverage, original not found; 93% vs 95% figures appear to be different analyses) — [NatLawReview](https://natlawreview.com/node/60555/printable/print), [MPA](https://www.mpamag.com/us/mortgage-industry/business-growth/does-calling-at-certain-times-of-day-really-improve-customer-contact/34468)
- 2014 Velocify secret-shopper: 13% of web leads got no response of any kind — [eWeek](https://www.eweek.com/fr/small-business/businesses-need-to-bolster-crm-resources-design/)
- Cold calls: ~209 dials per appointment (Zippia 2025, cited by SurgePV; B2B-general); 2.7% cold-call conversion (Cognism 2026); BatchDialer (dialer vendor) 50-100 dials per appointment; energy-sector cold-call-to-sale 1.61% (Prospeo, vendor) — [SurgePV](https://www.surgepv.com/blog/solar-appointment-setting-scripts-getting-past-the-gatekeeper), [BatchDialer](https://batchdialer.com/blog/smart-dialer-strategies-to-boost-roofing-solar-appointments), [Prospeo](https://prospeo.io/s/solar-cold-calling)
- Missed-call text-back (vendor claims only): 30-60% of missed callers respond; 80-86% of voicemail callers never call back — [Chiirp](https://chiirp.com/insider_information_blog/missed-call-text-back-numbers)

### Inferences
- 14 appointments / ~9,000 leads = 0.16% per lead; at ~50-200 dials per appointment and 1-3 dials per lead that would imply ~0.3-1% per lead, so the list is at or below the low end. Dials are not leads, so this is rough. ASSUMPTION.
- Inbound Meta leads (people who asked) should convert to booked at far higher rates than cold lists (set rate 30-45% of contacted leads per Rework), so the existing outbound data is not a good predictor for ads.
- With one owner doing dialing and evaluations, speed-to-lead (minutes) is likely violated whenever he is in the field; automation (instant text + booking link) is the mechanism that can deliver the 5-minute response.

### Gaps
- No primary source for current (2024-26) web-lead contact rates for solar specifically.
- Original Velocify/InsideSales reports not located.

## 3. CAC / cost per lead / break-even math

### Takeaway
Sourced Meta solar CPL is roughly $30-$120 (central vendor estimate $60-90), and historical NREL-based residential-solar customer acquisition cost is ~$0.30-0.49/W (~$1,900-$2,700 for a 6 kW system). Break-even CPL for this business, using stated gross profits, is only about $15-$90 depending on mix and close rates (math below), so Meta works only if lead-to-booked and show rates are strong and revenue per evaluation is blended across diagnostic + battery + solar.

### Cited Findings
- Meta solar CPL: $60-90 (vs $80-130 Google) per Ryze AI via Elevarus; Webtonic $30-100 (top performers $25-50) and $22-120 Facebook range; no authoritative public solar-specific benchmark (Adsuploader says home-improvement proxy $41.26) — [Elevarus](https://elevarus.com/meta-ads-solar-lead-generation/), [Webtonic](https://www.webtonic.io/blog/solar-energy-facebook-ads-statistics), [Adsuploader](https://adsuploader.com/blog/facebook-ads-by-industry)
- Cross-industry Facebook lead-campaign CPL rose ~21% YoY to $27.66 (2025) — [WordStream](https://www.wordstream.com/blog/facebook-ads-benchmarks-2025)
- Home-services paid lead average $90.92 (LocaliQ 2025, secondary) — [GetTheReferral blog](https://www.getthereferral.com/blog/10-referral-analytics-metrics-for-home-services-roi)
- Solar CAC: NREL-based $0.31/W (2017) -> $0.30/W (2018); $0.44/W for full-service installers, ~$2,728 per customer at 6.2 kW (SolarReviews); 2012 data $0.48/W; door-to-door $1,000-$2,000 per customer (2013 data). Unverified 2026 claim of $0.84/W (Wood Mackenzie via non-NREL source) — [SolarReviews](https://www.solarreviews.com/solar-leads/customer-acquisition-costs-in-the-solar-industry), [GreenBuildingAdvisor](https://www.greenbuildingadvisor.com/article/soft-costs-ring-up-big-tab-in-pv-installations). **Dated (2012-2018).**
- Appointment-set solar lead ~$225 (vendor claim; effective ~$325 after no-shows) — [Elevarus](https://elevarus.com/buy-solar-leads-appointment-set-vs-raw-economics/)

### Inferences (explicit math; all rates ASSUMPTIONS)
Formula: **Max cost per booked appt = expected gross profit per SHOWN evaluation x show rate.** **Max CPL = max cost per booked x lead-to-booked rate.** Max cost per SHOW = GP per shown eval. Rep pay: if the owner does the work, the GP below is fully company; if a rep is paid ~40% of net, cut GP by ~40% (company keeps ~60%).

A. Single-product break-even per booked appointment (show rate 65%):
| Product (GP) | close rate of shown evals | max $/booked | max $/show |
|---|---|---|---|
| Battery $2,000 | 10% | $130 | $200 |
| Battery $2,000 | 15% | $195 | $300 |
| Battery $2,000 | 25% | $325 | $500 |
| New solar $8,000 | 5% | $260 | $400 |
| New solar $8,000 | 10% | $520 | $800 |
| New solar $8,000 | 20% | $1,040 | $1,600 |
| Diagnostic ($100 margin of $400 fee) | 30% buy | $19.50 | $30 |
| Diagnostic | 50% buy | $32.50 | $50 |
(Check: 2,000 x 0.65 x 0.15 = 195.)

B. Blended example per shown evaluation: 30% pay for diagnostic ($100) + 8% battery ($2,000) + 2% new solar ($8,000) = 30 + 160 + 160 = **$350 GP per shown eval**. At 65% show: $227 per booked appointment. With a rep taking 40% of net: ~$136.
C. Max CPL = booked cost x lead-to-booked: at 20% lead-to-booked -> $45 (owner-only) / $27 (with rep pay); at 30% -> $68 / $41; at 10% -> $23 / $14. Compare Meta CPL $30-120: breakeven requires >=25-30% lead-to-booked and the blended mix; a battery-only offer at 15% close and 20% lead-to-booked caps CPL at ~$39.
D. Budget reality: $25/day ≈ $750/month. At $60 CPL -> ~12 leads -> ~2.5 booked at 20% -> ~1.6 shows at 65% -> ~$570 expected GP at $350/show. Roughly break-even before owner time, and a sample too small to measure close rates (need dozens of shows).

### Gaps
- No sourced CAC for service/repair or battery-retrofit businesses; no post-2018 NREL residential CAC primary figure found.
- The owner's own show/close/diagnostic-attach rates are not in the research; these dominate the result.

## 4. California battery retrofit market: NEM 3.0, 2025 federal changes, payback, attach rate, objections, SDCP

### Takeaway
Storage attachment on new California solar rose from roughly 10-15% to ~60% in the first year of NEM 3.0 (Berkeley Lab per Solar Power World), and installers report 90%+ on new projects; the retrofit-to-existing-owner attach rate was not found. The residential 25D credit ended for systems placed in service after 12/31/2025, shifting retrofits toward leases/PPAs (48E) and state/utility incentives; SDCP offers upfront rebates plus a $0.10/kWh peak-discharge payment.

### Cited Findings
- Attachment jumped from ~10% to ~60% under NEM 3.0 (Berkeley Lab report, per author); installers anecdotally 90-95% — [Solar Power World](https://www.solarpowerworldonline.com/2024/05/berkeley-labs-report-storage-attachment-rate-nem/), [SPW Aug 2024](https://www.solarpowerworldonline.com/2024/08/california-solar-installers-get-well-acquainted-with-batteries-in-nem-3-0-era/). A SolarReviews post cites SEIA Q3 2026 CA attachment of 94% (**unverified**) — [SolarReviews](https://www.solarreviews.com/blog/us-solar-installation-hits-record-pace-battery-storage-surges)
- 25D 30% credit terminated by the OBBBA (signed July 4, 2025) for systems placed in service after Dec 31, 2025; cash/loan battery buyers in 2026 get no federal credit; lease/PPA owners may still use 48E and pass some through — [Solar Permit Solutions](https://www.solarpermitsolutions.com/blog/solar-battery-tax-credit-2026) (vendor)
- Payback claims (vendor): solar-only 9-10 yrs under NEM 3.0; adding 10-13.5 kWh battery brings it to 6-7 yrs (another vendor 8-10 yrs without credit); SGIP $150-$1,100+/kWh by tier, general tier waitlisted — [Joule](https://jouleio.com/faq/net-metering-3-0-battery-storage-payback-by-utility-2026/), [NRG](https://nrgcleanpower.com/learning-center/how-much-does-a-solar-battery-cost/)
- SDCP Solar Battery Savings Program: $0.10/kWh discharged during weekday ~4-9pm peak for ~10 years; upfront rebate $350/kWh on the program page (up to $500/kWh CARE/FERA/Communities of Concern); Enphase reports $250/kWh for batteries added to existing solar; ~5-year enrollment requirement; QuitCarbon lists a $10,000 cap — [Panasonic-hosted program page](https://solar.na.panasonic.com/homeowner/utility-programs/sd-solar-battery-savings-program?hsLang=en), [Enphase announcement](https://solarquarter.com/2025/11/06/enphase-iq-batteries-qualify-for-san-diego-community-powers-solar-battery-savings-program), [QuitCarbon](https://www.quitcarbon.com/rebates/san-diego-community-power-solar-battery-savings-rebate). **Existing-solar rate conflicts ($250 vs $350) — verify with SDCP.**

### Inferences
- Because most NEM 3.0-era systems already have batteries, the retrofit pool is mainly NEM 1.0/2.0 owners (pre-April 2023) and older systems with failed inverters, where a battery adds backup/TOU arbitrage rather than export-rate rescue; the NEM-2.0-owner pitch must also account for NEM lock-in risk (company's own notes). ASSUMPTION.
- With 25D gone, the incentive stack (SDCP, SGIP, lease/PPA 48E) is the main price lever, so incentive-qualification messaging is likely a conversion driver, but no study measuring SDCP's effect on demand was found.

### Gaps
- No data on attach rate among EXISTING solar owners (retrofit), battery retrofit demand trend post-2025, or SDCP program uptake numbers.
- No sourced best-converting objection/talk-track data; only vendor claims. (Backup power, evening bill, outage experience are plausible but unsourced.)

## 5. Operational leverage

### Takeaway
Evidence is mostly vendor claims; the most defensible levers are instant response, text/phone confirmation, and a reminder cadence. Outsourced appointment setting runs roughly $50-$200/appointment (general B2B), with no solar/AI-setter pricing found.

### Cited Findings
- Outsourced appointment setting: $50-$200/appointment outsourced vs $330-$750 in-house SDR; Philippines VA ~$32-100, US retainer providers $125-$400; pay-per-appointment $30-$150 for simple meetings; tooling $500-$2,000/month often baked in — [Stealth Agents](https://stealthagents.com/research/appointment-setting-statistics-2026), [Instantly](https://instantly.ai/blog/appointment-setter-cost-roi/) (vendors, mostly B2B)
- Appointment-set solar leads: vendor says shops with <3 setters favor appointment-set over raw — [Elevarus](https://elevarus.com/buy-solar-leads-appointment-set-vs-raw-economics/)
- Missed-call text-back and nurture claims (vendor only): see Section 2.
- Referral cost per lead ~$0-$50 (reward) vs $25-$75 paid digital (observed estimates, unaudited); pay reward within a week; ask at install completion — [Rework](https://resources.rework.com/libraries/solar-home-energy-growth/solar-referral-programs), [GetTheReferral](https://www.getthereferral.com/2026-referral-benchmark-report)
- Call recording / AI coaching, review generation: no sourced numbers found.

### Inferences
- A $100-$150 outsourced setter fee per booked appointment exceeds the break-even cost per booked in several scenarios above (e.g. battery-only at 10% close = $130), so outsourcing only pays with the blended mix or high close rates; paying only for SHOWN appointments aligns incentives. ASSUMPTION.
- Because a 40%-of-net rep pool is fixed in the company, any setter cost comes from the company's remainder; model it before hiring.

### Gaps
- No AI appointment-setter pricing or performance data; no review-generation or AI-coaching ROI data; no independent evidence on nurture-cadence uplift.

## 6. Ranking of revenue levers (reasoning, not sourced)

### Takeaway
Show rate and speed-to-lead are the cheapest gains; close rate and revenue per evaluation set the ceiling; lead volume at $25/day is the least useful lever until the funnel converts. Owner capacity is the binding constraint.

### Cited Findings
- Speed-to-lead and confirmation/show-rate benchmarks as above (Sections 1-2). No source ranks levers.

### Inferences
1. **Speed-to-lead + instant booking link** (automation, minutes-level text): largest relative effect per the 2007/Velocify direction; costs near zero.
2. **Show rate**: confirmation text + reminders (+ call for high-value) — expected 25-30% relative no-show cut (healthcare-based); costs near zero.
3. **Revenue per evaluation**: sell diagnostic fee + battery/solar upsell on the same visit; GP per shown eval (~$350 blended vs $30 for diagnostic alone) swings break-even CPL several-fold.
4. **Close rate / proposal quality**: matters most for the $2k and $8k lines, but sample size is small at $25/day.
5. **Capacity (owner time)**: each eval consumes owner hours; if booked > capacity, extra leads are wasted. Setters/outsourcing help only after 1-3 work.
6. **Lead volume**: increase only once cost per show < GP per show with margin.
7. **Referral program**: cheapest CAC and highest close rate (vendor-claimed), but needs a base of closed customers.

### Gaps
- Needs the owner's actual funnel numbers (lead->contact, contact->booked, show, diagnostic attach, close by product, hours per eval) to turn this ranking into dollar targets; the break-even tables above should be re-run with them.
