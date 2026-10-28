# Solar masking in SDG&E Green Button interval data

Method note: WebSearch worked; WebFetch failed (DNS blocked) for sdge.com, nectarclimate.com, energytoolbase.com. All findings below are from search-result summaries only, not full-page reads. Treat as leads to confirm with a real SDG&E file.

## 1. What an SDG&E Green Button download contains for a NEM customer

### Takeaway
SDG&E says its Green Button file holds up to 13 months of hourly or 15-minute usage, in CSV or XML. I could NOT verify whether a NEM customer's file has separate delivered/received (import/export) columns or a net value, nor the exact column names, units, or time-zone/DST handling.

### Cited Findings
- SDG&E's Green Button page: file holds up to 13 months of smart meter usage at hourly or 15-minute intervals; download only via secured My Account login; both Download My Data and Connect My Data offered — [SDG&E Green Button](https://sdge.com/node/6181) (as summarized by search; page not fetched)
- Third-party steps: Usage tab, pick electric meter, Green Button download, choose range up to 13 months, 15-min or hourly, CSV or XML — [Baker Home Energy](https://bakerhomeenergy.com/sdge-share-your-bill-and-green-button) (third party; steps from search summary)
- One guide: Green Button icon = XML, disk icon = CSV; ~365 days suggested — [Energy Toolbase](https://energytoolbase.com/newsroom/Blog/we-updated-our-green-button-data-instructions) (via search summary)
- Separate SDG&E "export data" table (not the Green Button file) has columns Date, Start Time, Export kWh, Delivery Export Price/Credits, Generation Export Price/Credits — [SDG&E Understanding Your Export Data](https://www.sdge.com/sites/default/files/documents/Understanding%20Your%20Export%20Data%20and%20Pricng%20-%20Non-CCA.pdf)
- Oracle's Green Button docs: solar import and export columns appear in the exported file only when the utility is on the latest data-transfer specifications (vendor implementation note, not SDG&E) — [Oracle](https://docs.oracle.com/en/industries/energy-water/business-customer-engagement/business-energy-management-configuration/green-button---download-my-data.html)
- ESPI XML: values are integers scaled by powerOfTenMultiplier; uom 72 = Wh in PG&E docs; sample ReadingType shows flowDirection field; residential smart-meter typical intervalLength 3600 (SDG&E may use 900) — [Green Button Alliance](https://greenbuttonalliance.org/poweroftenmultiplier); [PG&E data elements](https://PGE.com/assets/pge/docs/save-energy-and-money/energy-savings-programs/Supported-Data-Elements-Click-Thru-2.0.pdf)
- NEM vs NBT billing: CPUC comparison lists NEM 1.0/2.0 with annual true-up; NBT nets in each metered interval (CPUC table: 1 hour residential, 15 min nonresidential — conflicts with 15-min framing, unresolved) — [CPUC NEM](https://cpuc.ca.gov/nem); [Redwood Energy](https://redwoodenergy.org/?p=18969)
- SDG&E export pricing varies in 15-minute intervals and credits = export kWh x interval price (ACC-based) — [SDG&E export data guide](https://www.sdge.com/sites/default/files/documents/Understanding%20Your%20Export%20Data%20and%20Pricng%20-%20Non-CCA.pdf)

### Inferences
- Because NBT credits exports per interval, SDG&E must hold separate export kWh per interval, so NBT customers' interval data very likely carries an export channel; NEM 1.0/2.0 files may be the same meter data but this is unconfirmed.
- Parse defensively: handle both a single signed net column and separate delivered/received columns; check flowDirection and powerOfTenMultiplier in XML.

### Gaps
- Exact SDG&E CSV header names, units (kWh vs Wh), whether export is a column or a negative value — could not fetch any sample file or spec.
- Time-zone and DST convention in SDG&E files — no source found.
- Differences in file content between NEM 1.0/2.0 and NBT — no source found.
- Whether 15-minute granularity is available for all residential meters (SDG&E says "hourly or 15-minute").

## 2. Which analyses stay valid when solar self-consumption is hidden

### Takeaway
Net/import-export data hides daytime household load whenever the sun is up; sources I found confirm PV degrades non-PV disaggregation especially in daytime. Night/early-morning import is the clean window; daytime load and true production cannot be read directly.

### Cited Findings
- PV generation is invisible to utilities behind the meter; they see only net load — [NREL research hub](https://research-hub.nrel.gov/en/publications/estimation-of-behind-the-meter-solar-generation-by-integrating-ph-2/)
- PV generation can degrade non-PV-oriented disaggregation methods, especially during the day — [Monash/C4NET WP1.2 PV](https://c4net.test.slickdesign.au/wp-content/uploads/2023/07/WP-1.2-PV-Disaggregation-and-Aggregation-Monash-University.pdf)

### Inferences
- Valid (by logic, not directly sourced): import in dark hours (roughly after sunset to before sunrise); year-over-year comparisons of the same hours/months at the same install state; evening ramp import.
- Not valid: inferring HVAC/pool/appliance load from midday net values; treating export as production (export = production minus simultaneous house load); comparing summer to spring using daytime data.
- Pool pumps run mostly daytime, so a pool-pump signal is largely masked.

### Gaps
- No source found quantifying how much load is hidden or ranking valid analyses; the valid/invalid split above is reasoning.

## 3. Estimating BTM solar and gross load from net data

### Takeaway
NREL-coauthored unsupervised methods pair a physical PV model with a statistical load model; published error improvements are relative, and I did not find absolute typical error.

### Cited Findings
- 2019 SmartGridComm (Kabir, Yu, Yao, Yang, Zhang): iteratively estimates PV with a physical model and load with HMM regression; 44% lower MSE than prior state of the art — [NREL](https://research-hub.nrel.gov/en/publications/estimation-of-behind-the-meter-solar-generation-by-integrating-ph-2/)
- IEEE Trans. Sustainable Energy extension: joint community estimation with mixed HMM, also recovers PV parameters; 67% error reduction vs prior methods; tested on Austin, TX homes — [NREL](https://research-hub.nrel.gov/en/publications/joint-estimation-of-behind-the-meter-solar-generation-in-a-commun-2/)
- Supervised approaches need historical PV and load per customer, usually unavailable — same NREL page
- 2023 IEEE (Pu, Zhao): net load plus public irradiance/temperature, exploits self-similarity and cross-customer similarity; NY and Texas data — [UCR paper page](https://intra.ece.ucr.edu/~nyu/papers/2019-BTM-Solar-Estimation) (listing; details not read)
- Game-theoretic BTM disaggregation — [arXiv 1907.06747](https://arxiv.org/pdf/1907.06747)

### Inferences
- A single-home tool lacks cross-customer data, so it can only do clear-sky/PVWatts-style scaling with known system size; error will be large on cloudy days.

### Gaps
- Absolute error (kWh or %) for any method; PVWatts/neighboring-day matching accuracy — not found. Papers' full text not read.

## 4. EV charging and failed strings/inverters

### Takeaway
EV charging is detectable from overnight steps with moderate accuracy on hourly data and better on 15-minute; a meter cannot separate a failed string from an inverter or weather issue.

### Cited Findings
- Hourly data (SINTEF, Norway): balanced models ~75% EV detection at 35% false positives; tuned up to 90% at 10% — [SINTEF](https://sintef.brage.unit.no/sintef-xmlui/handle/11250/2618624)
- Unsupervised BTM EV detection on 15-min data (Austin): detect presence, charging rate, charging periods, no ground truth — [Stony Brook](https://researchconnect.stonybrook.edu/en/publications/behind-the-meter-disaggregation-of-residential-electric-vehicle-c/)
- Disaggregating EV charging without ground truth is very challenging; daytime PV hurts — [Monash WP1.2](https://c4net.test.slickdesign.au/wp-content/uploads/2023/07/WP-1.2-PV-Disaggregation-and-Aggregation-Monash-University.pdf)
- Bidgely claims ~90% for solar and net-metered EV detection (vendor marketing, unverified) — [Bidgely](https://go.bidgely.com/rs/492-VKN-623/images/EA-Grid-Planning.pdf)
- Fault detection uses inverter AC data (5-min power + system metadata): major underperformance <60% of expected for 3 non-cloudy days, minor <80% for 7 days; 1,000+ systems — [pv magazine Feb 2026](https://www.pv-magazine.com/2026/02/20/how-to-detect-pv-system-underperformance-using-only-ac-side-inverter-data/); AC-only flags zero generation/tripping; string faults need DC data — [pv magazine 2024](https://pv-magazine.com/2024/05/03/researchers-roll-out-algorithms-to-detect-underperforming-rooftop-pv-panels)

### Inferences
- Typical Level 2 charging is a flat multi-hour step of several kW at night; look for a repeating block above baseload. Export-peak drops suggest, but cannot prove, a partial fault; a 15-min meter cannot say which string.
- Thresholds from the AC-only method are a reasonable analogue but meter export mixes in house load.

### Gaps
- No source on meter-only (net export) fault detection specifically; no EV step-size thresholds from a California source.

## 5. Data quality traps

### Takeaway
Expect DST gaps/duplicates and possible estimated reads; I found no SDG&E-specific documentation.

### Cited Findings
- Interval files conventionally have 92 intervals on spring-forward, 100 on fall-back, 96 otherwise; missing reads should be blank not zero (ERCOT spec) — [ERCOT](https://www.ercot.com/files/docs/2015/12/08/interval_data_file_format_descriptions.doc)
- Utilities may store standard time to avoid duplicate/missing intervals — [Oracle](https://docs.oracle.com/en/industries/energy-water/customer-care-billing/24a/ccbcs-user-guides/Topics/C1_BP11IntervalBilling_Seasonal_Time_Shifts.html)

### Inferences
- Parse timestamps as tz-aware; count intervals per day; flag days with <96 (excluding DST) as partial; treat zeros during daylight as possible missing/outage.

### Gaps
- Whether SDG&E marks estimated reads; SDG&E's actual DST handling; partial first/last day behavior — no source found.
