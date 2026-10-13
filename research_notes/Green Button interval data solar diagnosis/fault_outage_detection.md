# Detecting solar faults, downtime, restarts and degradation from 15-minute smart-meter (Green Button) data

Scope: residential rooftop PV, California/San Diego, 15-min import/export. Method labels: **[EST]** = established/peer-reviewed or manufacturer-documented; **[HEUR]** = my engineering heuristic, not validated in a cited source. Research used ~14 searches; mostly search snippets, not full-paper reads (stated where it matters). Several expected primary sources were not found (see Gaps in each section).

## 1. Signature of a fully down inverter, and separating it from cloud, low load, vacation and grid outage

### Takeaway
A dead inverter shows as export ~0 and midday import that looks like the night/base load, on days when a clear-sky or irradiance reference says there should be strong generation. The discriminating evidence is an external irradiance/clear-sky reference (to exclude cloud) plus the shape of the day (a cloudy day still has a bell-ish, noisy export; a dead system has none). A true grid outage is zero import AND zero export (meter sees no energy). No peer-reviewed paper found that does exactly this for a single home from AMI data; the approach below is assembled from adjacent literature.

### Cited Findings
- Smart meters record only net grid flow, so PV generation is not directly measured and must be inferred — [Oxford (Abate) paper](https://www.cs.ox.ac.uk/people/alessandro.abate/publications/BAR21.pdf)
- Behind-the-meter PV disaggregation from smart-meter data is an active research area. Bu et al. (IEEE TPWRS 2021) fit a Gaussian mixture to monthly nocturnal and diurnal native demand for non-PV customers, then use hourly solar exemplars (typical solar shapes) with maximum likelihood to split monthly PV estimates into hourly values. Hourly resolution, aimed at estimating PV, not at fault diagnosis — [arXiv 2009.00734](https://arxiv.org/pdf/2009.00734); related two-layer approach needing no array parameters or exemplars — [arXiv 2110.07697](https://arxiv.org/pdf/2110.07697)
- NSRDB gives 30-minute GHI at ~4 km (PSM; REST2 clear-sky + FARMS cloudy), validated against surface observations with mean percentage bias within ~5% (GHI) and ~10% (DNI). Use it as the cloud/irradiance reference; its 30-min cadence must be interpolated or aggregated to the meter's 15-min intervals. Coverage years vary by version; one result cites 1998–2016 for the older release, so confirm the current version's end date (recent months may be unavailable) — [NREL NSRDB paper/summary](https://nrel.gov/docs/fy22osti/70627.pdf), [data.gov catalog](https://catalog.data.gov/dataset/national-solar-radiation-database-nsrdb)
- Clear-sky identification: pvlib `detect_clearsky` implements Reno & Hansen (Renewable Energy 90, 2016): compares measured vs reference clear-sky statistics over a sliding window with iterative rescaling. Thresholds were designed for 10-minute windows of 1-minute data; Ellis, Deceglie and Jain showed it works for other intervals if thresholds are scaled; pvanalytics says input should be ≤15-min intervals. Needs equally spaced timestamps — [pvlib docs](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.clearsky.detect_clearsky.html), [pvanalytics](https://pvanalytics.readthedocs.io/en/stable/generated/pvanalytics.features.clearsky.reno.html)
- Grid-outage detection from smart-meter data exists in the literature (Stanford-led work incl. a rooftop-PV home set, and State Grid distribution-shift work), but targets utility-side outage localization, not homeowner PV fault dating — [NSF PAR 10394249](https://par.nsf.gov/servlets/purl/10394249), [EUDL](https://eudl.eu/pdf/10.4108/ew.5767)
- SDG&E publishes annual reliability reports (PDF, via CPUC GO 165) and says ten years of planned-outage history is available at sdge.com/system-reliability; no bulk per-event outage download was found. Reports are aggregate (SAIDI/SAIFI) so cannot date a single home's outage — [CPUC SDG&E reports](https://www.cpuc.ca.gov/-/media/cpuc-website/divisions/energy-division/documents/infrastructure/electric-reliability-reports/2020-sdge-electric-reliability-report.pdf), [SDG&E 2023 town hall](https://sdge.com/sites/default/files/SDGE%202023%20Town%20Hall%20-%20112124%20Presentation.pdf)

### Inferences (all [HEUR] unless noted)
- Decision tree per day d, using Green Button net = import − export (most files give both channels or a net channel; check which):
  1. **Grid outage:** a run of intervals with import = 0 AND export = 0 while the house normally always draws ≥ some base load (fridge etc.). Only reliable at the margin of single intervals if the meter rounds to 0.001 kWh; a 15-min gap of exact zero both ways in the middle of the day is the signature. Short outages (<15 min) are blurred into one interval's reduced values. Caveat: a vacation home with no load AND no PV output could also show near-zero both ways — but a working PV system on a clear day would still show export, so exact zeros at noon are far more likely an outage or a dead system with load off. Cross-check SDG&E outage notices / neighbor reports; no public per-event history found.
  2. **Cloud vs dead:** compute, for each day, a clear-sky index from NSRDB/nearby weather (or pvlib clear-sky model + cloud flag). A cloudy day shows reduced, noisy but positive generation (export or reduced import) correlated in time with the irradiance trace. A dead inverter shows midday net load ≈ night base load (±load noise) regardless of the irradiance trace. Test: correlation between irradiance and (−net load) over daylight hours; healthy ≈ high, dead ≈ ~0.
  3. **Low load / vacation:** low load alone does not remove export on a clear day; it makes export larger. So "midday import ≈ night import" on a clear day cannot be explained by vacation. Vacation matters only when generation is ambiguous (overcast) or when judging partial faults against a baseline.
  4. **Midday net-load vs night baseline:** compute median night net load (e.g., 00:00–04:00) and midday net load (11:00–14:00); healthy PV day: midday ≪ night (strongly negative). Dead: midday ≈ night or higher (daytime load often ≥ night load, e.g. AC). Ratio near 0 or positive on a clear day = flag.
- Adding a battery or EV changes the picture (battery masks export; EV charging adds load); Powerwall owners need the battery's own data or clearer rules. Not researched.
- Confidence: high for an obviously dead system on a multi-day clear stretch; low for single days or for partial systems; irradiance data errors (~5–10% bias, plus 4 km spatial and 30-min temporal mismatch with a single roof) mean cloud-edge days are ambiguous.

### Gaps
- No peer-reviewed paper found that detects a residential PV outage from net AMI data alone (searches returned disaggregation and utility-outage work only).
- SDG&E per-event outage history by address/date: not found as a public dataset; CAISO is a transmission operator and does not publish distribution outages by home (not verified—no CAISO source retrieved).
- NSRDB API specifics (endpoint, key, latest data year) not retrieved.
- Sub-hourly (15-min) disaggregation accuracy: cited work is hourly; accuracy at 15 min unknown.

## 2. Dating the fault and restart (changepoints, CUSUM, clear-sky and prior-year baselines)

### Takeaway
Reduce the problem to a daily scalar series (e.g., daily "midday-export to clear-sky" ratio or daily export energy normalized to clear-sky energy), then locate the step with a changepoint method (PELT/binary segmentation/CUSUM) and refine to the exact interval with the 15-min data on the transition day. Comparison to the same month of the prior year is a useful second baseline but is confounded by weather and load change.

### Cited Findings
- `ruptures` (Python) provides PELT (Killick et al. 2012) with a pruning rule that keeps optimality while cutting cost; parameters: cost `model` (l1, l2, rbf), `min_size`, `jump`; breakpoints via `.fit(signal).predict(pen=...)` with the penalty controlling how many changes are returned — [ruptures docs mirror](https://ctruong.perso.math.cnrs.fr/ruptures-docs/build/html/_modules/ruptures/detection/pelt.html) (the official docs are at centre-borelli.github.io/ruptures-docs; the mirror's example had an undefined variable)
- Clear-sky detection via pvlib/Reno-Hansen can be used to restrict analysis to clear periods so cloud variance does not swamp the step — [pvlib docs](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.clearsky.detect_clearsky.html)
- NREL's field study of 834 modules over five years found mean ~0.62%/yr, median ~0.58%/yr degradation and noted seasonal variation and nonlinearity in some module types — useful for deciding how large a year-over-year drop must be before it is a fault — [NREL 2023](https://nrel.gov/docs/fy23osti/82352.pdf)

### Inferences (all [HEUR])
- Recommended pipeline: (1) build daily feature F(d) = export energy over 10:00–15:00 divided by the clear-sky (or NSRDB-GHI-scaled) expected value, or use "midday net load minus night baseline"; (2) smooth only through median, not mean, to keep step edges; (3) run PELT (L2 or L1 cost, `min_size` ≈ 3–5 days) or two-sided CUSUM on the clear-day-only subset; (4) set the penalty so a ~40% sustained drop in F gets one breakpoint while cloud noise gets none; (5) on the candidate transition day, scan 15-min intervals: the last interval where export tracks the clear-sky curve and the first interval where it flatlines gives the fault time to ±15 min (or the previous/next day if a trip occurred overnight).
- Restart date: same method on the recovery step; add a check that F returns to within ~10–15% of its pre-fault level on clear days. A fault dated to "the first day export is absent" is a lower bound on downtime start only if the previous days were clear; if there were cloudy days before, the true start can be earlier — report an interval, not a point.
- Also use the **rolling 7-day ratio** (this week's clear-day export vs same weekdays' reference) to avoid weekly load patterns; and a **prior-year same-month ratio**, adjusted by irradiance sums, as a sanity check. These are heuristics; none were found published for AMI-only residential use.
- Data hygiene: Green Button usually uses local time (DST handling needed), intervals can be missing or estimated; align timestamps with solar noon (San Diego solar noon ≈ 12:00–13:00 PST/PDT depending on date) before windowing.

### Gaps
- No cited source for CUSUM parameter tuning on PV data specifically; no published benchmark of changepoint accuracy on net-meter PV data was found.

## 3. Partial faults (string/MPPT down, shading, soiling, module-level failures) and degradation vs fault

### Takeaway
Partial failures reduce the export peak and daily energy by a fraction roughly equal to the share of lost capacity, with shape changes (earlier clipping lost, flatter or shifted peak for shading). Normal wear is ~0.5%/yr, so any step larger than ~5% that appears within days is a fault, not degradation.

### Cited Findings
- Median field degradation ≈ 0.5%/yr (Jordan & Kurtz review: ~2,000 rates; median 0.5%, mean ~0.8%); the later >11,000-point update says high-quality crystalline-Si data also gives 0.5%/yr. Many older rates were calculated from a single flash test against nameplate (bias risk) — [NREL research hub](https://research-hub.nrel.gov/en/publications/photovoltaic-degradation-rates-an-analytical-review-2/), [NREL lifetime page](https://www.nrel.gov/pv/lifetime.html)
- 2023 NREL study: mean ~0.62%/yr, median ~0.58%/yr over five years for 834 modules — [NREL 2023](https://nrel.gov/docs/fy23osti/82352.pdf)
- Microinverter systems report status per unit; an Enphase Envoy's solid amber Power Production LED means at least one microinverter is not producing — [Greenlancer Enphase troubleshooting](https://www.greenlancer.com/post/enphase-envoy-troubleshooting). (Installer blog; the meter data alone will not identify which unit.)

### Inferences (all [HEUR])
- Expected fractions: one of N equal microinverters or optimizer-level units dead → about 1/N lower export (e.g., 1 of 20 ≈ −5%); one of two equal string-inverter MPPTs down → roughly −50% of rated peak; a string-inverter MPPT with half the modules → proportionally less. Compare per-clear-day peak export and daily kWh to clear-sky expectation and to the system's own earlier clear-day peak.
- Because the meter shows net energy, peak export also depends on load at that moment. Use the daily kWh integral or the clear-day peak of (−net load + median midday load) rather than raw export, otherwise load changes masquerade as faults.
- Shading: expected signature is a time-of-day-localized dip repeating each clear day (same clock times, shifting slowly with sun path), not a uniform scale-down; soiling: gradual loss that steps back up after rain (San Diego dry season: slow decline of ~% per month possible; rain recovery visible) — I found no cited magnitudes for San Diego, so treat as qualitative.
- Wear vs fault test: annualized change in clear-day normalized yield between years. |Δ| ≲ 1–2%/yr is plausible degradation (0.5%/yr median, with measurement noise from ~5–10% irradiance data bias making single-year comparison weak below roughly ±5–10%). Abrupt step within days, or loss that recovers after a service, indicates a fault.
- Detection floor: with 15-min net data, irradiance bias and load noise, expect to reliably detect only losses ≳10–15% of production; below that is not distinguishable without normalization against on-site irradiance or inverter data.

### Gaps
- No source on typical soiling loss rates or shading signatures in San Diego was gathered.
- No cited quantitative accuracy of partial-fault detection from net-meter data alone.

## 4. Restart / ground-fault / arc-fault cycling and anti-islanding delays as seen in 15-min data

### Takeaway
Intermittent ground-fault/isolation faults typically occur at morning start-up (moisture) and clear as the array dries, so the 15-min signature is a repeated late-morning start (export begins late, then normal). Reconnect delays after grid events are short relative to a 15-min interval (5 min standard, shorter in some CA profiles), so at 15-min resolution they appear as at most one partial interval.

### Cited Findings
- SolarEdge-style isolation test: inverter checks DC-to-ground resistance each power-on and errors if below ~600 kΩ (single-phase) or 1 MΩ (three-phase); faults often show in the morning from moisture and may disappear as things dry. Source is an installer training page, not SolarEdge's own document — [ION Solar field support](https://sites.google.com/ionsolar.com/field-support/trainings/monitoring-platforms/solaredge/troubleshooting/isolation-faults)
- A SolarEdge error table lists isolation fault as code 2x19 (also 8x58), with 2x1A faulty AC relay and 2x1C RCD sensor error; a third-party table, so confirm on the display/monitoring portal — [Static Electrics (AU)](https://www.staticelectrics.com.au/?p=38633) (listed in search results; code table as summarized)
- IEEE 1547 reconnection after grid fault: typically five minutes (300 s) adjustable up to 300 s — [Fimer/ABB note](https://www.fimer.com/sites/default/files/String_inverter_reconnection_delay_when_used_with_RSD-BCA.00163.0AP_AB.pdf), [Schneider FAQ](https://www.se.com/us/en/faqs/FA308830)
- Tesla's Powerwall grid-code table lists a 15 s reconnect qualification delay for the IEEE1547-2018_UL1741SB-CA-Rule21_2022 profile vs 300 s for other grid codes and 60 s for CA UL1741 SA; Tesla notes delayed reconnection of 1 to 5 minutes after a backup event. Vendor profile, not the Rule 21 text — [Tesla docs](https://service.tesla.com/docs/Public/Energy/Powerwall/Device-Setup-in-Tesla-Pros-NA-EN/GUID-CE784C0E-5D39-43A6-B196-D64FBC9090A2.html)

### Inferences (all [HEUR])
- Repeated daily late starts (export begins ≥ 1–2 h after sunrise-equivalent on clear days while the clear-sky model says generation should begin) and normal midday output → ground/isolation or morning-moisture fault pattern. Plot first-nonzero-export interval vs clear-sky first-generation time per day; a persistent positive offset that grows after rain/dew events is the signature.
- Mid-day drop-outs lasting one to a few intervals with otherwise normal days (a "notch" in an otherwise smooth clear-day export curve) → arc-fault/AFCI trips or grid-event trips; repeated at similar clock times suggests thermal/sun-angle related. A single 15-min interval with ~one-third to two-thirds reduced export is consistent with a ~5-minute reconnect; multiple consecutive notches suggest repeated trips.
- Anti-islanding restart of 5 min cannot be resolved at 15-min cadence; only the energy shortfall (≈ a third of an interval at full output) is visible. Do not claim a restart time more precisely than ±15 min.
- Distinguish grid-event trips from inverter faults by checking whether import also dips to zero around the notch (grid outage) or whether load keeps being served (inverter-only).

### Gaps
- SolarEdge/SMA/Enphase/Tesla primary manuals were not retrieved; the "2x1" code mapping is unconfirmed (2x19 per a third-party table). Enphase's documented microinverter reconnect interval was not found (the "5 minutes" in Enphase support results refers to an Envoy connectivity test).
- Rule 21 / UL 1741 SB primary text for reconnect delay not retrieved.

## 5. Net-metering true-up and dollars lost while down

### Takeaway
Lost value = lost kWh × the value that kWh would have had: retail import rate for kWh that would have offset consumption in real time (and for NEM 1.0/2.0 exports credited at retail), or the lower export/avoided-cost value for NBT exports and surplus. Estimate lost kWh from clear-sky/baseline expectations; the dollar figure has a wide band and depends on tariff.

### Cited Findings
- Under NEM 1.0 and 2.0 retail exports are credited at the import rate; under NBT (NEM 3.0) they are credited at CPUC Avoided Cost Calculator values, usually lower; at true-up all three credit net surplus at wholesale-type rates. NEM 1.0 computes non-bypassable charges on net annual consumption, NEM 2.0 and NBT on metered intervals/all imports — [CPUC NEM/NBT page](https://webtraining.cpuc.ca.gov/industries-and-topics/electrical-energy/demand-side-management/customer-generation/net-energy-metering-and-net-billing)
- A vendor source claims average 2025/2026 NBT export credits of ~3.7¢/kWh for SDG&E and midday ranges ~$0.04–$0.08/kWh; unverified vendor figures; SDG&E publishes current and legacy export pricing files on its tariff pages — [Stellar Solar](https://stellarsolar.net/2026/03/02/sdge-net-metering-in-2026-rate-structures-explained/), [NRG Clean Power](https://nrgcleanpower.com/learning-center/nem-3-0-is-final/)

### Inferences (all [HEUR])
- Lost kWh = Σ over the down period of (expected generation − observed generation). Expected generation from: (a) the same system's pre-fault clear-day yield scaled by NSRDB irradiance; (b) prior-year same-period actual; (c) a PVWatts/pvlib model with the nameplate kW (needs system size; Green Button doesn't provide it). Report range using (a)–(c).
- Dollar value: for a NEM 1.0/2.0 home the lost kWh are worth roughly the TOU import rate at the hours missed (more precisely, bill difference computed by re-running the bill with the added kWh — the lost energy would have reduced net imports or increased credited exports at retail). Under NBT, direct self-consumed kWh are worth retail but exported kWh only the export value; so a fixed $/kWh multiplier overstates. Use an hourly rate × hourly lost kWh calculation, then caution that annual true-up with a net surplus at year-end values some lost kWh at only the wholesale surplus rate.
- Because the user's tariff version (NEM 1/2/NBT) determines the answer, ask for the bill or the tariff schedule; a sales/claim number should be shown as a range with the assumptions listed.

### Gaps
- Exact SDG&E current tariff rates (retail TOU, export credits) not retrieved from SDG&E primary tariff sheets.
- The true-up surplus rate figure from the CPUC page was only summarized as "much lower" (secondary); exact current net surplus compensation rate not obtained.

## 6. Published research, tools and commercial services

### Takeaway
Adjacent literature (BTM PV disaggregation, utility-side outage detection from AMI, PV clear-sky filtering and degradation analysis) is well documented; a dedicated, validated method for diagnosing a single home's inverter fault and downtime from 15-min net AMI data was not found in this search. Commercial services found were for inverter-telemetry monitoring or grid analytics, not homeowner Green Button fault diagnosis.

### Cited Findings
- BTM PV disaggregation: Bu et al. (arXiv 2009.00734, 2110.07697, 2105.08122 data-efficient approach, 1907.06747 game-theoretic) — [arXiv search result list](https://arxiv.org/pdf/2009.00734)
- Open-source tools: pvlib (clear-sky detection), pvanalytics (feature detection incl. Reno clear-sky), rdtools (degradation and clear-sky filtering; `pvlib_clearsky_filter`) — [pvlib](https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.clearsky.detect_clearsky.html), [rdtools](https://rdtools.readthedocs.io/en/3.2.0/generated/rdtools.filtering.pvlib_clearsky_filter.html), [pvanalytics](https://pvanalytics.readthedocs.io/en/stable/generated/pvanalytics.features.clearsky.reno.html)
- Changepoint tool: ruptures (PELT) — [docs mirror](https://ctruong.perso.math.cnrs.fr/ruptures-docs/build/html/_modules/ruptures/detection/pelt.html)
- Vendors: net2grid markets embedded edge models reconstructing gross load behind solar from ≥1-minute AMI 2.0 data (marketing claim) — [net2grid](https://www.net2grid.com/post/the-grid-s-hidden-solar-problem-and-how-you-can-fix-it-at-the-grid-edge); a solar-outage alert page uses inverter telemetry plus smart-meter feeds, marketing only — [fieldproxy](https://www.fieldproxy.ai/automations/solar-grid-outage-alert); utility AMI analytics (Dominion presentations) for service issues — [IEEE VTools](https://events.vtools.ieee.org/event_media/download/16524)

### Inferences
- A practical stack for a small service company: Python with pandas + pvlib (clear-sky model, `detect_clearsky` with scaled thresholds) + ruptures (PELT) + NSRDB for irradiance, producing: clear-day mask, daily normalized-yield series, changepoints, 15-min transition scan, and lost-kWh/dollar range. Entirely [HEUR] as a composition; each component is established, the combination is not validated.

### Gaps
- No EPRI, DOE or LBNL document specific to AMI-based residential PV fault detection was retrieved (not found in the searches run; absence is not proof none exists).
- No commercial service offering Green Button-based PV fault diagnosis for homeowners was found.
- Peer-reviewed accuracy/false-positive rates for dating faults from net data: not found.
