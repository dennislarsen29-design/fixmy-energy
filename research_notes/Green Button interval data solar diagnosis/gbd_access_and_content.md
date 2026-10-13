# Green Button Data (GBD) for SDG&E residential solar customers: access, content, limits

Research note, compiled 2026-10-13. Environment note: direct fetches of sdge.com, nectarclimate.com and cpuc.ca.gov failed (DNS/proxy), so every SDG&E claim below comes from WebSearch result summaries of those pages, not from reading the pages in full. Treat as unverified against primary text where flagged.

## 1. Access paths (Download My Data vs Connect My Data) and which is realistic for a small installer

### Takeaway
SDG&E offers two paths: customer-run Download My Data (file from the customer's My Account) and Green Button Connect My Data (GBC), where a registered third-party app receives data via OAuth after customer authorization. For a small diagnostic/repair company, Download My Data (customer sends the file, or logs in with the rep present) is the only path with no registration; GBC requires a developer application, SDG&E review and a customer-facing app.

### Cited Findings
- SDG&E's Green Button page says electricity data is available through both Download My Data and Connect My Data; natural gas is only through Download My Data. — [SDG&E Green Button](https://sdge.com/node/6181) (via search summary)
- Download steps per third-party guides: log into My Energy Center / My Account, open Usage, click the Green Button Download button below the usage graph, pick date range, resolution and format (CSV or XML/ESPI). — [Nectar SDG&E guide](https://nectarclimate.com/utilities/san-diego-gas-electric-sdge) (search summary; third party)
- GBC: SDG&E says it "gives SDG&E customers more control over sharing their smart meter electrical data with third parties"; customers choose a registered app and enroll via My Account. — [SDG&E Green Button Connect](https://www.sdge.com/node/5336)
- GBC developer onboarding: an application form is reviewed by an SDG&E representative who follows up with next steps; it asks for a business summary, feature list and planned data use; submissions go through SDG&E's co-branding review and approved content cannot be altered; terms include an indemnification clause. — [SDG&E GBC developers](https://www.sdge.com/green-button/using-green-button-connect-my-data-developers) and [GBC page](https://www.sdge.com/node/5336)
- The developer page links California Green Button requirement documents (required-field matrix, requirements spec) plus NAESB/NIST resources. — [SDG&E GBC developers](https://www.sdge.com/node/6456) (documents themselves not opened)
- Technical shape of GBC: developer registers with SDG&E, customer authorizes via OAuth 2.0, data pulled from RESTful ESPI endpoints as Atom XML; rate limits not publicly published. — [Nectar San Diego Community Power guide](https://nectarclimate.com/utilities/san-diego-community-power) (third party)
- Scale as of 2016 only: 28 registered third parties, ~5,600 files/day. — [Green Button Alliance SDG&E spotlight](https://www.greenbuttonalliance.org/news/san-diego-gas-and-electric-sdge)
- Regulatory basis: D.11-07-056 set privacy/security rules for Advanced Meter usage data for SDG&E, SCE, PG&E; D.12-08-045 extended to gas utilities, CCAs and some ESPs; rules reach companies that, after customer authorization, get usage data directly from the utility. — [CPUC docs (search summary)](https://docs.cpuc.ca.gov/PublishedDocs/Published/G000/M077/K191/77191980.PDF)
- D.13-09-025 adopted a "wait and see" registration approach: third parties may receive data with customer authorization, meeting technical eligibility, acknowledging tariff rules, and not being prohibited by the Commission. — same CPUC source (summary)
- Customers may revoke third-party authorization at any time; disclosure limited to what is reasonably necessary for a specific primary purpose (data minimization, Rule 27). — PG&E filing summarized in [CPUC filing](https://files.cpuc.ca.gov/PG&E20150130ResponseToA1312012Ruling/2013/01/SB_GT&S_0656664.pdf) (secondary)

### Inferences
- A diagnostic/repair company is unlikely to justify building a registered GBC app; the practical route is customer-initiated download (or customer shares screen/file). GBC makes sense only if the company builds an ongoing monitoring product.
- Because SDG&E's co-branding review and indemnification apply to GBC, expect weeks, not days, but no timeline was found.

### Gaps
- Fees for GBC registration/access: not found (no source states any fee or its absence).
- Onboarding duration, testing/certification steps, minimum technical requirements: not found; requirement documents not opened.
- Exact current SDG&E tariff rule number governing third-party release: not verified (Rule 27 is cited for PG&E-type language; SDG&E rule not confirmed).
- Whether SDG&E also offers a "Share My Data"-branded path: no evidence; that name is PG&E's. SDG&E uses "Green Button Connect My Data".
- Full text of D.11-07-056 / D.13-09-025 not read.

## 2. Interval resolution, history length, units, timestamps, latency

### Takeaway
SDG&E states the download covers up to 13 months of smart-meter usage at hourly or 15-minute intervals. Which resolution a residential account actually gets is disputed across third-party guides.

### Cited Findings
- "Up to 13 months of Smart Meter energy usage data, for every hour or 15 minutes of every day." — [SDG&E Green Button](https://sdge.com/node/6181) (search summary)
- Launch coverage also cites up to 13 months of past consumption. — [East County Magazine](https://archive.eastcountymagazine.org/node/8456)
- One guide says user selects 15-minute or hourly at download; another says residential = hourly and commercial = 15-minute; a third says business 15-min, residential 60-min. Conflict unresolved. — [Nectar](https://nectarclimate.com/utilities/san-diego-gas-electric-sdge); [Energy Toolbase](https://energytoolbase.com/newsroom/Blog/we-updated-our-green-button-data-instructions) (third parties, contradict each other)
- An older guide describes date range limit up to 365 days per export. — [Energy Toolbase attachment](https://help.energytoolbase.com/hc/en-us/article_attachments/360089485392) (dated third party)

### Inferences
- Plan for hourly as the safe assumption and 15-min as possible; detect resolution from the file itself (ESPI intervalLength 900 vs 3600 s).

### Gaps
- Units (kWh vs Wh with powerOfTenMultiplier), timezone encoding, and update latency (next-day?) for SDG&E: not found. Not verified.
- Whether 15-min is available for residential on SDG&E: conflicting, unverified.

## 3. Net-metered solar customers: channels, gross production visibility

### Takeaway
No SDG&E source was found stating exactly which channels (delivered/received/net) appear in its Green Button files. Gross behind-the-meter solar production is almost certainly not in the utility data, but this is inference, not confirmed.

### Cited Findings
- SDG&E's Green Button page describes "usage data"; it does not (in the retrieved text) mention export/generation. — [SDG&E Green Button](https://sdge.com/node/6181)
- SDG&E's virtual net metering brochure: bill shows previous/current reads, with allocated generation deducted from total consumption and shown as Total kWh. — [VNEM FAQ](https://energycenter.org/sites/default/files/docs/nav/programs/smp/10.%20SDG%26E%20VNEM%20FAQ%27s.pdf)
- Other-utility analog (NH co-op, NOT SDG&E): monthly downloads can merge delivered/received/net, while daily/hourly downloads give the breakdown. — [NHEC](https://nhec.com/?p=9072) (not SDG&E)

### Inferences
- NEM meters are bidirectional; the utility meter measures only grid import and export at the service point. Gross PV production (inverter-side) is not measured by it unless a separate production meter exists. Use inverter/monitoring data for production; use Green Button for import/export. Self-consumption = production − export, which requires both datasets.

### Gaps
- Whether SDG&E publishes import and export as separate series in CSV/ESPI (vs net only): not found. Needs a real sample export.
- Separate NEM generation meters at SDG&E (e.g., for NEM-MA/ VNEM / solar with production metering): not verified.

## 4. File formats and fields

### Takeaway
ESPI XML (Atom feed) is the standard; CSV layouts vary by utility. No SDG&E sample header was found.

### Cited Findings
- ESPI structure: Atom, MeterReading, ReadingType, IntervalBlock, IntervalReading entries; interval start times must be unique (espi:timePeriod/espi:start). — [Green Button Alliance FB_04](https://www.greenbuttonalliance.org/fb04)
- ReadingType carries flowDirection, uom and powerOfTenMultiplier; values are integers scaled by the multiplier. — [GBA powerOfTenMultiplier](https://greenbuttonalliance.org/poweroftenmultiplier)
- CSV exports differ by utility; parsers need configurable date format, interval length, data column and header-row count. — [HelioScope](https://help-center.helioscope.com/hc/en-us/articles/8644752005523)

### Inferences
- Parse ESPI by: reading ReadingType (uom, multiplier, flowDirection, intervalLength), then each IntervalReading (timePeriod start in epoch seconds UTC, duration, value × 10^multiplier). flowDirection distinguishes forward (delivered) vs reverse (received) when present.
- For CSV, auto-detect header row and resolution rather than hard-coding SDG&E column names.

### Gaps
- Actual SDG&E CSV header and sample rows: not found; could not download a sample.

## 5. Limitations, gotchas, consent

### Cited Findings
- Privacy rules apply to third parties accessing usage after customer authorization; customers can revoke at any time; disclosure limited to what is necessary for the stated purpose. — CPUC sources above (secondary)

### Inferences (not sourced; verify before relying)
- DST: ESPI timestamps are UTC epoch so are safe; CSV local timestamps will have a 23- and 25-hour day and an ambiguous repeated hour in November. Expect missing/estimated intervals; check any estimated-read flags.
- Consent to collect from a homeowner: written/recorded statement of what data (interval usage, period), purpose (diagnostic/proposal), retention, no resale, and ability to revoke; have them download or authorize themselves rather than collecting their SDG&E password. Counsel should confirm CPUC privacy-rule applicability to a non-registered company receiving a file directly from the customer.

### Gaps
- DST handling, missing-interval and estimated-read behavior, demand (kW) availability, and update latency in SDG&E files: not found.
- Legal sufficiency of consent language: not researched; recommend legal review.
