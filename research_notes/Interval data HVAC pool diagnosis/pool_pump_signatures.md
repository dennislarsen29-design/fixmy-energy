# Pool pump and pool-equipment signatures in household 15-minute interval data

Research limits: 6 searches, 2 fetches (both failed, link.springer.com and pure.fh-salzburg.ac.at are not in the session's allowed domains). Everything below comes from search-result snippets, not full-text reading. Primary papers were NOT read in full.

## 1. Electrical signatures of pool pumps (single/two/variable speed, heaters, boosters, salt) in 15-min data

### Takeaway
Pool pumps are long-duration, flat, scheduled loads (hours at a steady kW), so they are visible at 15-min resolution; a single-speed pump is roughly 1.4-2 kW, a variable-speed pump 0.18-1.2 kW depending on speed. I found no authoritative source for booster pumps, heaters or salt chlorinators.

### Cited Findings
- Hydro-Quebec's calculator (which says it uses California Title 20 system curve A) assumes a single-speed pump at 1,390 W, a two-speed at 323 W low / 1,390 W high, and a variable-speed at 178 W low / 1,217 W high for a 16x32 ft in-ground pool. Run-time assumption: single-speed 24 h/day for 150 days; two-speed 23 h low + 1 h high. Canadian, unheated pool, so a proxy only. — [Hydro-Quebec](https://www.hydroquebec.com/residential/energy-wise/pools/efficient-pumps.html)
- PNNL says single-speed pumps run at least 5-6 h/day, if not around the clock, and puts a 1.5 hp single-speed at about 2,000 W. — [PNNL BASC](https://basc.pnnl.gov/resource-guides/variable-speed-pool-pumps) (2 kW figure via search summary)
- Clean Energy Connection example: single-speed about 12.6 kWh/day (6.3 h run) vs variable-speed about 2.2 kWh/day, about 3,796 kWh/yr saved, at 34.26 c/kWh (Apr 2024). — [Clean Energy Connection](https://cleanenergyconnection.org/article/variable-speed-pool-pumps-really-do-save-you-money-heres-how)
- California Title 20: single-speed residential filtration pumps of 1 total hp or more cannot be sold or installed; pumps must have at least two speeds, low speed no more than half max rotation rate (cited to Title 20 CCR 1601-1609 by one manufacturer page; CEC workshop deck lists the same). — [Inyo Pools](https://inyopools.com/blog/?p=78214), [CEC document](https://efiling.energy.ca.gov/GetDocument.aspx?tn=212254), [Clean Energy Connection](https://cleanenergyconnection.org/service/variable-speed-pool-pumps)
- A Bidgely patent describes detecting a pool pump schedule from multi-day consistent start/stop times and notes longer run times in the warm season. — [USPTO 10630502](https://patents.justia.com/patent/10630502)

### Inferences
- In 15-min kWh a 1.4-2 kW single-speed pump = about 0.35-0.5 kWh per interval, a flat block of several hours; a variable-speed pump on low speed = about 0.05 kWh per interval (near the noise floor of fridge/standby loads), so low-speed variable pumps are hard to see but high-speed boost periods (about 0.3 kWh/interval) are visible.
- Two-speed pumps should show a long low plateau plus a shorter high block; variable-speed should show multiple small steps. These shapes are my inference from the nameplate-style numbers, not from published interval traces.

### Gaps
- No source found for pool heater (electric resistance or heat-pump), booster pump (cleaner) or salt chlorinator kW and schedules. Typical engineering values exist but I did not verify any.
- No SoCal-measured run-hour distribution (CEC pool pump docket 15-AAER-02 is the place to look; not read).

## 2. Published methods/products for detecting pool pumps from interval data; reported accuracy

### Takeaway
Academic work shows pool pumps can be detected from 15- and 30-min data; Bidgely patents claim it for AMI data, but no vendor accuracy for pool pumps was found.

### Cited Findings
- Burkhart et al. (IEEE, 2018): extracted filter-pump consumption from 15-min EU smart-meter data, 843 households, 94.8% detection accuracy but 68.5% precision with an off-the-shelf classifier; authors raise privacy concerns. — [FH Salzburg record](https://pure.fh-salzburg.ac.at/en/publications/detecting-swimming-pools-in-15-minute-load-data/) (abstract via search snippet; full text unread)
- PUMPNET (Energy Informatics, 2021): reshapes half-hourly kWh into a date-time image and uses a U-shaped CNN to flag pump operation across thousands of homes. — [Springer](https://link.springer.com/doi/10.1186/s42162-020-00135-3), [UTS](https://opus.lib.uts.edu.au/handle/10453/156678). Accuracy figures not retrieved. Note it concerns pump operation in a (likely Australian) pool context; verify.
- Bidgely patents (10114347, 10630502, 11533193) describe pool pump detection/estimation from 15/30/60-min AMI data, even without prior knowledge a pool exists, and admit AMI disaggregation cannot cover 100% of a home. — [USPTO 10630502](https://patents.justia.com/patent/10630502), [10114347](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10114347)
- Bidgely's published ">90%" accuracy claim is for solar and EV detection, not pool pumps. — [Bidgely grid planning sheet](https://go.bidgely.com/rs/492-VKN-623/images/EA-Grid-Planning.pdf)
- Bidgely whitepaper notes coarser intervals blur appliance start/stop signatures into indistinguishable bumps. — [Bidgely TOU whitepaper](https://go.bidgely.com/rs/492-VKN-623/images/Bidgely-TOU-Whitepaper.pdf)

### Gaps
- No Sense or Opower pool-detection claims found; Sense is not a 15-min-AMI product anyway (unverified).
- No SDG&E/SCE load research report on pool pumps found.
- Precision of 68.5% in the 15-min study means roughly 1 in 3 flagged homes would be a false positive; an applicable caveat but derived from one snippet.

## 3. Which anomalies are inferable vs not

### Takeaway
Schedule-type anomalies (24/7, peak-hour running, run-hour changes) are plausibly inferable; mechanical diagnoses (motor wear, clogged filter, air leak) are not supported by any source I found.

### Cited Findings
- Single-speed pumps often run around the clock (PNNL, above), so "24/7" is a recognizable pattern that Bidgely-type consistent-schedule detection covers. — [PNNL](https://basc.pnnl.gov/resource-guides/variable-speed-pool-pumps), [patent](https://patents.justia.com/patent/10630502)
- SDG&E peak is 4-9 pm; since 1 May 2026 weekday 10 am-2 pm is super off-peak year-round, and pool pumps are named as a good fit for that window. — [UCAN](https://www.ucan.org/sdge-offers-new-super-off-peak-period-from-10-a-m-to-2-p-m-weekdays-year-round/), [Hoodline](https://hoodline.com/2026/04/sdg-e-daytime-power-plunge-gives-san-diego-a-midday-break/), [Utility Dive](https://utilitydive.com/news/california-regulators-propose-shifting-peak-period-for-sdge-tou-rates/448835) (Hoodline is a local news aggregator; confirm the rate period on SDG&E's site)

### Inferences
- Inferable: pump on during 4-9 pm; run hours far above typical (continuous 24 h); a step change in daily pump kWh at the same schedule (could indicate a speed/timer change or a replaced pump).
- Weakly inferable: a gradual rise in per-interval kW over months at the same schedule could suggest a clogged filter/wear, but filter pressure, flow, temperature and heater use also change it. I found no study validating this; treat as hypothesis only.
- Not inferable: air in system, leaks, impeller damage, pump vs. motor failure. Water loss and flow cannot be seen in kWh.

### Gaps
- No published validation of motor-wear or clog detection from household interval data.

## 4. Savings potential and incentives (CA)

### Takeaway
Variable-speed retrofit savings are large against a long-running single-speed pump but sources disagree widely (20% to 90%). I could not confirm any current SDG&E or SDCP pool pump rebate.

### Cited Findings
- ENERGY STAR fact sheet (2014 era): variable-speed about 2,800 kWh and $340 saved/yr, 70% less energy, 1.6-year payback, California utility incentive $100. — [ENERGY STAR](https://www.energystar.gov/sites/default/files/asset/document/ES%20pool%20pump%20factsheet_080514_v5_0.pdf)
- Current ENERGY STAR pages conflict: one says about 20% less energy and about $50/yr; another says up to 65% less and up to $450/yr. — [ENERGY STAR](https://www.energystar.gov/node/10446) (conflict; unreconciled)
- PNNL: 50-90% reduction in pool pump energy. — [PNNL](https://basc.pnnl.gov/resource-guides/variable-speed-pool-pumps)
- SDG&E offered a $200 point-of-sale markdown on ENERGY STAR variable-speed pumps 1-3 hp, expiring 19 Jul 2021; required replacement of a single/two-speed pump, existing single-family pools only, program required running outside 4-9 pm; no online purchases. — [SDG&E 2021 product list](https://www.sdge.com/sites/default/files/sdge-pool-pump-store-and-product-list_may_6_2021_final.pdf), [SDG&E 2020 eligibility](https://www.sdge.com/sites/default/files/documents/Pool_Pump_eligibility_Feb_18_2020.pdf?nid=15391)

### Inferences
- Because California already bans new single-speed 1+ hp sales, many replacement candidates are old installs or two-speed pumps, which narrows the savings case versus the ENERGY STAR 70% figure.
- Daily savings scale with current run hours; a 24/7 single-speed pump is the best-case candidate.

### Gaps
- No current (2025-2026) SDG&E, SDCP, or state pool pump incentive confirmed. SDG&E's 2021 rebate is expired. No SDCP program found. Verify with SDG&E/SDCP directly.
- Federal 25C/other tax credits for pool pumps not researched.

## 5. Confounders

### Takeaway
Not covered by any source I retrieved; the points below are inference only.

### Inferences
- Solar: daytime pool load is netted against production, so net interval data may show a pump block only as reduced export or unchanged import on sunny days; Green Button import/export channels or a production-side meter are needed. (Consistent with the portal's existing note that export = production minus house load.)
- A/C, EV charging and heat-pump heaters also create multi-kW blocks; overnight EV charging and midday pool run are separable by schedule but overlapping times are ambiguous.
- Seasonality: pump run hours are longer in warm months (noted in the Bidgely patent), so compare same-season data only.
- Burkhart's 68.5% precision suggests false positives from other timed loads.

### Gaps
- No source quantifying solar masking effects on pool detection; no SoCal-specific study of confounder impact.
