# Schneider Conext XW+ (5548 NA / 6848 NA) on-site troubleshooting

Method note: solar.se.com, se.com and most manual-mirror hosts were not reachable by WebFetch from the research sandbox (DNS blocked). The one full document obtained was the Owner's Guide 975-0240-01-01 **Rev H** (Nov 2017, NA 120/240V, covers XW+ 5548 NA/6848 NA), downloaded from the EcoDirect S3 mirror and text-extracted locally. All code tables below are verbatim-derived from that PDF. Rev I (Aug 2019, solar.se.com) and the Service Guide 977-0017-01-01 Rev B were NOT read; values may differ slightly in newer revisions. Source for all "Owner's Guide" items: [Owner's Guide Rev H](https://s3.amazonaws.com/ecodirect_docs/SCHNEIDER/Conext-XW/Schneider-Electric-Conext-XW-NA-Owners-Guide-975-0240-01-01_Rev-H_ENG-ML201711.pdf) (OG-H). Newer revision: [Rev I](https://solar.se.com/us/wp-content/uploads/sites/7/2021/11/ML201908_Conext-XW-120V-Owners-Guide-975-0240-01-01_Rev-I-ENG.pdf).

## 1. Fault (F) and warning (W) codes: meaning and first checks

### Takeaway
The XW+ has automatic, manual, and "escalating automatic" faults. Most field calls map to: AC overload (F63-65), over-temperature (W/F57-58, 44-45, 68), DC under/over voltage (F47-49), grid anti-islanding (F23-40, not a unit defect), and welded relays (F17-22, service). Note the XW+ is a battery-based (off-grid/backup/grid-interactive) inverter, not a PV string inverter, so on a California residential job it appears in battery/backup or legacy off-grid systems.

### Cited Findings
**How faults/warnings behave**
- Record the code immediately plus conditions (loads, battery voltage/temp, recent events, odd AC input, ambient extremes); check the panel for a Fault code on the inverter info panel or SCP; then try the table fix; then call Customer Service with model/serial — OG-H "General Troubleshooting Guidelines" ([OG-H](https://s3.amazonaws.com/ecodirect_docs/SCHNEIDER/Conext-XW/Schneider-Electric-Conext-XW-NA-Owners-Guide-975-0240-01-01-Rev-H_ENG-ML201711.pdf))
- Pre-checks when no fault light: clean/dry/ventilated location; AC input breakers not tripped (passthrough overload); battery cables sized/short; battery good and DC connections tight; AC wiring good; config correct; display/comm cable connected; battery temp sensor (BTS) connected — OG-H ch.4
- Warning types: Automatic (clear on their own) and Manual (Yes/No prompts: Enter = yes, Exit = no). Last 20 warnings in SCP warning log (View Device Info); last 20 faults in Fault Log — OG-H ch.4
- Fault types: Automatic (clear when condition goes); Manual (clear via "Clear Faults" on the XW+ menu, or briefly pressing STARTUP/SHUTDOWN on the unit; reappears if condition persists); Escalating automatic (becomes manual if repeated, e.g. AC Overload 3 times in 5 minutes) — OG-H Table 4-4 and ch.2
- Acknowledging with Enter on the SCP does not clear the condition — OG-H

**Warnings (Table 4-3)**
| Code | Message | Type | Cause / first checks |
|---|---|---|---|
| W44 | Battery Over Temperature | Auto | Battery > 50 °C (122 °F). Check battery voltage/cables, stop charging, ambient and battery-room ventilation |
| W45 | Capacitor over temperature | Auto | DC bulk cap > 100 °C. Ventilation, reduce AC loads |
| W48 | DC Under Voltage | Auto | Battery < 47 V. Check DC at inverter terminals, external DC loads, battery condition/recharge, Low Batt Cut Out setting |
| W49 | DC Over Voltage | Auto | Battery within (High Batt Cut Out − 2 V). Check other charge sources, cables, regulate DC source or raise High Batt Cut Out |
| W57 | FET1 Over Temperature | Auto | Internal > 85 °C. High AC input while charging; too large a load inverting; high ambient; failed fan (hold paper to vents); blocked intake; Max Charge Rate too high |
| W58 | FET2 Over Temperature | Auto | See W57 |
| W63 / W64 | AC Overload | Auto | Excess AC load; turn off loads |
| W68 | Transformer Over Temperature | Auto | See W57 |
| W70 | Synchronization Warning (AC input phase not qualified) | Manual | 3-phase systems: lost/out-of-range phase, or phases not synchronized; check wiring phase sequence A/B/C |
| W94 | Remote Power Off | Auto | Remote Power Off switch active; unit stops in 5 s. No action needed |
| W95 | Equalize Abort | Manual | AC input interrupted during equalization; wait for grid to return in tolerance |
| W96 | Cannot Equalize | Manual | Gel/AGM must not be equalized; or AC not qualified/charge not enabled |
| W97 | Battery temperature sensor failure | Auto | BTS shorted; replace sensor |
| W500 | Lost network connection | Auto | Check network (Xanbus) cables |
| W501 | Inv/Chg is trying to fix a memory problem | Manual | Non-volatile memory warning; may go to fault. Power unit off then on |

**Faults (Table 4-6)**
| Code | Message / type | Cause and first action |
|---|---|---|
| F1 | AC Output Under Voltage (escalating; manual if 3x in 2 min) | AC output under 108 V shutdown. Clear and restart; call support if persists |
| F2 | AC Output Over Voltage (escalating; 3x in 30 s) | Shutdown at 135 V. Clear/restart; call support |
| F17-F20 | Relay(s) Welded (manual) | AC1 L1 / AC1 L2 / AC2 L1 / AC2 L2 transfer relay bad, OR an AC source wired directly to the AC output. Disconnect inverter output wiring; if persists, service |
| F21 / F22 | Relay(s) Welded (manual) | Unidentified transfer relay / unidentified L1 relay; same action |
| F23-F40 | Anti-islanding (AI) utility faults (automatic) | Over/under frequency and L1/L2/L1L2 voltage grid excursions (e.g. F27 135 V fast, F31 130 V slow, F34 108 V slow, F37 66 V fast). No action: unit stops selling, disconnects; 5-minute reconnect timer after grid returns to range. Info panel shows Fault light with no code on the 3-character display; SCP shows the message. Cannot be manually cleared |
| F41 / F42 | APS Under / Over Voltage (escalating; 3x in 30 s) | Auxiliary power supply shutdown. Clear/restart; call support |
| F44 | Battery Over Temperature (auto) | Shutdown at 60 °C; recovers at 50 °C. Check battery temp/ventilation |
| F45 | Capacitor Over Temperature (auto) | Shutdown at 105 °C. Ventilation, reduce loads |
| F46 | Controller fault (manual) | Service required |
| F47 | DC Under Voltage (auto) | DC < 32 V immediate shutdown; restarts at V+4 V. Check battery voltage at terminals, external DC load |
| F48 | DC Under Voltage (auto) | Below Low Batt Cut Out level; same as F47 |
| F49 | DC Over Voltage (escalating) | Over High Batt Cut Out; also occurs if batteries are disconnected at the DC breaker while unit operates. Battery < 58 VDC at terminals; check other charge sources |
| F52-F56 | EEPROM Error (manual) | Clear fault; if it persists, service |
| F57 / F58 | FET1 / FET2 Over Temperature Shutdown (auto) | Internal > 105 °C; clears at 75 °C. Same causes/checks as W57 (fan, intake, load, ambient, charge rate) |
| F59 | GOCFG process failed (manual) | Auto-configuration (Copy From) failed; retry or configure manually. (Differs in other product guides, e.g. XW Pro and older XW guides list different F59 meanings) |
| F63 / F64 / F65 | AC Overload / L1 / L2 (escalating; manual after 3 in 5 min) | Excess load on output. To clear: hold power button 5 s to turn off; disconnect XW+ from battery bank 20 s |
| F66 | System Configuration Fault (auto) | Multi-unit config: only one master, unique Device Numbers, one primary charger |
| F67 | Watchdog Error (manual) | Service required |
| F68 | Transformer Over Temperature (auto) | > 140 °C; clears at 125 °C. Ventilation, reduce loads |
| F69 | External Sync Failed (manual) | Check cable on AC sync port; in a single-inverter system nothing may be plugged into the AC sync port |
| F70 | Check Phase Configuration (auto) | 3-phase: one master per phase, unique device numbers, phase B/C reversal, verify wiring |
| F71 | Battery Discharge Over Current (manual) | Li-ion only; excessive load; adjust discharge current limit or reduce load |
| F72 | External AC Contactor Malfunction (manual) | Check AC contactor coil/fusing/wiring/power |
| F500 | Silicon Serial ID Failure (manual) | Service required |

- State after faults (Table 4-5): F1/F2 stop inverting until voltage nominal or manual clear; F17-22 while inverting stop and wait for user clear; F23-40 during grid support the unit goes to AC bypass and waits at least 5 min for nominal grid; F44/45 inverting unit shuts down, in AC-interactive states goes to AC bypass until temp normal; F47-49 inverting unit shuts down; F63-65 stops inverting, waits for manual clear — OG-H
- Fault codes F3-F16, F43, F50-51, F60-62 are not listed in this guide (reserved/not used in this table as published). Checked: not present in Rev H.

### Inferences
- F23-F40 are grid events, not unit failures: check utility/service-panel voltage and wire gauge before condemning the inverter (see section 3).
- Repeated F57/F58/F45/F68 with a working fan usually point to blocked airflow/filter, high ambient, or sustained overload.

### Gaps
- Rev I and Service Guide 977-0017-01-01 Rev B (repair detail, field-replaceable parts) not read; fetch blocked. A search summary says that Service Guide contains PCB replacement and AC EMI/Relay board troubleshooting ([Service Guide](https://solar.se.com/eu/wp-content/uploads/sites/4/2021/11/ml201908_conext-xw-maintenance-guide-977-0017-01-01_rev-b-1.pdf), snippet only).

## 2. Status LEDs and display

### Takeaway
Panel shows AC1 (Grid) and AC2 (Gen) LEDs, kW (inverting), A (charging), red Event LED, battery-level LEDs, a 3-character display, and STARTUP/SHUTDOWN and Equalize buttons.

### Cited Findings
- Grid (AC1) LED: on = AC present and qualified; flashing = present but being qualified; off = not present or outside qualifying range. Gen (AC2) LED: same semantics for AC2. If one is on and other flashing, both inputs present; only one source is qualified at a time per AC Priority setting — [OG-H](https://s3.amazonaws.com/ecodirect_docs/SCHNEIDER/Conext-XW/Schneider-Electric-Conext-XW-NA-Owners-Guide-975-0240-01-01_Rev-H_ENG-ML201711.pdf) ch.2
- kW LED: on = inverting and display shows output kW; flashing = Grid Support mode; off = not inverting — OG-H
- "A" LED: on = charging (display shows charge amps); flashing = AC coupled charging occurring (may flash in AC-coupled mode with reverse current > 3 A, or multiple units in parallel under no load); off = not in charge mode. Charge LED stays on 60 s after charge cycle ends — OG-H
- Red Event LED: solid = fault, stopped inverting/charging (also solid if both fault and warning); flashing = warning (may escalate to fault). Brief press of STARTUP/SHUTDOWN clears active events — OG-H
- Battery LEDs (5): based on battery voltage unless Conext Battery Monitor or MPPT reports; none lit = ~50% DoD or more; two = low; four = medium; five = full. Only a rough guide — OG-H
- 3-character display shows output kW, charge amps, Standby, Search, a shutdown indicator while the STARTUP/SHUTDOWN button is held 5 s, and a 5-minute countdown after a grid interruption during export. (The actual glyph strings were lost in text extraction; check the figure in the guide.) — OG-H
- Utility faults: Fault light on info panel, no code on the 3-character display, message on SCP — OG-H

### Gaps
- Exact 3-character display strings (e.g. Stb, Srh) not recovered.

## 3. Common real-world failures and typical fixes

### Takeaway
Owner's-guide problem tables give the official first checks; forum reports add hardware failure patterns. Forum info is anecdotal and sometimes on XW 4548/6048 or SW, not XW+.

### Cited Findings
- Will not power on, no LEDs: unit shut off via STARTUP/SHUTDOWN, or wrong DC at terminals; check battery voltage, fuses/breakers, cables; if DC correct, service — OG-H Table 4-1
- Starts then stops quickly: excess load; over-temperature (put in Standby, cool, improve ventilation, replace the foam air filter on the unit bottom); Remote Power Off active — OG-H
- No AC output: open output breakers/fuses/wiring, inverter disabled; compare SCP Meters voltage vs terminal block voltage to localize — OG-H
- Flashing INVERT LED with no output: load too small for Search mode; lower Search Watts or disable search — OG-H
- Disconnects from a stable grid: AC voltage/frequency outside AC acceptance window; widen AC1 settings (but Grid Support overrides with default anti-islanding limits) — OG-H
- Repeated anti-islanding faults at high sell current: high-impedance connection or undersized wiring between XW+ and meter; measure L1-N, L2-N, L1-L2, N-G at meter; wiring should be sized for 1 to 1.5% max voltage drop, or reduce Max Sell Amps — OG-H
- Charger not charging (AC1/AC2 LED on): charger disabled; Charger Block time window; load shaving above Load Shave Amps; 2-stage charge complete; battery < 40 V and AC not qualified; Gen support limit exceeded — OG-H
- AC LED flashing, will not charge (allow 40 s to synchronize): already synchronized to another source; AC out of acceptance range or unstable generator; verify L1-N/L2-N/L1-L2/N-G (about 120/120/240/0 V) stable for 60 s; split-phase unit connected to two legs of three-phase — OG-H
- Charge current tapers/low: AC frequency or voltage out of tolerance, wrong battery type, high ambient (thermal derating), bad cells/poor wiring, Li-ion BMS interruption; loose/corroded battery connections, undersized cables — OG-H
- Forum: F63 only when generator runs; check AC2 settings versus generator size and any load that switches on only then (forum user hypothesis) — [forum.solar-electric.com](https://forum.solar-electric.com/discussion/comment/381288)
- Forum (XW4548 thread): failing current sensor on logic board caused false F63; early units had transfer relays weld; power bridge PCB failure can be "end of road" without component-level repair — [forum](https://forum.solar-electric.com/discussion/comment/427947) and [forum](https://forum.solar-electric.com/discussion/comment/394161) (snippet-level; unverified)
- Forum: F57/F58 caused by bad thermistor or connection in one case; a failed fan in another — [forum](https://forum.solar-electric.com/discussion/comment/420948) (thread is for Conext SW, adjacent product)

### Inferences
- Xanbus issues surface as W500 (lost network connection): check Xanbus cables/terminators and that a STARTUP/SHUTDOWN shutdown on a single unit powers off Xanbus, which can take Conext SCP/AGS offline (OG-H ch.2).

### Gaps
- No Conext Combox/Insight failure-mode source found. Fan failure rates and typical part costs not found.

## 4. Recalls, service bulletins, firmware, discontinuation, warranty, support

### Takeaway
No XW+ recall was found. The XW+ line has been replaced by the XW Pro per Schneider. Firmware notes exist. Warranty length and support phone could not be verified.

### Cited Findings
- Schneider states its Solar business is replacing the XW+ line with the XW Pro (search summary of discontinuation notice; the PDF was not fetched; the notice shown was for the IEC XW8548) — [Discontinuation notice](https://solar.se.com/eu/wp-content/uploads/sites/4/2021/09/201216_XW8548_-Product-Discontinuation-Notice_IEC.pdf)
- General Conext XW Software Release Notes exist; they advise updating all units in a multi-unit system before operation — [release notes](https://solar.se.com/eu/wp-content/uploads/sites/4/2021/11/Conext-XW-Software-Release-Notes_Rev-A-2.pdf) (snippet-level)
- Schneider FAQ: configuration tool may reject firmware when converting XW+5548/XW6848 to single phase; rename file to the split-phase name — [FAQ FA305381](https://www.se.com/us/en/faqs/FA305381) (snippet-level)
- Contractual warranty documents exist (XW+ NA warranty PDF; a 2024 "10 Year Contractual Warranty" PDF is for other Schneider solar products, applicability to XW+ unverified): [XW+ NA Warranty](https://ressupply.com/documents/schneider_electric/Conext_XW+NA_Warranty.pdf), [10 yr doc](https://solar.se.com/us/wp-content/uploads/sites/7/2024/09/240601_10-Year_Contractual_Warranty-1.pdf)
- Guide tells the user to see the warranty for obtaining service and that dampness/corrosion is not covered; unit is indoor-only — OG-H safety section
- A one-off 2020 customer review claims the warranty department does not take incoming calls — [review](https://www.solarreviews.com/view-review/?reviewid=46810) (anecdotal)

### Gaps
- Warranty term (years) for XW+ NA: not verified (search summary only said a contractual warranty exists). Common installer lore is 5 years; unverified.
- Solar Technical Support phone number/portal: not retrieved (page contact line in the guide just points to the website). Check solar.se.com/us support page.
- No recalls or safety service bulletins found for XW+ in searches (absence not proof).
- Firmware version numbers and which release fixed what: not read.

## 5. Safe shutdown and restart per the manual

### Takeaway
Three levels exist: STARTUP/SHUTDOWN (full off), Standby (stops invert/charge, stays powered), and full de-energize (disconnect AC and DC). Standby does NOT make the unit safe to open.

### Cited Findings
- Safety: disconnect both AC and DC before maintenance; Standby does not reduce shock risk; internal capacitors stay charged after power is disconnected; no user-serviceable parts; use insulated tools; remove jewelry — OG-H safety section ([OG-H](https://s3.amazonaws.com/ecodirect_docs/SCHNEIDER/Conext-XW/Schneider-Electric-Conext-XW-NA-Owners-Guide-975-0240-01-01_Rev-H_ENG-ML201711.pdf))
- Shutdown: while operating, press and hold STARTUP/SHUTDOWN 5 s. Shutdown cannot be cancelled; restart only once the display is blank, then press STARTUP/SHUTDOWN again — OG-H ch.2
- With a Conext AGS installed, shutdown takes 120 s (so generator can cool down); all comms blocked in that time — OG-H
- Single unit: shutting down removes Xanbus network power; SCP and AGS may lose power; Combox won't log harvest data; MPPT continues to work — OG-H
- Standby: press and hold STARTUP/SHUTDOWN and Equalize together ~5 s; return with a momentary press of STARTUP/SHUTDOWN. In Standby the transfer switches open (no AC passthrough), unit stays on Xanbus, settings can be changed — OG-H
- Momentary press of STARTUP/SHUTDOWN while operating clears active faults/warnings — OG-H
- Hard reset for F63-65: hold power button 5 s, then disconnect XW+ from battery bank for 20 s — OG-H Table 4-6
- W501 memory warning: turn unit off and on — OG-H
- Multi-unit: pressing and holding the master's button with an AGS makes slaves issue F69 or F66 during the 120 s — OG-H

### Inferences
- A sensible field sequence consistent with the manual: capture fault codes/photos first; Standby or STARTUP/SHUTDOWN; open AC breakers and DC disconnect; lock out; wait for caps to discharge before any cover removal (the guide gives no specific minute count; a Schneider Quick Fit XW+ L guide reportedly says 10 minutes, a different product, unverified); restore DC, then AC, then press STARTUP/SHUTDOWN.

### Gaps
- Exact capacitor discharge wait time for XW+ not found in the text read. Rev I standby/shutdown text not compared.
