# Schneider Conext XW+ system: MPPT 80 600, Battery Monitor, PDP, Xanbus (field troubleshooting)

NOTE ON METHOD: WebFetch could not reach solar.se.com, solacity.com or manualshive.com (hosts blocked in this session: "ENOTFOUND"). All content below comes from WebSearch result summaries only. The primary manuals (listed under Gaps) were NOT read, so LED tables, full fault-code tables, and Battery Monitor fault messages are unverified/missing. Do not treat anything here as a complete code list. Re-run with solar.se.com allowed in session network settings to read the PDFs.

## MPPT 80 600: LEDs, fault codes, causes of zero production, reset

### Takeaway
Only a handful of MPPT 80 600 fault codes (F2, F4, F5, F74, F75) could be tied to a source, via search summaries of the manual. LED meanings and the reset procedure could not be confirmed.

### Cited Findings
- F2 (output capacitor over-temperature): triggers above 100 C for 5 s, auto-clears below 90 C for 30 s; "should not normally occur", service the unit if it repeats. — [Xantrex XW MPPT 80 600 manual (solaris-shop)](https://www.solaris-shop.com/content/MMPT80%20Manual.pdf) (via search summary)
- F5 (ambient over-temperature): internal ambient above 80 C for 5 s; clears below 65 C for 30 s. — [same manual](https://www.solaris-shop.com/content/MMPT80%20Manual.pdf)
- F4 (battery over-temperature) clears when battery below 55 C for 30 s; the F-code mapping was ambiguous in the summary, treat with caution. — [same manual](https://www.solaris-shop.com/content/MMPT80%20Manual.pdf)
- F74 = PV input over-voltage (input above 600 VDC); damage possible; must be cleared manually. — [Owner's Guide 990-6214B](https://sunwatts.com/content/manual/Schneider_User_Manual_Conext_600V_Charge_Controller.pdf), [solaris-shop manual](https://www.solaris-shop.com/content/MMPT80%20Manual.pdf)
- F75 = fan over-voltage (fan above 13.8 V), not a PV fault. — [Owner's Guide (hurricanewindpower)](https://www.hurricanewindpower.com/content/manuals/5826_12%20Conext%20mppt%2080-600%20Owners%20Guide.pdf)
- Third-party Modbus map lists F9/F70 as DC over-voltage and F74 input over-voltage (unverified third party). — [silo.tips Modbus map](https://silo.tips/download/modbus-map-conext-mppt-device)
- Field report: five new XW MPPT 80 600 units, four showed battery temperature of -273 and no battery voltage reading; no resolution given. — [Solar-Electric forum](https://forum.solar-electric.com/discussion/comment/413400)
- Forum expert: the Xanbus battery temperature sensor only trims charge voltage slightly; it is not an over-temperature cutoff. — [Solar-Electric forum](https://forum.solar-electric.com/discussion/comment/382584)
- Forum: a user saw ~400 V at the MPPT 80 PV input but the Combox read ~8 V; helpers asked for PV-in and battery-out terminal voltages measured at the controller. — [Solar-Electric forum](https://forum.solar-electric.com/discussion/comment/401883)

### Inferences
- A -273 battery temperature reading likely means the temperature sensor/battery data is not being received (an inference; -273 is not a real reading). Check sensor seating and Xanbus.
- For a "no production" call, a sensible first check: measure PV volts at the controller input and battery volts at its output, check PV and battery breakers, then confirm the unit appears on the Xanbus network. This is general practice, not drawn from a Schneider table.
- Since PV over-voltage (above 600 V) needs a manual clear, cold-morning high Voc from an oversized string is a plausible cause to check (inference).

### Gaps
- LED states (Charging/Event/Equalize) and their colors: not found. Likely in [Operation Guide 990-6214C](https://solar.se.com/us/wp-content/uploads/sites/7/2021/10/Conext-MPPT-80-and-100-Charge-Controllers-Operation-Guide.pdf) and [Owner's Guide 975-0560-01-01 Rev F](https://s1.solacity.com/docs/Schneider/Conext-MPPT-80-600-Owners-Guide-975-0560-01-01_Rev-F_ENG.pdf).
- Full fault/warning code list (F1, F3 etc.), PV start-up voltage and charge-profile settings, and the reset procedure: not verified.

## Conext Battery Monitor

### Takeaway
No Conext-specific fault or sync content was retrievable. Only the guide's existence and one compatibility note were confirmed.

### Cited Findings
- Owner's guide 975-0691-01-01 covers install, operation, configuration, maintenance, troubleshooting. — [Conext Battery Monitor Owner's Guide](https://solar.se.com/us/wp-content/uploads/sites/7/2021/10/Conext-Battery-Monitor-Owners-Guide_975-0691-01-01_ENG.pdf)
- The Conext Battery Monitor is reported as not compatible with lithium-ion batteries (from search summary of the guide set; verify in the manual). — [Owner's Guide](https://solar.se.com/us/wp-content/uploads/sites/7/2021/10/Conext-Battery-Monitor-Owners-Guide_975-0691-01-01_ENG.pdf)
- The Quick Start Guide diagram labels a SYNCHRONIZE control on the device. — [Quick Start 975-0690-01-01](https://solar.se.com/eu/wp-content/uploads/sites/4/2021/10/Conext-Battery-Monitor-Quick-Start-Guide_975-0690-01-01_ENG.pdf)
- Forum thread "Conext Battery Monitor - problems" exists (content not read). — [Solar-Electric forum](https://forum.solar-electric.com/discussion/comment/365201)

### Inferences
- General amp-hour-counting monitor behavior (from Victron docs, not Conext): wrong SOC commonly comes from wrong battery capacity, charged-voltage and tail-current settings, or wrong current sensing; fix by confirming settings, a full charge/sync, and zero-current calibration. Treat as analogy only. — [Victron BMV troubleshooting](https://www.victronenergy.com/media/pg/BMV-712_Smart/en/troubleshooting.html)

### Gaps
- Display screens, fault messages, shunt wiring and calibration steps for the Conext monitor: not found.

## Conext PDP (XW+ Power Distribution Panel)

### Takeaway
The PDP ships with a 250 A DC battery breaker; MPPT charge controllers need extra DC breakers in expansion positions. Breaker part ratings conflict between sources.

### Cited Findings
- PDP ships with one GJ 250 A 160 Vdc DC breaker installed (main battery breaker); extra DC breakers are required for MPPT 60 150 and MPPT 80 600, with two expansion positions (PV array or battery). — [XW PDP Installation Guide 975-0709-01-01](https://solar.se.com/eu/wp-content/uploads/sites/4/2021/10/XW-PDP-Installation-Guide_975-0709-01-01_ENG.pdf) (via search summary)
- Breaker kits sold separately: 3-phase kit with 3 x 3-pole 60 A 120/208 V Square D QOU360; 120/240 V kit with 3 x 2-pole 60 A QOU260; generator breakers not provided. — [XW PDP 3-Phase kit](https://solar.se.com/eu/wp-content/uploads/sites/4/2021/10/XW-PDP-3-Phase-Breaker-Kit_975-0703-01-01_ENG.pdf), [120/240 V 60 A kit](https://solar.se.com/us/wp-content/uploads/sites/7/2021/10/XW-PDP-120-240V-60A-Breaker-Kit_975-0702-01-01_ENG.pdf)
- Do not drill, cut or punch holes in the conduit box, chassis or PDP; use provided knockouts only. PDP availability and installation depend on local code. — [XW PDP guide](https://solar.se.com/eu/wp-content/uploads/sites/4/2021/10/XW-PDP-Installation-Guide_975-0709-01-01_ENG.pdf)
- Quick Fit guide marks PV disconnect and AC breaker locations as Lock Out & Tag Out points. — [Quick Fit XW H guide](https://solar.se.com/au/wp-content/uploads/sites/3/2021/11/ML20190308_Conext-Quick-Fit-XW-H-Quick-Start-Guide-975-0948-01-02.pdf)
- CONFLICT: MPPT 80 600 battery-side breaker is 100 A (865-1080) in the Mini PDP guide but listed as 80 A in the PDP datasheet; PV-side part 865-1075 is 60 A in one source and 250 A in the other. — [Mini PDP guide](https://solar.se.com/us/wp-content/uploads/sites/7/2021/10/XW-Mini-PDP-Installation-Guide_975-0735-01-01_ENG.pdf) vs [PDP datasheet](https://backwoodssolar.com/wp-content/uploads/2023/05/ds20171117_conext-xw-pdp-datasheet_2.pdf)

### Inferences
- A tripped/off MPPT PV or battery breaker in the PDP would produce zero production with no fault code at the controller (or the controller offline); check these first (inference).

### Gaps
- Exact label wording, shock/arc-flash warnings, and the PV system disconnect arrangement: not read. The meaning of a tripped item is not documented in what was found.

## Xanbus network

### Takeaway
Xanbus needs a terminator at each end of a daisy chain; devices ship with one terminator, so a second is often missing. Known-good Cat5e cabling is advised.

### Cited Findings
- Network must be terminated at each end; XW and other Xanbus devices ship with one male terminator installed; one terminator degrades signal quality. — [Xantrex XW manual (manualsonline)](https://auto.manualsonline.com/manuals/mfg/xantrex_technology/xw402412024060.html?p=70)
- Schneider FAQ: a Control Panel (SCP) that powers up but shows no devices points to Xanbus connection issues; use Xanbus ports throughout, a terminator at each end, known-good Cat5e cables. — [Schneider FAQ FA337931](https://www.se.com/ca/en/faqs/FA337931/)
- Combox is not damaged if not on Xanbus but needs external power since it normally powers from Xanbus. — [Schneider FAQ FA330877](https://www.se.com/us/en/faqs/FA330877)
- Forum: a missing device after termination fixes may need a full DC power-down, then re-powering XW and SCP with a short cable and terminators; one user suspected a battery-monitor short damaged Xanbus. — [Solar-Electric forum](https://forum.solar-electric.com/discussion/comment/395162)

### Inferences
- Device-missing or dropping symptoms point to termination, cable or a faulty device on the chain.

### Gaps
- Device-number/address conflict behavior and symptoms for Conext: no source found.

## Battery chemistries and charge-setting mismatches

### Takeaway
Little Conext-specific material was found.

### Cited Findings
- Conext Battery Monitor reportedly not compatible with Li-ion (see above). — [Owner's Guide](https://solar.se.com/us/wp-content/uploads/sites/7/2021/10/Conext-Battery-Monitor-Owners-Guide_975-0691-01-01_ENG.pdf)
- Forum thread on Conext XW+ and "exploding batteries" (content not read). — [Solar-Electric forum](https://forum.solar-electric.com/discussion/comment/382584)

### Gaps
- Charge profile settings per chemistry (flooded/AGM/lithium) for the XW+ and MPPT: not found; read the XW+ and MPPT owner's guides.
