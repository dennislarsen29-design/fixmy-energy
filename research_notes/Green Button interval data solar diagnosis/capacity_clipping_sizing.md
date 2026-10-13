# Inferring residential PV inverter capacity, clipping, size and failure from 15-min interval (export) data

Method note: 7 searches run; only search-result snippets were read (no full-page fetches), so each cited source is a secondary summary of the search tool. Formulas marked "Heuristic" are my own engineering reasoning, not sourced. Vendor/blog sources are flagged. No LBNL residential clipping source was found.

## Q1. Max sustained 15-min export vs. inverter AC nameplate; production ceiling from export + baseline load

### Takeaway
Max export is a LOWER bound on AC output: gross production = export + simultaneous load (+/- battery). Use the upper envelope (e.g. 99th pct / daily max, clear days, low-load hours) and subtract a load baseline estimated from non-solar hours; the result is only defensible as "at least X kW". Commercial tools use the same idea (clear-sky max curve).

### Cited Findings
- Net-load disaggregation literature exists that infers installed PV capacity from smart-meter net load, but methods generally need weather data, PV model parameters or proxy PV systems; none of the surfaced papers give a head-to-head capacity accuracy comparison. — [Brunel/Wang group](https://bura.brunel.ac.uk/bitstream/2438/21797/1/FullText.pdf); [Oxford (censored smart meter data)](https://ora.ox.ac.uk/objects/uuid:9a370e8f-9b82-4e7d-85d7-b1af7e77e34f); [Chen, Haji, Ardakanian e-Energy 2021](https://cs.ualberta.ca/~oardakan/files/e-energy2021b.pdf) (needs only low-res meter data plus proxy PV from nearby systems and the area's installed capacity)
- A commercial smart-meter disaggregation tool starts by estimating the maximum solar energy curve on a clear-sky day. — [Eliq](https://support.eliq.com/knowledge/pv-disaggregation)
- Meter-level data cannot separate PV from load without assumptions; arXiv work on data-efficient BTM disaggregation addresses this. — [arXiv 2105.08122](https://arxiv.org/pdf/2105.08122)

### Inferences (Heuristic)
- Export_kW(t) = PV_AC(t) - Load(t) (- battery charge). So PV_AC >= max Export. Spring midday (Mar-May, mild SD weather, no AC) gives the lowest load; use base load at 10:00-14:00 on those days = low-percentile (10th) of load on adjacent cloudy/night-adjacent hours, typically 0.3-1.0 kW for a SD home (assumption, not sourced).
- Ceiling estimate: P_ceiling ~ P99(export over clear spring days) + P10(base load). Error is about +/- the base-load uncertainty (0.3-1 kW) plus intervals averaging: 15-min averages understate instantaneous peaks slightly.
- Inverter AC nameplate check: if many clear days, across seasons, the export envelope tops out at a constant kW (+ base load), that is the AC limit; if envelope rises with sun elevation (higher in spring/fall than summer, bell shaped), inverter is NOT limiting.
- Caveats: batteries, EV charging, or NEM-exported only data (Green Button "received" channel alone, no "delivered") hide self-consumption; always ask for both channels if available. With export-only data, net-zero midday consumption hides production entirely.

### Gaps
- No peer-reviewed accuracy figures for "max export -> AC capacity" found. Typical base-load numbers above are unsourced assumptions.

## Q2. Clipping signature, DC/AC ratios, energy lost, and "would a larger inverter / PW3 help"

### Takeaway
Clipping shows as a flat plateau at a near-constant kW on clear days; typical design DC/AC 1.1-1.3 loses well under 2-3%/yr, but ~1.5 loses ~2-5% and 1.7 loses >9%. Lost energy is estimated by integrating (clear-sky-shaped curve - plateau) over the plateau.

### Cited Findings
- 1.2 DC/AC design ratio usually keeps clipping losses under 0.25% (one SPW piece); another vendor says 1-2% on sunny days for 1.2-1.3. — [Solar Power World](https://www.solarpowerworldonline.com/2016/07/solar-inverters-clipping-dcac-inverter-load-ratio-ideal/); [Ginlong/Solis via SPW](https://www.solarpowerworldonline.com/?p=88260)
- Folsom Labs: at 1.7 DC/AC system clipping loss >9%; marginal capacity between 1.7 and 1.8 loses nearly 60% to clipping. — [Solar Power World / Folsom](https://www.solarpowerworldonline.com/2017/09/folsom-rethinking-inverter-clipping/)
- HelioScope: healthy design ~1.25; ~2-5% clipping at 1.5. — [HelioScope](https://help-center.helioscope.com/hc/en-us/articles/8198321934867-Understanding-DC-AC-Ratio)
- Clipping is economic, not simply bad; value depends on export compensation and cost. — [Solar Power World](https://www.solarpowerworldonline.com/?p=77383) (vendor/industry source)
- Tesla Powerwall 3 (US): 6 MPPTs, 20 kW max solar STC input, 11.5 kW continuous AC, MPPT range 60-480 V, 13 A Imp/15 A Isc per MPPT (jumper to combine two to 26/30 A); AU/UK variants differ (3 MPPTs). — [Tesla Powerwall 3 manual spec page](https://service.tesla.com/docs/Public/Energy/Powerwall/Powerwall-3-with-Gateway-3-Installation-Manual-NA-EN/GUID-EC527BC7-4750-4425-BBC4-DB8C000339B3.html)
- SolarEdge: oversizing limit 135% for single-phase up to SE6000, up to 155% depending on model; clipping occurs when DC exceeds inverter output; heavy oversizing keeps inverter at high power longer. — [SolarEdge technical note via Segen](https://portal.segen.co.uk/reseller/docs/inverter_dc_oversizing_guide.pdf). A reseller claims 200% after firmware; unverified.

### Inferences (Heuristic)
- Detection: for each clear day, fit smooth clear-sky-shaped envelope; flag intervals where P_t within ~1-2% of the day's max for >=3 consecutive 15-min intervals (>=45 min) AND the clear-sky model predicts higher. Confirm on multiple days; plateau level should be stable across season (within ~3-5%, because inverters derate with heat).
- Energy lost per day = sum over plateau intervals of (reconstructed unclipped - observed) * 0.25 h. Reconstruct by fitting a cos/Gaussian-like shape to non-clipped shoulders (or scaling pvlib clear sky to shoulder ratio).
- Replacement upside: PW3 11.5 kW AC vs a typical 5-7.6 kW string inverter: recovered energy = clipped energy (seasonal; most in spring/summer near solar noon). Upside is bounded by DC array: DC/AC = array kW / old AC kW; a 1.3 ratio at 7.6 kW AC implies ~9.9 kW array, which under 11.5 kW AC would clip essentially zero. For a typical array (<=11.5 kW DC) a PW3 removes clipping entirely; 20 kW DC input is a limit, not relevant to residential arrays.
- Microinverter systems clip per module (module/micro mismatch), so no common plateau at array level until all modules saturate; plateau appears only at sum of micro AC limits.

### Gaps
- No LBNL or NREL residential-specific clipping dataset found; figures are from vendor/industry. SD-specific clipping curves not found.

## Q3. Estimating DC kW, panel count, module wattage

### Takeaway
DC kW ~ (observed clear-day peak AC + base load) / (clear-sky-model peak per kW x system efficiency); cross-check with annual specific yield. Expect roughly +/-10-20% from this method alone (heuristic); check against permit/Aurora/Google Solar numbers.

### Cited Findings
- PVWatts default system losses 14% (pvlib docs); pvlib default clear-sky model Ineichen-Perez with monthly Linke turbidity. — [pvlib ModelChain.with_pvwatts](https://pvlib-python.readthedocs.io/en/latest/reference/generated/pvlib.modelchain.ModelChain.with_pvwatts.html); [pvlib ineichen](https://pvlib-python.readthedocs.io/en/v0.6.2/generated/pvlib.clearsky.ineichen.html)
- Residential 14% loss "typical" with 10-20% actual spread (secondary). — [solartechonline](https://solartechonline.com/blog/pvwatts-complete-guide/) via search result
- San Diego specific yield: no PVWatts output found. Derived (by me) from third-party sites: ~1,660 kWh/kW-yr (Voltflow) and ~2,000 (NASA-POWER-based, no losses). — [Voltflow](https://www.voltflow.net/solar-panel-calculator/city/san-diego); [Profile Solar](https://profilesolar.com/locations/United-States/San-Diego/). Specific yield range 1,000 to >2,000 in general — [Solar Power World](https://www.solarpowerworldonline.com/2017/08/specific-yield-overview/)

### Inferences (Heuristic)
- Steps: (1) pvlib Location at the home's lat/lon, clear-sky GHI -> POA for tilt/azimuth (from Google Solar API/Aurora or assume 20-25 deg, south); PVWatts DC model with 0.9-0.86 derate -> clear-sky AC per kW_DC for each date. (2) Ratio k = max observed (export + base load) / modeled per-kW peak -> kW_DC estimate, using best 5-10 clear days around equinox where POA is near-flat/high (tilted modules peak in spring/fall). (3) If plateau exists, ratio method fails (clipped), use shoulder intervals (e.g. 2 h before/after noon) instead of peak.
- Annual cross-check: kWh_year / kW_DC should be ~1,500-1,700 kWh/kW (prompt's figure, consistent with Voltflow-derived 1,660; treat as plausibility band, +/-10%).
- Panel count = kW_DC / module watts; ambiguity: 20x400 W = 16x500 W; use permit/Google Solar roof panel count to resolve. Module age/era (e.g. 2013 SunPower ~ 327 W) narrows wattage.
- Error: base-load (+/-0.5 kW of ~6 kW = ~8%), temperature/soiling (~5%), tilt/azimuth mismatch (5-10%), degradation (0.5%/yr). Combined ~15-20% (my estimate).

### Gaps
- No peer-reviewed error figures for this specific peak-ratio method; no San Diego PVWatts run was possible (no tool access).

## Q4. Detecting partial inverter failure (one MPPT/string down)

### Takeaway
Compare observed clear-day peak and daily energy to clear-sky expectation scaled by a healthy-period baseline; a stable ratio near 0.45-0.65 (e.g. 2 of 4 strings) with an otherwise normal shape suggests lost strings, while a flat plateau at low kW suggests clipping or a power limit.

### Cited Findings
- No source found specific to string-down detection from interval data. Tesla PW3 per-MPPT architecture (6 MPPTs, jumper pairing) shows how strings map to trackers. — [Tesla](https://service.tesla.com/docs/Public/Energy/Powerwall/Powerwall-3-with-Gateway-3-Installation-Manual-NA-EN/GUID-EC527BC7-4750-4425-BBC4-DB8C000339B3.html)

### Inferences (Heuristic)
- Performance ratio PR_day = E_obs_day / E_clearsky_day (clear days only, per Q3 model). Healthy ~0.75-0.90 of modeled-for-nameplate energy after losses; ratio of 0.4-0.6 with correct bell shape = ~half the array offline. Step change in PR on a single date (same weather) = failure date; compare same-month year-over-year to remove seasonal modeling error.
- Shape cues: lost string on a different azimuth changes timing (e.g. missing west strings lowers afternoon more). Output peak plateau well below inverter AC rating, with high-ratio of fault days, can also be an inverter derate/power limit, so cross-check against Q2 plateau logic.
- Confound: shifted consumption (battery install, EV) and NEM data lacking delivered channel. Require >=5 clear days before/after.

### Gaps
- No sourced thresholds; all numbers are my heuristics and must be validated on known-failed systems.

## Q5. Inverter-specific behaviors

### Takeaway
Inverter architecture changes what the plateau looks like and the allowable DC/AC. Microinverters clip per-module at small AC ratings; SolarEdge permits 135-155% DC oversizing with fixed-voltage string behavior; Enphase enforces no DC/AC ratio.

### Cited Findings
- Enphase IQ8: no enforced DC/AC ratio; compatibility calculator; IQ8+ 290 VA continuous (300 peak), IQ8 (60 cell) 240 VA, IQ8AC 349 VA. UK IQ8MC datasheet says some clipping at peak irradiance. — [IQ8 datasheet](https://www.santansolar.com/wp-content/uploads/Enphase-IQ8-Microinverter-Datasheet.pdf); [IQ8AC datasheet](https://signaturesolar.com/content/Enphase/IQ8AC/IQ8AC-Datasheet.pdf)
- Forum anecdote: 395 W panels on 290 VA IQ8+ clip early; installer estimated +186 kWh/yr by swapping to 330 VA (unverified). — [Sevarg forum](https://conversation.sevarg.net/t/new-solar-setup-enphase-iq8s-and-clipping/808)
- SolarEdge oversizing limits and clipping/lifetime note: see Q2 ([SolarEdge note](https://portal.segen.co.uk/reseller/docs/inverter_dc_oversizing_guide.pdf)).
- Retailer rule of thumb for micros: 1.10-1.30 is standard. — [Ohmsnap](https://www.ohmsnap.com/inverters/enphase-iq8p) (retailer, weak)

### Inferences (Heuristic)
- Microinverter systems: a sum-of-micros AC ceiling gives plateau = N_working_micros x per-micro AC; steps of ~0.25-0.35 kW in the plateau after failures indicate individual micro loss (a tell-tale of microinverter vs string failure).
- String inverters with optimizers/SolarEdge fixed voltage show a sharp, near-flat plateau at AC limit; volt-var/watt limits and utility export caps (e.g. a 5 kW export limit under NEM interconnection) appear as a plateau on export data independent of inverter rating, so verify the interconnection document before concluding clipping.
- Power-limiting by SunSpec/utility, high-temperature derating (afternoon plateau drifting downward), and battery/PW3 charging from PV (hides export) all must be screened.

### Gaps
- Could not verify Enphase/SMA/SolarEdge power-limit/volt-var behavior details or export-cap rules in SDG&E; no SMA doc was retrieved.
