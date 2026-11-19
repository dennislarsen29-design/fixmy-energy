# Rocky Mountain Power (Utah) Wattsmart Battery Program: enrollment mechanics with Tesla Powerwall 3, and how installers present it

**Method note:** WebFetch could not reach any host (tesla.com, rockymountainpower.net, solarreviews.com, eliteelectricpro.com all failed DNS: not on the session's allowed network list). Everything below comes from WebSearch result summaries only, not full-page reads. No Reddit/forum threads or Utah installer quote pages surfaced in any search. Treat all figures as needing confirmation against the live RMP page. Allow the hosts above and re-run to verify.

## 1. Step-by-step enrollment: who submits what, in what order, timing, rejection reasons

### Takeaway
Per RMP's official page (as quoted in search results): installer files a customer generation application first, RMP approves it, then the customer submits the Wattsmart participation/incentive application, then an incentive check is issued. Tesla adds that enrollment in the Tesla app follows commissioning and RMP approval. No source found gave processing/payment timelines or rejection reasons.

### Cited Findings
- Official RMP sequence (search-summary quotation): installer submits a customer generation application; customer submits the participation and incentive application; RMP verifies the generation application was received and approved; incentive check issued. — [RMP Wattsmart battery page](https://www.rockymountainpower.net/savings-energy-choices/wattsmart-battery-program.html) (via search summary; page not directly fetched)
- FranklinWH page: RMP issues payment only after verification is complete. — [FranklinWH](https://www.franklinwh.com/homeowner-incentives/wattsmart-battery-program/)
- A third-party guide describes the generation application as filed through RMP's PowerClerk system and required for the incentive, with a dispatch-verification step and bill credits after participation. — [Elite Electric Pro guide](https://eliteelectricpro.com/rmp-wattsmart-battery-rebate-2026/) (via search summary; vendor blog)
- Batteries must be new; no incentive for batteries installed, or with a PowerClerk application submitted, before the battery's approval date. — [RMP customer program info PDF](https://www.rockymountainpower.net/content/dam/pcorp/documents/en/rockymountainpower/savings-energy-choices/wattsmart-batteries/RMP_BatteryStorageProgram_customer_FINAL.pdf) (via search summary); sonnen FAQ also says upfront incentive requires new batteries — [sonnen FAQ](https://www.sonnenusa.com/frequently-asked-questions/faq-wattsmart-program)
- Tesla: for Powerwall 3, the net metering application must have been filed through Power Clerk on or after Sept 1, 2025; enrollment happens after the Powerwall 3 is commissioned and RMP approves the Wattsmart application; the enrollment offer then appears in the Tesla app. — [Tesla Wattsmart page](https://www.tesla.com/support/energy/virtual-power-plant/RockyMountainPower/wattsmart) (via search summary)
- Participation: four-year minimum commitment; early exit requires repaying a prorated portion of the upfront incentive. — [Fox 13](https://www.fox13now.com/news/technology/more-utahns-getting-solar-storage-batteries-joining-the-virtual-power-grid-model); [Solar Power World / search summary](https://www.solarpowerworldonline.com/2024/09/rocky-mountain-power-is-paying-solar-customers-more-incentives-if-they-add-storage-later/)
- Applications must be approved by RMP's program team; max eligible battery size 30 kW (sonnen FAQ, may be dated). — [sonnen FAQ](https://www.sonnenusa.com/frequently-asked-questions/faq-wattsmart-program)
- RMP program contact cited: battery@RockyMountainPower.net — via search summary of [RMP page](https://www.rockymountainpower.net/savings-energy-choices/wattsmart-battery-program.html)
- Incentive amounts conflict across sources (see Q5): $400/kW capped $2,000/household from May 1, 2025 (FranklinWH, SolarEdge) vs flat tiers ($1,000 for single battery <10 kW; $2,000 for single battery >=10 kW) per official page/2026 guide; Tesla says up to $2,000 upfront plus $172.50/yr per Powerwall 3. — [FranklinWH](https://www.franklinwh.com/homeowner-incentives/wattsmart-battery-program/); [SolarEdge](https://www.solaredge.com/us/incentives/rocky-mountain-power); [Tesla](https://www.tesla.com/support/energy/virtual-power-plant/RockyMountainPower/wattsmart); [Elite Electric Pro](https://eliteelectricpro.com/rmp-wattsmart-battery-rebate-2026/)

### Inferences
- A key sequencing risk for a sales workflow: the incentive is lost if the battery is installed or the PowerClerk application filed before RMP approval date, so the application must be started before installation, not after PTO.
- The $2,000 figure appears consistent across Tesla, FranklinWH, SolarEdge; treat $2,000 as the planning ceiling per household and quote as "up to".

### Gaps
- Typical approval time and time-to-check: no source found.
- Common rejection reasons: none documented beyond "new equipment" and "approved before install"; no complaint data found.
- The exact form names/portal beyond PowerClerk: not verified.

## 2. Tesla Powerwall 3 specifics

### Takeaway
Tesla's own page lists Powerwall 3 as eligible (Powerwall+ and Powerwall 2 are not), with dispatch via the Tesla app/VPP enrollment and a 10% reserve floor. Older third-party sources (2022-24) say only sonnen and SolarEdge were eligible, so they are outdated.

### Cited Findings
- Powerwall 3 eligible with up to $2,000 upfront and $172.50/yr bill credit; Powerwall+ and Powerwall 2 not eligible. — [Tesla](https://www.tesla.com/support/energy/virtual-power-plant/RockyMountainPower/wattsmart) (via search summary)
- Enrollment offer appears in the Tesla app after commissioning and RMP approval (so the battery is enrolled/controlled through Tesla's VPP platform as the program interface). — [Tesla](https://www.tesla.com/support/energy/virtual-power-plant/RockyMountainPower/wattsmart)
- Program dictates the Powerwall is never dispatched below 10%. — [Tesla](https://www.tesla.com/support/energy/virtual-power-plant/RockyMountainPower/wattsmart); same 10% floor for sonnen per [sonnen FAQ](https://www.sonnenusa.com/frequently-asked-questions/faq-wattsmart-program)
- Older source said only sonnen and SolarEdge Home Battery could participate. — [SolarReviews](https://www.solarreviews.com/blog/rocky-mountain-power-wattsmart-battery-program) (about a year old; superseded by Tesla page)
- Seasonal use (sonnen/Utility Dive): RMP can dispatch daily March-October; Nov-Feb only for grid emergencies. Not confirmed for Powerwall 3 specifically. — [sonnen FAQ](https://www.sonnenusa.com/frequently-asked-questions/faq-wattsmart-program); [Utility Dive](https://www.utilitydive.com/news/rocky-mountain-powers-distributed-battery-grid-management-system-puts-utah/608213)
- Powerwall 3 has an integrated solar inverter (DC input); existing-solar compatibility per Tesla manuals — [Tesla Powerwall 3 design considerations](https://energylibrary.tesla.com/docs/Public/EnergyStorage/Powerwall/3/SystemDesign/en-us/GUID-3E19662A-E501-47DB-81AE-E9EC19735B8B.html) (surfaced in results, not read in detail)

### Inferences
- The Sept 1, 2025 net-metering-application cutoff on Tesla's page suggests Powerwall 3 became eligible around then; confirm with RMP.
- Control appears to run through Tesla, not a separate third-party aggregator, but no source states this explicitly.

### Gaps
- Whether RMP controls via Tesla's VPP or another aggregator: not explicitly stated.
- Powerwall 3 + existing solar compatibility specifics for the program: not found.

## 3. Retrofit battery on existing solar: interconnection, notices, permits, rate schedule

### Takeaway
Existing-solar customers get a higher retrofit rate ($600/kW) under older rules; a customer generation application via PowerClerk is still required. No source on Utah/Salt Lake County permit steps or rate-schedule requirement was found.

### Cited Findings
- Existing solar owners adding storage: $600/kW upfront vs $400/kW for new solar+battery (older rules). — [Solar Power World](https://www.solarpowerworldonline.com/2024/09/rocky-mountain-power-is-paying-solar-customers-more-incentives-if-they-add-storage-later/); eligibility for retrofit rate tied to solar installed before Sept 1, 2021 (per search summary of the Pacific Power/RMP materials; Pacific Power is a different state program) — [Pacific Power vendor handout](https://www.pacificpower.net/content/dam/pcorp/documents/en/pacificpower/savings-energy-choices/demand-response/PP_Wattsmart_Battery_Vendor_Handout.pdf)
- Program requires solar (rooftop solar alone or paired with battery). — [Utah Clean Energy](https://utahcleanenergy.org/rocky-mountain-power-wattsmart-battery-program/); [NREL](https://nrel.gov/docs/fy24osti/87134.pdf)
- Customer generation application required in PowerClerk for the incentive. — see Q1.

### Inferences
- A retrofit still needs a new generation (interconnection) application in PowerClerk; the 2025 per-household cap and flat tiers may have replaced the $600/kW retrofit rate (sources conflict).

### Gaps
- Salt Lake County/Utah permit and inspection steps for a battery retrofit: not found.
- Utility notices and required rate schedule for existing solar (e.g., Schedule 135/136/137): not found.

## 4. AC- vs DC-coupled and the solar-charging requirement

### Takeaway
No source states a coupling-type requirement. Sources describe excess rooftop solar as the intended charging source and say solar is required, but none say a battery must be charged only from solar.

### Cited Findings
- Excess solar is used to charge batteries midday; solar required; only specific manufacturers/models eligible. — [NREL](https://nrel.gov/docs/fy24osti/87134.pdf); [Utah Clean Energy](https://utahcleanenergy.org/rocky-mountain-power-wattsmart-battery-program/)
- Utah news report: customers must buy enough panels to charge the batteries. — [KUTV](https://kutv.com/news/eye-on-utah/utah-solar-battery-program-hopes-to-create-virtual-power-plants)
- SolarEdge promotes its DC-coupled battery; no statement about AC-coupled eligibility. — [SolarEdge](https://www.solaredge.com/us/incentives/rocky-mountain-power)
- Only batteries on RMP's qualifying list are eligible. — Wyoming guide via [Tigo](https://www.tigoenergy.com/bip/rocky-mountain-power-wattsmart-battery-program-wyoming)

### Inferences
- Powerwall 3 retrofit onto existing solar is typically AC-coupled to the existing inverter; whether that is accepted is unverified and must be confirmed with RMP in writing.

### Gaps
- Coupling and charge-source rules: not stated in any retrieved source; the RMP technical/eligibility documents were not reached.

## 5. How installers/Tesla word the incentive; homeowner complaints; who gets paid

### Takeaway
Marketing wording centers on "up to $2,000 upfront + annual bill credit," with the vendor caveat that program terms can change. No homeowner complaint sources (Reddit, forums, PSC) surfaced.

### Cited Findings
- Tesla: up to $2,000 upfront and $172.50 annual credit per Powerwall 3 (applies to net metering applications filed on/after Sept 1, 2025). — [Tesla](https://www.tesla.com/support/energy/virtual-power-plant/RockyMountainPower/wattsmart)
- FranklinWH/SolarEdge: $400/kW capped at $2,000 per household (cap effective May 1, 2025). — [FranklinWH](https://www.franklinwh.com/homeowner-incentives/wattsmart-battery-program/); [SolarEdge](https://www.solaredge.com/us/incentives/rocky-mountain-power)
- Fox 13 (older): average home earns $2,400 plus ~$90/yr credit. — [Fox 13](https://www.fox13now.com/news/technology/more-utahns-getting-solar-storage-batteries-joining-the-virtual-power-grid-model)
- Annual credit $15/kW starting year two (older figure). — [KUTV](https://kutv.com/news/eye-on-utah/utah-solar-battery-program-hopes-to-create-virtual-power-plants)
- Vendor disclaimers: incentives reviewed periodically and may change with 30 days' notice (sonnen); Tigo says availability, equipment eligibility and final approval are determined by the utility. — [sonnen FAQ](https://www.sonnenusa.com/frequently-asked-questions/faq-wattsmart-program); [Tigo](https://www.tigoenergy.com/bip/rocky-mountain-power-wattsmart-battery-program-wyoming)
- Who is paid: the check is issued after the customer submits the participation/incentive application (implies customer-facing payment); no source addresses assignment of the incentive to the installer. — [RMP page via summary](https://www.rockymountainpower.net/savings-energy-choices/wattsmart-battery-program.html)

### Inferences
- Safest quote wording: "up to $2,000 (RMP-determined), subject to RMP approval, new equipment, application before install, 4-year commitment with prorated clawback."

### Gaps
- Homeowner complaints (delays, denials, program caps): none found; no Reddit or forum content surfaced.
- Salt Lake installer quote language: none found.
- Whether the installer can be assigned the incentive: no source found.
