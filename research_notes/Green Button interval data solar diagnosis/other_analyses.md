# Other valuable analyses on SDG&E Green Button interval data (beyond inverter sizing / fault detection)

Method note: 8 web searches (snippets only, no page fetches). Sourced facts are cited; the analysis designs are my inferences and are labelled so. Many SDG&E-specific figures could NOT be verified; see Gaps.

## 1. What data does SDG&E Green Button actually give (data quality, pitfalls)

### Takeaway
Green Button Download gives up to 13 months of meter data after login, but sources conflict on whether residential gets 15-min or hourly resolution, and none confirm how SDG&E labels delivered/received (net-metering) channels. Check a real export before building the parser.

### Cited Findings
- SDG&E file holds up to 13 months of Smart Meter usage; electricity via Download My Data and Connect My Data; login required — [SDG&E Green Button](https://sdge.com/node/6181)
- Resolution conflict: one guide says residential = hourly, commercial = 15-min; another says user can pick 15-min or hourly and CSV or XML (ESPI) — [Nectar SDG&E guide](https://nectarclimate.com/utilities/san-diego-gas-electric-sdge); [Nectar SDCP guide](https://nectarclimate.com/utilities/san-diego-community-power)
- The Green Button standard supports net metering by marking readings as "net" and meters forward/reverse flow (generic, not SDG&E-specific) — [OEB/MissionData Green Button presentation](https://www.oeb.ca/sites/default/files/green-button-taskforce-meeting3-presentation-MissionData-20210805.pdf)
- Third-party (EnergyToolBase) has published guidance on using interval meter data in solar PV project analysis and updated Green Button instructions — [EnergyToolBase](https://www.energytoolbase.com/newsroom/blog/TheValueOfIntervalMeterDataInSolarPvProjectAnalysis)
- CalTRACK/OpenEEmeter assumes data cleaning (missing data, etc.) has been done before modelling — [Recurve CalTRACK hourly](https://recurve.com/how-it-works/caltrack-hourly-methods)

### Inferences
- Pre-checks to run on every upload (all standard practice, not sourced): expected interval count (96/day; 92/100 on DST days — spring-forward/fall-back; parse timestamps with tz, never naive); gaps and zero-fill vs null; duplicate intervals; negative values (a net-export channel vs separate delivered/received); estimated-read flags if present (ESPI has quality flags — verify SDG&E populates them); unit (Wh vs kWh); date range < 12 months → seasonal analyses (true-up, HVAC) become extrapolations; hourly vs 15-min detection from median step. Refuse or downgrade confidence when coverage < ~90% of a month.
- Hourly data blurs EV 6–9 kW blocks and cycling loads less than it blurs 15-min spikes; peak kW from hourly data understates true 15-min demand.

### Gaps
- No SDG&E-confirmed column layout for delivered/received/net channels; whether net-metered homes get separate import and export columns vs one net value. Must inspect a real sample export.

## 2. Battery sizing and value (evening peak, arbitrage, backup, Powerwall count)

### Takeaway
The strongest add-on analysis: from net import/export intervals compute 4–9 pm grid import kWh (what a battery can displace), midday export kWh (what can be shifted), and size PW3 count by both energy and 11.5 kW power; value it differently under NEM 1/2 (retail-ish credits) vs NBT (low export credit, high evening import cost).

### Cited Findings
- PW3: 13.5 kWh, 11.5 kW max continuous AC discharge, 5 kW AC charge limit, up to 20 kW STC solar input, six MPPTs, up to 4 units in parallel (2024 datasheet; 2023 revision differs on MPPT voltage/LRA) — [Tesla PW3 datasheet](https://digitalassets.tesla.com/tesla-contents/image/upload/powerwall-3-datasheet-na-en.pdf); [revision notes via search](https://digitalassets.tesla.com/tesla-contents/image/upload/Powerwall_3_Datasheet_NA-EN_53.pdf)
- Round-trip efficiency ~89–90% is third-party only, no official Tesla figure found — [Clean Energy Reviews](https://www.cleanenergyreviews.info/blog/tesla-powerwall-3-review)
- SDG&E TOU-DR1 2026 (per one installer blog, unverified against tariff): summer on-peak $0.69654, off-peak $0.47560, super-off-peak $0.38818; winter on-peak $0.62200, off-peak $0.54019, super-off-peak $0.44933/kWh; another site gives ~56¢ on-peak — conflict — [Stellar Solar TOU 2026](https://stellarsolar.net/2026/03/02/sdge-tou-rates-in-2026-everything-you-need-to-know/); [electricchoice](https://www.electricchoice.com/electricity-prices-by-state/california/san-diego/)
- NBT exports are credited at CPUC Avoided Cost Calculator hourly values, usually below retail but sometimes above retail on late-summer evenings; a vendor table lists ~3.7¢/kWh average SDG&E export, no ACC Plus adder for SDG&E (secondary source) — [CPUC NEM page](https://www.cpuc.ca.gov/NEM); [EnergyToolBase](https://www.energytoolbase.com/?p=2400)
- SDCP Solar Battery Savings (Tesla VPP): upfront payment + performance payment for discharge in a pre-set 2-hour window; must stay enrolled 5 years; no grid charging for compliance; not stackable with ELRP/DSGS; all per third-party/Tesla pages — [Tesla SDCP VPP](https://www.tesla.com/support/energy/virtual-power-plant/sdcp); [Stellar Solar PW3 rebates](https://stellarsolar.net/2026/04/29/tesla-powerwall-3-rebates-in-2026-what-san-diego-homeowners-actually-qualify-for/)

### Inferences (design)
- Inputs: 15-min net kWh (import, export), TOU schedule (4–9 pm on-peak), rate table. Outputs: avg/95th-percentile 4–9 pm import kWh per day by season; midday export kWh per day; "shiftable kWh" = min(evening import, exportable surplus, usable battery). Units for energy = ceil(p80 evening import ÷ ~12 kWh usable-after-reserve); units for power = peak evening import kW ÷ 11.5 (per unit). Note: with solar behind the meter, evening import ≈ evening gross load only after solar goes to zero (~after 6–7 pm in summer, earlier in winter), so evening-import is a reliable load measure; midday load is not visible.
- Value NEM 1/2: arbitrage ≈ (peak retail − the retail value the export would have earned) — small because exports already earn near retail; battery mostly backup + VPP. Value NBT: shifted kWh × (on-peak import avoided − low export credit) × efficiency; this is the large case. Show both with the customer's actual tariff; label rates "illustrative, verify against current tariff".
- Backup estimate: overnight/baseload kW and evening average kW give hours of autonomy per PW3; whole-home peak kW (15-min max, likely understated) vs 11.5 kW per unit; interval data cannot see motor starting surge (PW3 LRA 150–185 A per revision).
- VPP: potential discharge in the SDCP event window can be bounded by evening load; this is a rough upper bound.

### Gaps
- Official SDG&E TOU-DR1/DR-P tariff rates and current SDG&E hourly NBT export values not verified (tariff book / export pricing files not fetched). SDCP incentive amounts ($/kWh, upfront) conflicting/third-party. No SDCP official page found.

## 3. NEM true-up modelling and deriving consumption/production

### Takeaway
Interval net data supports: net annual import/export, an estimated true-up/annual bill, and a worst-month cash-flow view; gross consumption and gross production are NOT directly observable behind the meter and must be inferred or supplemented (inverter portal data, modelled yield).

### Cited Findings
- NEM 2.0 customers keep the tariff 20 years from interconnection or may switch; NBT legacy is 9 years; NEM 2.0 requires a TOU rate — [Stellar Solar SDG&E net metering](https://stellarsolar.net/2026/03/02/sdge-net-metering-in-2026-rate-structures-explained/)
- Net surplus at annual true-up is paid at wholesale-based rates under NEM 2.0 and NBT; non-bypassable charges are computed on net hourly consumption under NEM 2.0 but on all imports under NBT — [CPUC NEM/NBT comparison](https://www.cpuc.ca.gov/NEM); [CPUC webtraining](https://webtraining.cpuc.ca.gov/industries-and-topics/electrical-energy/demand-side-management/customer-generation/net-energy-metering-and-net-billing)
- Prior (project CLAUDE.md, not external): surplus valued ~$0.04/kWh at true-up in the existing proposal tool.

### Inferences
- Compute: net annual = Σimport − Σexport; monthly running balance in $ (NEM credits at TOU rates, then true-up); show "bill by month" and the March-style big true-up. NEM 1.0 (older, volumetric/tiered netting) vs 2.0 differ — detect tariff from the account's rate/interconnection date, don't infer from data.
- What is derivable: net load; evening/night import ≈ gross load; sunrise/sunset-edge exports; minimum midday net = production − load lower bound. Gross production = hard; estimate with pvlib/PVWatts-type model from permit kW and local weather, or get inverter monitoring export. Gross consumption ≈ import + (modelled production − export) with error equal to model error (typically ±10–15% annual, unsourced).
- With <12 months of data, true-up is an estimate; use CalTRACK-style weather normalisation (below) to extrapolate.

### Gaps
- NEM 1.0 specifics for SDG&E (tiered netting, no TOU requirement) and current SDG&E true-up surplus rate not searched.

## 4. Load-shape insights (baseload, HVAC, EV, pool pump, electrification headroom)

### Takeaway
Standard, feasible load disaggregation on 15-min net data; works best in the hours solar is off (night, early morning, evening).

### Cited Findings
- CalTRACK hourly models combine temperature, occupancy and 168 time-of-week terms with month-by-month fits (OpenEEmeter reference implementation) — [Recurve CalTRACK hourly](https://recurve.com/how-it-works/caltrack-hourly-methods); [eemeter docs](https://eemeter.readthedocs.io/)

### Inferences (design; nothing here is externally sourced)
- Baseload = 10th-percentile overnight (e.g., 1–5 am) import kW; "lost dollars" = baseload × 8,760 × rate; flag > ~0.6 kW as high (threshold is a rule of thumb — flag uncertain).
- HVAC: regress daily/hourly import on outdoor temperature (CDD/HDD, NOAA/NSRDB temp); cooling slope kW/°F and balance point; evening cooling peaks drive 4–9 pm cost → battery case.
- EV: repeating 6–11 kW rectangles of 2–6 h at night (Level 2) detected by step-change events (>5 kW rise within one interval, plateau, drop); existing EV → note EV-TOU-5 rate fit; no EV → headroom for EV (surplus kWh ÷ ~3.5 mi/kWh, ~30–35 kWh/100 mi hence value of surplus at true-up vs avoided gas).
- Pool pump: daily repeating 1–2 kW block, same start time, 4–8 h; shiftable to super-off-peak/midday.
- Electrification headroom: surplus export (annual) vs heat-pump/EV/HPWH load estimates; under NBT surplus export is worth little, so using it on-site is worth more — pitch.
- Accuracy: net metering masks daytime loads (cannot see AC at noon); disaggregation is a heuristic, show "likely", not fact.

### Gaps
- No published SDG&E-specific validated NILM accuracy; no source for baseload thresholds.

## 5. Peak demand / interconnection (200 A MSP)

### Takeaway
Max 15-min import kW versus panel rating gives a rough headroom check, but interval data under-represents instantaneous peaks.

### Cited Findings
- PW3 specs relevant to panel math: 11.5 kW AC discharge, 5 kW charge (above Tesla datasheet). No source found on NEC 220.87 / 705.12 (120% rule) in this session.

### Inferences
- 200 A × 240 V = 48 kW nameplate; NEC 220.87 allows using 12-month recorded peak demand (+25%) to prove existing load — interval data is exactly that evidence (from general knowledge, needs verification vs current NEC edition / SDG&E rules; AHJ-dependent). Compute: p100 15-min import kW × 1.25 + new loads (EV 7.7–11.5 kW, heat pump, PW3) vs 48 kW; also the 120% busbar rule for backfed breakers (705.12), which interval data cannot answer (needs MSP photo: bus rating, breaker).
- Caveat: 15-min average < instantaneous peak; solar masks load so peak true load is higher than net import peak midday. Do not state "OK/not OK" — state "likely no panel upgrade needed pending site check".

### Gaps
- NEC citations unsourced here; verify before customer-facing claims.

## 6. DER mismatch / was the system ever performing (production vs permit size)

### Takeaway
Compare observed behaviour to expected yield from permit kW using a modelling library; interval net data alone gives lower bounds, so best with inverter-portal data.

### Cited Findings
- pvlib is a Python package derived from Sandia's PVLIB; supports annual-yield workflow with SAM module/inverter libraries; not browser-native — [pvlib docs](https://pvlib-python.readthedocs.io/en/v0.11.2/user_guide/introtutorial.html); [Finxter overview](https://blog.finxter.com/pvlib-python-a-comprehensive-guide-to-solar-energy-simulation/)
- Prior project note: ~1,600 kWh/kW-yr yield assumption used in existing tools (CLAUDE.md, project-internal).

### Inferences
- Expected production = permit kW × specific yield (~1,500–1,700 kWh/kWp/yr coastal/inland San Diego; flag uncertain) shaped by clear-sky model (pvlib `Location.get_clearsky` + simple tilt/azimuth, or NREL PVWatts API server-side). Compare to: (a) peak midday export vs expected output minus plausible load — if export peak ≪ expected, suspicious; (b) day-to-day clear-day midday export consistency (drop-offs = string outages); (c) year-over-year change (degradation >1%/yr, step changes after a date → event date for warranty).
- Over/undersizing: annual expected production vs annual net+estimated gross consumption (offset ratio). Report ratio with error band.
- NEM 1/2 vs NBT: a system sized for 100% offset behaves differently economically.
- Accuracy: needs correct tilt/azimuth/shading (get from Google Solar API / permit); unknown load hides production.

### Gaps
- No searched source for San Diego specific yield or PVWatts/NSRDB/PVGIS API CORS/key details (search returned only pvlib docs).

## 7. Customer-facing outputs that convert

### Takeaway
Few, plain visuals tied to dollars.

### Inferences (design, unsourced)
- Chart 1: average day, 3 stacked areas (solar export, evening import, overnight base) with 4–9 pm band shaded and rate labelled. Chart 2: monthly net import/export bars + estimated bill. Chart 3: "evening grid purchases" dollars per year (= Σ 4–9 pm import × on-peak rate) → "what a battery could displace". "Lost dollars": (a) baseload waste, (b) exported kWh × (retail − export credit) under NBT, (c) production shortfall kWh × rate if a fault is suspected.
- Always show ranges and "estimate" labels; avoid precise savings from <12 months data.

## 8. Libraries and where to run (browser vs serverless)

### Takeaway
Rate/arbitrage/true-up/load-shape logic is simple array math, doable in browser JS; weather-regression (CalTRACK) and pvlib are Python → serverless function.

### Cited Findings
- OpenEEmeter (eemeter) is Python, includes CalTRACK daily, billing and hourly reference implementations; contributed to LF Energy 2019; weather via eeweather; assumes pre-cleaned data; hourly viz less mature — [eemeter docs](https://eemeter.readthedocs.io/); [Recurve CalTRACK hourly](https://recurve.com/how-it-works/caltrack-hourly-methods); [LF Energy](https://lfenergy.org/?p=6884)
- pvlib-python is Python only — [pvlib docs](https://pvlib-python.readthedocs.io/en/v0.11.2/user_guide/introtutorial.html)

### Inferences
- Browser JS (no deps): parsing CSV/ESPI XML, QA checks, TOU bucketing, evening-peak stats, battery sizing, true-up, EV/pool event detection, charts — keeps customer data client-side (privacy). Heavier items (weather regression, clear-sky model) in a Netlify function calling NREL PVWatts / NSRDB / NOAA APIs (key stays server-side; Python functions not native on Netlify — use a JS port of the PVWatts formula or call the NREL API from the existing Node function pattern). Not verified: CORS behaviour of NREL/PVGIS APIs.

### Gaps
- Did not verify NREL PVWatts/NSRDB/PVGIS API terms or any JS clear-sky library.

## Overall Gaps (for the report writer)
- No primary SDG&E tariff pages fetched; rate numbers come from installer blogs and conflict (TOU-DR1 ~70¢ vs ~56¢ summer on-peak). Verify on SDG&E's Total Rates Table and Export Pricing files before use.
- SDG&E Green Button resolution (15-min vs hourly residential) and net-channel labelling unconfirmed.
- NBT vs NEM non-bypassable charge dollar figures, SDCP incentive current terms, CPUC D.22-12-056 text were not retrieved directly.
- NEC panel-capacity rules cited from general knowledge only.
