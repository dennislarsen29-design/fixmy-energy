# Salt Lake City metro solar-homeowner lead data sources (late 2026)

Research limits: WebFetch could not reach gis.utah.gov, apps.saltlakecounty.gov, secure.utah.gov, solarpowerworldonline.com or tracerfy.com (hosts not allowed in this session). Everything below comes from search-result snippets only; nothing was cross-verified on the primary page. Treat all as leads to confirm.

## Building / solar permit data (jurisdictions, portals, PermitStack, Shovels)

### Takeaway
Salt Lake City publishes permits via Utah open data and its own portals, but I found no solar-specific bulk dataset for any Utah jurisdiction. PermitStack and Shovels Utah coverage and pricing could not be confirmed. Permit data is probably a slow path versus parcel + vendor data.

### Cited Findings
- Salt Lake City has a page of "Active Building, Planning and Engineering Permits" on Utah's open data portal — [opendata.utah.gov](https://opendata.utah.gov/salt-lake-city)
- SLC says current and historical permits are searchable at SLCPermits.com; fees via the Accela Citizen Access portal — [slc.gov](https://www.slc.gov/buildingservices/how-to-research-building-permits-online/), [slc.gov permits](https://www.slc.gov/buildingservices/building-permits)
- CivicData.com lists several SLC building/planning permit datasets in CSV/JSON — [CivicData](https://civicdata.com/group/permit-data)
- A state "Building Permits Issued in Utah" data request page exists (content not read) — [secure.utah.gov](https://secure.utah.gov/datarequest/buildingpermits/index.html)
- An Apify actor scrapes statewide Utah building permits from Utah's open data portal — [Apify](https://apify.com/velvety_bedbug/utah-building-permits)
- Shovels claims 1,800+ jurisdictions and 130M+ permits via API; no public prices (quote-gated per a third-party listing); Utah completeness and a solar category not confirmed — [Shovels API docs](https://shovels.redoc.ly), [Cherre](https://cherre.com/vendors/shovels/), [Apify listing](https://apify.com/seibs.co/building-permits-intel)
- Park City has a streamlined permit route for systems under 15 kW; Provo avg ~49 days to approval per one dataset; Utah solar contractors need DOPL S202 license — [Park City](https://parkcity.gov/departments/sustainability/renewables/solar-pv-permitting-info), [Provo (PermitMint)](https://permitmint.com/permits/utah/provo/solar/), [Solar Permit Solutions](https://www.solarpermitsolutions.com/blog/what-permits-do-i-need-to-install-solar-panels-in-utah)
- Apify marketplace has "building permit leads (roofing, solar, HVAC)" actors, quality unknown — [Apify](https://apify.com/nerolabs/building-permit-leads)

### Inferences
- Utah cities mostly use Accela/own portals; a per-city scrape for 6 counties is a heavy lift. A vendor (Shovels, or PermitStack if it covers Utah) is likelier worth a test pull.

### Gaps
- PermitStack Utah coverage and price: web search returned nothing about PermitStack itself. The existing repo pipeline already calls PermitStack with a `state=UT` parameter (see CLAUDE.md), unverified; the fastest test is one live call for a Utah city.
- Which jurisdictions (West Jordan, Sandy, Draper, Lehi, Orem) have bulk export/API: not found.
- Shovels price and Utah solar coverage: not found.

## Utility / state program data

### Takeaway
No public address- or zip-level list of Utah solar customers was found. Aggregate counts exist; address-level data would require a data request.

### Cited Findings
- Utah has no statewide net metering; Rocky Mountain Power cohorts: NEM (applied before Nov 15, 2017), transition (through Oct 30, 2020), export credit after — [Utah DPU](https://commerce.utah.gov/dpu/electric/rooftop-solar-resources/), [Utah OCS](https://www.ocs.utah.gov/rooftop-solar)
- State install-count estimates differ: 73,571 (Landgate) vs 82,527 (SEIA) — [Landgate PDF](https://landgate.com/_files/ugd/fe762a_aa8feb76f72549429801c59f06d93b73.pdf), [SEIA](https://seia.org/wp-content/uploads/2026/05/Utah.pdf)
- RMP annual solar-incentive reports and data responses are in PSC dockets — [pscdocs.utah.gov](https://pscdocs.utah.gov/electric/22docs/2203523/324091UtSPIP2022AnlRprt5-24-2022.pdf)
- Utah residential solar tax credit ended for tax years after 2023 (carryforwards through 2027); no claimant counts found — [Utah Tax Commission](https://incometax.utah.gov/credits/renewable-energy-systems), [Utah energy office](https://energy.utah.gov/renewable-energy/)

### Inferences
- Tax-credit claimant data is confidential tax data in practice; unlikely to yield addresses.

### Gaps
- Zip/address-level interconnection list: not found; would need GRAMA request (low odds, privacy).

## Ownership / parcel data

### Takeaway
Owner names are searchable one at a time on the Salt Lake County Assessor site; bulk owner data is unclear from free sources but a commercial parcel file (~$250 for Salt Lake County, ~98% owner coverage) was listed.

### Cited Findings
- Assessor owner search needs 3+ letters, last name first; owner of record updated yearly after May tax roll — [SL County Assessor](https://apps.saltlakecounty.gov/assessor/new/query.cfm), [field descriptions](https://apps.saltlakecounty.gov/assessor/new/FieldDescriptions/parcelRecord2.html)
- County assessor maps page lists a shapefile download; owner fields not confirmed — [maps by data type](https://apps.saltlakecounty.gov/assessor/new/maps-by-data-type.html)
- Utah state GIS (UGRC/SGID) publishes Salt Lake County parcel layers (basic and LIR); owner fields not confirmed; state Government Owned Parcels layer has owner name only for government land — [gis.utah.gov](https://gis.utah.gov/data/cadastre/parcels)
- County GIS retention schedule lists a Recorder parcel file with owner name "restricted" — [retention PDF](https://saltlakecounty.gov/globalassets/1-site-files/records-management/retention/gisreten.pdf)
- ReportAll USA sells Salt Lake County parcels for $250 (owner 98%, mailing 99.2% coverage; 393,521 parcels) — [ReportAll](https://reportallusa.com/store/Utah/49035); Land Records lists 420,455 parcels with owner/mailing fields, price/terms unknown — [Land Records](https://www.landrecords.us/documentation/coverage/counties/49-035-salt-lake). Regrid has a Utah data store (price not seen) — [Regrid](https://app.regrid.com/store/us/ut)
- Utah County publishes TaxParcel metadata — [Utah County](https://maps.utahcounty.gov/Metadata/TaxParcel_Metadata.pdf)
- County recorder Data Services is a subscription product — [SL County data services](https://apps.saltlakecounty.gov/data-services/)

### Inferences
- Utah (unlike California's AB 1785) does not appear to bar owner names online, but I did not verify this.
- A parcel file alone has no solar flag; it must be joined to permit/aerial data.

### Gaps
- Licensing terms (may restrict resale/marketing use), and owner fields in SGID/county shapefiles: not verified (hosts blocked).
- Davis, Weber, Tooele, Summit parcel sources: not researched.

## Defunct / struggling Utah-active installers

### Takeaway
Confirmed Utah-linked closures: Lumio (Ch. 11, 2024), Sunworks and Solcius (Provo; Ch. 7), PureLight Power (shut late 2025), Legend Solar (2018), Elan Solar (state action 2024). Blue Raven and Bright Planet had layoffs, not closures.

### Cited Findings
- Lumio (Utah-based) filed Ch. 11 in 2024; customers' contracts moved to SunStrong — [Solar Builder](https://solarbuildermag.com/news/residential-solar-player-lumio-files-for-bankruptcy/), [CBS](https://www.cbsnews.com/texas/news/bankruptcies-leave-some-solar-customers-with-broken-panels/)
- Sunworks (HQ Provo) and subsidiaries filed Ch. 7; it bought Solcius in 2021; EnergyAid bought assets of Titan, Sunworks, Solcius and offers monitoring/service for a fee — [Solar Power World Apr 2025](https://www.solarpowerworldonline.com/2025/04/qa-new-solar-service-provider-takes-on-titan-sunworks-customers/)
- PureLight Power shut down late 2025 across nine states incl. Utah, blaming OBBBA — [Solar Power World](https://www.solarpowerworldonline.com/2025/12/26/residential-installer-purelight-power-shutters-operations-blames-obbba/), [CleanTechnica](https://cleantechnica.com/2025/12/30/solar-company-spread-across-9-states-shuts-down-shop-blames-trumps-obbba/)
- Legend Solar (St. George) stopped completing installs in UT/NV/OR (2018) — [SL Tribune](https://www.sltrib.com/news/2018/03/21/customers-across-three-states-may-be-out-thousands-of-dollars-as-utah-based-legend-solar-shows-signs-of-crumbling/)
- Elan Solar (Orem): state ordered it to halt; about 140 customers allegedly misled — [Time/SL coverage via search](https://www.ksl.com/article/50676884/homeowners-paid-big-money-for-solar-powered-system-say-utah-installer-has-not-finished-job)
- Other Utah closures on a national list: Encor Solar, Saveco Solar, Utah Solar Group — [SolarInsure](https://www.solarinsure.com/the-complete-list-of-solar-bankruptcies-and-business-closures)
- Altaray/Empire Solar left Minnesota homeowners with unfinished work; assets sold 2021 — [Solar Power World](https://www.solarpowerworldonline.com/2021/11/suntuity-solar-purchases-empire-solar-assets-bankruptcy-court/)
- Blue Raven: WARN notice, Orem, Nov 2024 (766 workers); no closure found — [WARN Tracker](https://www.warntracker.com/layoff/blue-raven-2024-11-10)
- Bright Planet Solar (Provo) laid off 60 in May 2026 — [SL Tribune](https://www.sltrib.com/news/2026/05/13/bright-planet-solar-lays-off-60/)
- Utah requires residential solar retailers to be registered from July 1, 2026 (surety $100k/$200k/$300k); no public registered-list found — [Utah DCP](https://commerce.utah.gov/dcp/residential-solar-panel-retailer/)

### Inferences
- Utah customer counts per closed installer are not published; Sunworks/Solcius, Lumio and PureLight (legacy) are the largest orphan pools locally. A retailer that fails to register after 7/1/2026 could be a new orphan source.

### Gaps
- Utah customer counts, exact shutdown dates for Pink Energy (no Utah link found), Titan, Freedom Forever, ADT/SunPro in Utah, Vivint/Sunrun Utah status: not found. Sunrun/Vivint presumably still operating (unverified).

## Skip trace / DNC vendors

### Takeaway
Tracerfy advertises ~$0.02 per hit and $0.02/phone DNC scrub; BatchData tiers ~ $0.03/matched record at 100k/mo. All vendor-marketing figures.

### Cited Findings
- Tracerfy: $0.02/hit bulk or single lookup, charges only matches; property intelligence $0.10/record; DNC scrub $0.02/phone; enhanced trace 15 credits/lead; web upload min 1,000 records — [Tracerfy](https://tracerfy.com/), [property skip tracing](https://tracerfy.com/property-skip-tracing/)
- BatchData benchmark: $0.03/matched record at 100k/mo (Growth), $0.01 at 3M/mo — [BatchData blog](https://batchdata.io/blog/skip-tracing-cost-benchmarks)
- NOTE (repo CLAUDE.md, 2026-08-08): the Tracerfy advanced trace the project used returned NO DNC data and cost 2 credits/lead, conflicting with the $0.02 headline; its account was out of credits.

### Inferences
- Run an explicit DNC scrub (Tracerfy's or the FTC registry) before dialing Utah numbers. Utah also has its own telemarketing rules (not researched).

### Gaps
- Melissa, REIPro coverage/prices, Utah-specific match rates: not researched.

## Plan for 1,000+ SLC solar addresses in a week

### Takeaway
No single source gives solar-home addresses. Fastest credible route: vendor permit data (test PermitStack/Shovels), supplemented with parcel file + installer-named lists, then skip trace.

### Inferences (my proposed plan, unverified)
1. Day 1: test-call PermitStack for Salt Lake/Utah/Davis cities using Sunworks, Solcius, Lumio, PureLight, Legend, Elan, Empire/Altaray names; request a Shovels quote asking for "solar" permits in six counties.
2. Day 1-2: buy a Salt Lake County parcel file (~$250 ReportAll); check its owner/mailing fields; pull Utah County TaxParcel and SGID layers for other counties.
3. Day 2-3: join permits to parcels on address to attach owner names; absentee-owner flag from mailing address.
4. Day 3-4: skip trace via Tracerfy (verify credits) then DNC scrub phones.
5. Day 4-5: de-dupe and load into the dialer/Doors tool.
6. Backup if permits fall short: Salt Lake City Utah open-data permits filtered to electrical/solar; scrape one or two Accela portals.

### Gaps
- Feasibility of 1,000+ in a week depends on PermitStack Utah coverage; could not verify.
