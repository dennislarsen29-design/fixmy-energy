# Smart-meter anomaly detection (HVAC / pool pump / solar): products, regulation, responsible commercial use

Research limits: ~13 searches, 1 fetch (cslb.ca.gov host not resolvable in this session, so CSLB pages were read only via search snippets). Most evidence is vendor marketing or secondary sources; independent accuracy validation was NOT found. Nothing here is legal advice.

## 1. Who already flags HVAC / pool pump / equipment faults from meter data, how well, and how do they word it?

### Takeaway
Utility-side vendors (Bidgely, Oracle Opower) disaggregate AMI interval data into heating/cooling/pool-pump categories and sell it as targeting/engagement tools; accuracy numbers are vendor claims only. Consumer device-level detection (Sense) is openly imperfect, while whole-home totals are reliable. Solar monitoring vendors flag underperformance, but I found no first-party documentation of their detection logic or thresholds.

### Cited Findings
- Bidgely markets appliance-level disaggregation incl. pool pumps and heating/cooling, claims 15-minute resolution (e.g., whether an electric heater ran in a given interval) — [Bidgely disaggregation](https://bidgely.com/disaggregation)
- Bidgely whitepaper describes a classifier that infers HVAC type and primary fuel from AMI data — [Bidgely TOU whitepaper](https://go.bidgely.com/rs/492-VKN-623/images/Bidgely-TOU-Whitepaper.pdf)
- Deployments: New Hampshire Electric Co-op disaggregated hourly data for ~60,000 residential members (incl. pool pump and cooling categories); PSEG Long Island will use disaggregation to target pool-pump and gas-heating customers. No validated accuracy reported in either — [NHEC release](https://businesswire.com/news/home/20220329005188/en/5177505/Bidgely-Partners-with-New-Hampshire-Electric-Cooperative-to-Enhance-Rate-Design-Strategies-for-Utility-Customers), [PSEG LI release](https://www.businesswire.com/news/home/20240307139429/en/5610495/PSEG-Long-Island-Expands-Partnership-with-Bidgely-to-Build-Comprehensive-Energy-Efficiency-Program)
- Oracle claims home energy reports deliver 1.5–2.5% savings across 100+ deployments, and that deep learning gives "up to 99%" accuracy in appliance disaggregation (vendor claims); can show heating/cooling usage with no devices in the home — [Oracle Opower overview](https://oracle.com/a/ocom/docs/opower-energy-efficiency-solution-product-overview.pdf), [Oracle What Uses Most notes](https://docs.oracle.com/en/cloud/saas/readiness/utilities/2025/opower-oct25/25oct-util-opower-wn-f41253.htm)
- Opower disaggregation-driven offers reported 2x thermostat adoption and 5x program participation at SMECO (engagement metrics, not energy savings or fault-detection accuracy) — [Oracle Opower Electrification / MEEA deck](https://www.meeaconference.org/sites/meeaconference.org/files/Paul%20McDonald%20-%20A1%202024.pdf)
- Sense: its help center says it may not identify every device, with low-wattage electronics harder; detection takes days to weeks. Reviewers/users report frequent mislabeling while whole-home totals are dependable — [Sense help](https://help.sense.com/hc/en-us/articles/360001486688), [Sense community accuracy thread](https://community.sense.com/t/how-accurate-is-sense-summary-of-sense-accuracy-measurements-vs-utilities/14193?page=4), [Green Building Advisor thread](https://www.greenbuildingadvisor.com/question/home-energy-monitors)
- Enphase Enlighten: secondary sources say it supports threshold alerts on expected monthly output and flags panels trailing neighbors; SolarEdge gives panel-level data via optimizers and an alerts center. Secondary/consumer sources only — [Florida Solar Design Group](https://floridasolardesigngroup.com/inside-enphase-enlighten-solar-monitoring), [solartechonline](https://solartechonline.com/blog/how-to-monitor-solar-panel-output/), [consumeraffairs](https://www.consumeraffairs.com/solar-energy/best-solar-monitoring-systems.html)
- Conflicting data-interval claims for Enlighten (5 min vs 15 min in app) in the same secondary sources; unresolved — [consumeraffairs](https://www.consumeraffairs.com/solar-energy/best-solar-monitoring-systems.html)

### Inferences
- Disaggregation is mature enough to sort homes into "has pool pump / big cooling load / likely EV" for targeting, but "fault" claims (failing compressor, dirty coil) are a harder inference nobody here substantiates with public accuracy data. Meter-only findings should be framed as lead qualifiers, not diagnoses.
- Industry wording pattern (inferred from the above): vendors describe outputs as estimates/insights and use engagement language; they do not claim to certify equipment faults.

### Gaps
- Not found: independent ground-truth accuracy studies for any disaggregation vendor; EnergySavvy/Uplight, Aurora, Solar-Log, PVFleet-type fault detection, Tesla app behavior; Enphase/SolarEdge official alert-logic docs; wording samples of actual alerts. SDG&E/SDCP/Clean Energy Alliance HVAC tune-up program pages were not found (see Q2).

## 2. Which findings can a solar service company act on commercially, and how are partner economics structured?

### Takeaway
Actionable leads: EV rate plan (SDG&E publishes clear rate tables), battery sizing, NEM planning, variable-speed pump and HVAC referrals. Current SDG&E incentive status for pumps/HVAC could not be confirmed; referral economics are constrained by CSLB's rules on referral fees (below), so I found no verified "typical referral model" numbers.

### Cited Findings
- SDG&E EV-TOU-5 (April 1, 2026 tables): super off-peak about $0.1285/kWh summer and $0.1212 winter; summer on-peak about $0.8029; MB variant ~20% lower; tables are per-kWh totals excluding the daily charge — [SDG&E EV-TOU-5 rate table 4/1/26](https://www.sdge.com/sites/default/files/regulatory/4-1-26%20Schedule%20EV-TOU-5%20Total%20Rates%20Table.pdf), [MB table](https://www.sdge.com/sites/default/files/regulatory/4-1-26%20Schedule%20EV-TOU-5-MB%20Total%20Rates%20Table.pdf)
- Third-party (Stellar Solar) says super off-peak is midnight–6am weekdays and midnight–2pm weekends; on-peak 4–9pm; says Solar Billing Plan customers are on EV-TOU-5 pricing. Secondary; confirm against tariff — [Stellar Solar](https://stellarsolar.net/2026/03/02/sdge-tou-rates-in-2026-everything-you-need-to-know/)
- Note: the in-repo CLAUDE.md EV_RATE_EST uses 6/1/26 numbers (0.12261 summer super off-peak); this search surfaced 4/1/26 ~0.1285. The two differ, suggesting rates changed between tables or the figures include different components. Re-check before quoting.
- SDG&E pool pump program: a May 2021 sheet listed a $200 rebate for ENERGY STAR variable-speed pumps (1–3 hp) bought at participating retailers, installed professionally, replacing single/two-speed pumps; 2020 sheet same. Dated; current status unknown — [SDG&E 2021 sheet](https://www.sdge.com/sites/default/files/sdge-pool-pump-store-and-product-list_may_6_2021_final.pdf), [2020 sheet](https://www.sdge.com/sites/default/files/documents/Pool_Pump_eligibility_Feb_18_2020.pdf?nid=15391)
- CSLB: referral fees are "illegal inducements" under BPC §7157(d) (civil penalties $100–$1,000 first offense); referral services may keep directories of licensed contractors but may not solicit/negotiate contracts for them (§7026); license required at $500+ labor and materials (§7028); unlicensed-activity citations $200–$15,000 (§7028.7); CSLB has bulletins on lead generation/solar brokers and online marketplaces — [CSLB lead-gen/solar broker bulletin (via search, not fetched)](https://www.cslb.ca.gov/Media_Room/Industry_Bulletins/2020/January_9.aspx), [CSLB marketplace bulletin](https://www.cslb.ca.gov/Media_Room/Industry_Bulletins/2018/July_20.aspx), [BPC 7028.7](https://california.public.law/codes/business_and_professions_code_section_7028.7)
- CSLB: a C-46 license is required to install/maintain/repair a home PV system under a solar sale/lease; Reed v. Sunrun (2018) addressed whether a seller arranging licensed installation must itself be licensed (outcome not confirmed) — same CSLB bulletin results above

### Inferences
- Cleanest commercial paths for a solar company: (1) EV-plan switch advice (no contractor work, uses published tariffs), (2) battery/panel sizing inside its own C-46/partner scope, (3) NEM-expiry planning content. These avoid referral-fee exposure.
- For HVAC/pool, safer than a paid per-lead referral: give the homeowner a neutral "get an HVAC evaluation" recommendation, let them contract directly with a licensed contractor, and avoid fee-per-referral arrangements until counsel confirms what BPC §7157(d) permits for non-licensees (my reading of the snippet; unverified).

### Gaps
- No verified data on referral/partner economics (typical %/flat fees) for HVAC, pool, heat-pump water heater. No current SDG&E/SDCP/Clean Energy Alliance HVAC tune-up or heat-pump water heater program info found. No verified 2026 pool pump rebate status. No sources on a variable-speed pump retrofit payback.

## 3. California rules for using customer energy data, and licensing-safe wording

### Takeaway
CPUC D.11-07-056 sets privacy rules for utility-held usage data and third-party access (Green Button Connect); CCPA/CPRA governs a company's own handling, with new 2026 CPPA regulations touching automated decision-making and risk assessments. C-20 (HVAC) and C-53/D-35 (pool) licensing limits mean a non-licensee should not advertise or contract for that work.

### Cited Findings
- D.11-07-056 (July 28, 2011) adopted privacy/security rules for PG&E, SCE, SDG&E usage data; a utility may disclose to a third party without consent only on Commission order or for a primary purpose under contract with protections no weaker than the utility's; D.12-08-045 extended to gas and CCA customers — [CPUC decision PDF](https://www.cpuc.ca.gov/-/media/cpuc-website/divisions/energy-division/documents/demand-response/list-of-registered-demand-response-providers-drps_aggregators-and-faq/decision-d1107056.pdf), [CPUC docs](https://docs.cpuc.ca.gov/PublishedDocs/Published/G000/M026/K020/26020887.PDF)
- D.13-09-025 approved utilities' third-party access programs; Green Button Connect lets customers share usage with authorized third parties (California among five states) — [NARUC compendium](https://pubs.naruc.org/pub/AF1AF968-DB45-35FD-B452-CEB3663FA5C7)
- CPRA: notice at collection must cover sensitive personal information, sale/sharing, retention; precise geolocation (~1/8 sq mi) is sensitive; "Limit the Use of My Sensitive PI" link or opt-out signal honoring required; limits flow to service providers. Source is a 2020 pre-enactment law-firm piece — [Orrick](https://orrick.com/Insights/2020/05/WaitCCPA-20-What-Is-the-California-Privacy-Rights-Act-of-2020-and-Will-It-Become-Law), [HLC](https://www.hlc.com/en/publications/cpra-countdown-new-compliance-obligations-and-challenges-around-sensitive-personal-information)
- CPPA regulations on ADMT, risk assessments, cybersecurity audits approved by OAL Sept 22, 2025; effective date reported as Jan 1, 2026 by one firm and Oct 1, 2025 (ADMT compliance by Jan 1, 2027) by another — conflicting. ADMT applies to significant decisions (finance, housing, employment, education, healthcare), not obviously to marketing a service call — [DLA Piper](https://www.dlapiper.com/en/insights/publications/2025/09/ccpa-2025-updated-regulations), [Duane Morris](https://blogs.duanemorris.com/techlaw/tag/ccpa/), [Alston](https://alston.com/en/insights/publications/2025/10/ccpa-cybersecurity-audits-admt-risk-assessments)
- C-20 contractor ads may not promise plumbing/electrical/roofing without those licenses; misrepresenting licensure or scope is independently prohibited (third-party exam-prep sources; bond/threshold details conflict) — [open-exam-prep](https://open-exam-prep.com/study-guides/ca-hvac-contractor/cslb-licensing-law/advertising-disclosure-subcontracting)
- C-53 official scope: constructs pools/spas incl. solar heating; official text does not mention pump replacement. Third-party sites assign pump replacement/repair to D-35 (pool/spa maintenance) — unverified against CSLB D-35 page — [CSLB C-53](https://www2.cslb.ca.gov/about_us/library/licensing_classifications/Licensing_Classifications_Detail.aspx?Class=C53), [terms.law](https://terms.law/2025/12/05/pool-spa-contractor-dispute-letters/)

### Inferences
- If the company collects interval data via Green Button/homeowner upload (not from the utility under contract), D.11-07-056 largely governs the utility's side; the company's duties are CCPA/CPRA (notice at collection, purpose limitation, retention, deletion) and truthful-advertising law. Whether CCPA's thresholds apply to a small firm depends on revenue/volume tests I did not verify (small businesses can be exempt) — counsel should confirm.
- Suggested disclaimer elements (my drafting, for counsel review): data came from the homeowner's upload and is used only to prepare this evaluation; analysis is an estimate from meter patterns and cannot diagnose equipment; we are not HVAC or pool contractors and do not perform or guarantee that work; any referral is optional, no fee is paid by or to us for it (only if true); savings/rates are estimates based on published tariffs that change; retention and deletion on request.

### Gaps
- Did not read full text of D.11-07-056 Attachment D, Civil Code §1798.140, 11 CCR §7050, BPC §7157, or the CSLB lead-gen bulletin (fetch blocked/search only). No source on whether Green Button data shared with an installer is "utility customer data" under CPUC rules vs ordinary personal data. No verified authority that HVAC referral without fee is safe; no CSLB D-35 official page read.

## 4. Best practice for presenting anomaly detections to homeowners

### Takeaway
I found no authoritative human-factors guidance for energy-anomaly alerts in this research; the supportable practice comes from vendor limitations and licensing rules above, with the rest being inference.

### Cited Findings
- Sense's own documentation concedes it may not identify every device and improves with more data — a model for stating limits up front — [Sense help](https://help.sense.com/hc/en-us/articles/360001486688)
- Reviewers report frequent mislabeling by device-level disaggregation, which is the false-alarm risk to guard against — [Green Building Advisor](https://www.greenbuildingadvisor.com/question/home-energy-monitors)
- Vendor accuracy figures ("up to 99%", "most accurate") are unaudited; independent validation was not found — [Oracle](https://docs.oracle.com/en/cloud/saas/readiness/utilities/2025/opower-oct25/25oct-util-opower-wn-f41253.htm)

### Inferences
- Use tiered confidence tied to data volume: e.g., "possible" with <3 months of data or a single anomaly; "likely" when a pattern repeats across days/seasons and a second data source (production screenshot, bill) agrees; never "confirmed" without a technician or manufacturer error code.
- Use "suggests, not proves" phrasing: "Your meter data shows X pattern, which is consistent with Y; it can also be caused by Z. We recommend a licensed [HVAC/pool] professional check it."
- Reduce false alarms: require persistence (multiple days), compare same season year over year, exclude holidays/vacations and occupancy changes, and show the evidence (chart, dates) rather than a verdict. Always list at least one benign explanation.
- Never state a dollar loss as fact; label as estimate with the rate used and its source date.

### Gaps
- No empirical data on false-positive rates for HVAC/pool anomaly flags from interval data; no user-research on homeowner reactions to such alerts.
