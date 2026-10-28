# HVAC problem detection from whole-home 15-minute interval data

NOTE ON METHOD: Only WebSearch result summaries were usable. Direct page fetches (par.nsf.gov, go.bidgely.com, innovationcenter.msu.edu) failed to resolve in this session, so no paper was read in full. Everything below is from search summaries and is marked accordingly. Those three hosts would need to be allowed in the session network settings to read the papers.

## What published methods detect HVAC faults, degradation, short-cycling or abnormal cooling load from whole-home interval data, and how accurate are they?

### Takeaway
Whole-home interval data supports peer-comparison and weather-normalized "this home uses unusually much cooling energy" flags, not fault diagnosis. I found no independent, peer-reviewed accuracy figure for detecting refrigerant, airflow or short-cycling faults from 15-minute data. The best fault-detection evidence uses thermostat or sensor data instead.

### Cited Findings
- A patent describes HVAC malfunction detection over smart-meter data with no per-unit sensors: disaggregate load, compare each home to peers in its subgroup, and flag homes consistently in the top 1% of their partition for consumption. No accuracy stated in the summary. — [US patent 11092953](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11092953)
- A study (Dataport data) ran NILM at 1-min, 15-min and 1-hour granularity to identify residential AC and classify "leaky" homes; it reports 86% accuracy at 1-minute resolution. The 86% is for the downstream leaky-home task, not plain AC detection, and the 15-minute result was not visible in the summary. — [NSF PAR 10073172](https://par.nsf.gov/servlets/purl/10073172)
- A 2021 IHPBC paper used thermostat history from nearly 370,000 US residential systems and a statistical population-comparison method to find efficiency-affecting faults in non-variable-speed AC and heat pumps. Different data source (thermostat runtime), but it is the largest residential FDD data set found. — [Purdue IHPBC](https://docs.lib.purdue.edu/ihpbc/378)
- ORNL/TM-2024/3661, "Residential HVAC Fault Detection: Field Data Analysis and Interviews with Smart Thermostat Manufacturers" (Oct 2024), interviewed six people at four thermostat makers. Findings not visible in my summary. — [ORNL PDF](https://info.ornl.gov/sites/publications/Files/Pub224924.pdf)
- DOE BTO project aims at a low-sensor residential AFDD algorithm and a public fault data set covering cooling and heating seasons (ORNL/TM-2024/3347 covers refrigerant under/over-charge data collection). — [DOE peer review](https://www.energy.gov/sites/default/files/2024-11/bto-peer-2024-12275-developing-and-deploying-cost-effective-residential-afdd-im.pdf)
- SDG&E-region test (2013-14) of four NILM vendors on 11 homes, to gauge rough accuracy. — [ETCC](https://www.etcc-ca.com/reports/residential-disaggregation)
- ACEEE 2016 paper on vendor disaggregation using PG&E meter data: large estimation errors for almost all end uses; one vendor matched AC and refrigeration for some homes; accuracy was best for end uses aggregated over the five-month period and degraded for individual months or homes. — [ACEEE 2016](https://www.aceee.org/files/proceedings/2016/data/papers/12_775.pdf)
- Vendors: Oracle describes detecting large appliances at 15/30/60-minute AMI granularity; Bidgely publishes an HVAC whitepaper. Accuracy is vendor-reported; I found no independent figure. — [Oracle case](https://beyond-digital.eurelectric.org/case-studies/oracle/), [Bidgely whitepaper](https://go.bidgely.com/rs/492-VKN-623/images/HVAC_Whitepaper.pdf) (not opened)
- NILMTK evaluation: an AC with a fan-only state after compressor shutoff fit a two-state model poorly, and AC results were worse than other appliances. — [NILMTK arXiv](https://arxiv.org/pdf/1404.3878)
- A 2022 data set gives 1-minute AC on/off ground truth with home current data for AC event and compressor detection research. — [Springer s42162-022-00225-4](https://link.springer.com/article/10.1186/s42162-022-00225-4)

### Inferences
- Realistic output from our data is a ranked "unusually high or worsening cooling use for the weather" flag, not a named fault.
- Vendor and utility disaggregation accuracy is much better aggregated over months than for one home-month, so a single-home verdict from one summer is weak evidence.

### Gaps
- No peer-reviewed accuracy for short-cycling, refrigerant or airflow fault detection from 15-minute whole-home data. Not found.
- ORNL 2024 findings, the Bidgely whitepaper and the Dataport 15-minute result were not read.
- No SDG&E/SCE/PG&E program evaluation specifically about HVAC fault flagging was found.

## What load signatures appear at 15 minutes, and what is not detectable versus 1-minute or 1-second data?

### Takeaway
At 15 minutes you see weather-dependent daily and seasonal shape: afternoon/evening ramp, slope of load versus temperature, baseload and overnight level. You cannot see compressor cycles, so short-cycling, startup surges, and fan-only states are invisible.

### Cited Findings
- Utility data at 15-minute or hourly intervals is generally not specific enough for most published NIALM event-based techniques to give a clear appliance signature. — [US patent 11036189](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11036189)
- One review notes event detection (appliance on/off) is impractical with sampling below 1 Hz in earlier approaches; a Malaysian study treated 1 minute as a minimum usable interval (details thin). — [MDPI Symmetry 14(2)](https://www.mdpi.com/2073-8994/14/2/279)
- A Dutch study found disaggregation applicable at both 10 s and 15 min but for different use cases. — [HAL 01385572](https://hal.archives-ouvertes.fr/hal-01385572)
- Austin, TX study of 45 houses with daily change-point models: AC "energy slope" distribution left-skewed, centered about 0.08 kW per degree C; eight house characteristics from audits correlated with higher slope. Not LBNL. — [MSU-hosted PDF](https://innovationcenter.msu.edu/wp-content/uploads/2021/06/Development-and-analysis-of-residential-change-point-models-from-smart-meter-data.pdf) (not opened; from search summary)
- LBNL BETTER supports 1P/3P/5P change-point models (baseload, cooling slope, change-point temperature) but targets bills/building data. — [BETTER docs](https://better-lbnl-os.readthedocs.io/en/latest/getting_started.html)
- LBNL (Eto and Moezzi 1997) compared models of residential central-AC hourly load from 350 California homes' metered data. Old (1997). — [LBNL ETA](https://eta-publications.lbl.gov/bibcite/reference/22884)

### Inferences
- Detectable at 15 min: rising cooling slope (kWh per cooling degree-hour/day) year over year, a higher balance-point onset, higher overnight/late-evening use on hot days, baseload shift.
- Not detectable at 15 min: cycle length and cycles per hour (short-cycling), inrush current, compressor vs fan-only, refrigerant or airflow signatures. A 15-minute interval averages many cycles; for a short-cycling unit it looks like partial load.
- Whether SDG&E can supply sub-15-minute data to us is unknown; not researched.

### Gaps
- No source quantifying how much 15-minute smoothing hides cycling, beyond the qualitative statements above.

## What simple rules and thresholds might a field-service company use?

### Takeaway
Documented thresholds are generic: peer-percentile (top 1%) and a 2-standard-deviation residual from a weather regression. I found no published, validated HVAC-specific thresholds for 15-minute data; any thresholds we adopt would be our own, to be tuned.

### Cited Findings
- Peer comparison: flag homes in the top 1% of consumption in their subgroup. — [US patent 11092953](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11092953)
- Outlier rule: points beyond 2 standard deviations of the weather regression line. — [EnergyCAP](https://helpcenter.energycap.com/um/cost_avoidance/information/how_to_determine_if_a_meter_is_weather_sensitive)
- Weather normalization with smart-meter data uses hourly weather and interval data rather than monthly degree-day regressions. — [Gridium](https://gridium.com/weather-normalization/)
- Fault impact context (for deciding what is worth flagging): Proctor summary says 62% of 4,000+ California residential systems tested were improperly charged (secondary-source citation); a secondary source attributes to Domanski about 17-23% more energy at roughly 30% undercharge. — [Proctor 92026A](https://www.proctoreng.com/dnld/92026A.pdf), [DOE issue3](https://www.energy.gov/sites/default/files/2013/12/f5/issue3_airflow_charge.pdf)
- Duct leakage: a 10% supply-duct leak to outside equals about a 10% cooling capacity loss (Proctor). — [Proctor](https://www.proctoreng.com/dnld/92026A.pdf)
- ORNL simulation: undercharge raises runtime and cooling energy and occupants may not notice, especially with oversized systems. — [ORNL](https://www.ornl.gov/publication/impact-refrigerant-undercharge-faults-building-indoor-conditions-and-hvac-system)

### Inferences
- Candidate rules (my design, NOT from literature, unvalidated): (1) fit load vs outdoor temperature for the same months in prior and current year and flag a cooling-slope increase beyond the 2-sigma residual band; (2) compare summer 1-8pm import to shoulder-month 1-8pm import and flag high ratio only with no known A/C or pool/EV change; (3) require 3+ months of data and a minimum number of hot days.
- Frame outputs as "recommend an HVAC check", not a fault name. This matches the existing Quoya's Analysis A/C card, which uses a 2.5x ratio and 3+ spike days; those numbers are our own heuristics with no literature backing found.
- Expected effect sizes (10-25% energy) are comparable to year-to-year weather and occupancy noise, so false positives are likely without careful normalization.

### Gaps
- No published residential threshold for summer/shoulder afternoon ratio, or for kWh per cooling degree day, was found.
- No false-positive rates for any of these rules were found.

## Confounders: occupancy, pool pumps, EVs, solar self-consumption, temperature differences

### Takeaway
Net-metered homes are the main trap: meter import/export hides production, so apparent load changes can be solar changes. Weather-year differences, EV charging and pool pumps add load of similar size to a faulty AC.

### Cited Findings
- Net-metered customers respond to weather differently, and regressions without a generation term can misread net load as a weather or usage effect; peak-hour and daily regressions can have opposite-signed CDD coefficients. (Missouri rate-case testimony, not peer-reviewed.) — [Missouri PSC 805377](https://efis.psc.mo.gov/Document/Display/805377)
- Cooling-only degree-day models can bias temperature effects if heating terms are omitted. — [Missouri PSC 109052](https://www.efis.psc.mo.gov/Document/Display/109052)
- Vendor disaggregation errors grow for individual homes and months. — [ACEEE 2016](https://www.aceee.org/files/proceedings/2016/data/papers/12_775.pdf)

### Inferences
- Solar: a failed inverter lowers midday export and raises net afternoon import, which looks like "more A/C use". Check solar state (our Green Button down-run/drop checks) before any A/C conclusion.
- EVs and pools: overnight/morning charging and daytime pump schedules are fixed-time loads; separate them by time-of-day shape before comparing summer to shoulder.
- Weather: use degree-hours from actual hourly temperature for both years; a hotter year raises cooling slope-independent total use.
- Occupancy changes (home from work, guests) are undetectable from meter data.

### Gaps
- No peer-reviewed source on separating AC from pool pump/EV/solar in 15-minute net data was found; the above is reasoning, not cited evidence.
- Pool-pump signature literature was not searched in depth (outside this note's search budget).
