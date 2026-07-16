-- Erik Starkey — two-option proposal draft (Calavo Dr)
-- Run in Supabase SQL Editor or via MCP. Idempotent: re-running overwrites the
-- same draft proposal. Status is 'draft', so the customer magic-link portal shows
-- NOTHING until Dennis opens the Proposal builder, taps "Load Previous", sets
-- retail pricing (line items below are dealer cost + draft labor/reroof
-- estimates), and hits Send.
--
-- ── System analysis (2026-07-16) ────────────────────────────────────────────
-- 2013 array: 21 SunPower panels (~327 W ea ≈ 6.87 kW) on 3 strings into a
--   SunPower string inverter, west roof.
-- 2019 array: 7 panels on Enphase IQ7 micros (~315 W ea ≈ 2.20 kW) — healthy.
-- Total nameplate ≈ 9.07 kW → expected 9.07 × 1,600 = 14,512 kWh/yr
--   = 39.8 kWh/day, which matches Erik's reported "~40 kWh/day when new". ✓
-- Today: ~25 kWh/day = 9,125 kWh/yr → blended output 63% of nameplate.
--   The Enphase side still contributes ~9.6 kWh/day, so the string side is at
--   ~15.4 of its healthy 30.1 kWh/day = ~51% — a partial string-inverter
--   failure (1–2 strings/MPPT down), not a total loss.
-- Lost production: ~15 kWh/day = ~5,387 kWh/yr × $0.453 = ~$2,440/yr (~$203/mo).
-- Usage: SDG&E NEM summary shows ~9,110 kWh/yr NET grid draw. Total household
--   consumption ≈ 9,110 + 9,125 produced ≈ 18,235 kWh/yr (~50 kWh/day).
--   Estimated bill ≈ 9,110 × $0.453 / 12 ≈ $344/mo (verify with a real bill).
-- Key cost insight (applies to BOTH options): Powerwall 3 has a built-in
--   11.5 kW solar inverter with 6 MPPTs (20 kW DC input). Erik's 3 strings +
--   the 8 new panels (10.2 kW DC total) land directly on it — no standalone
--   Tesla inverter and no optimizers to buy. Per-MPPT tracking replaces the
--   legacy optimizer function.
-- Option 1 adds: 8 × Tesla 420W (3.36 kW → +5,376 kWh/yr), Expansion Pack
--   (27 kWh total storage), and west-section reroof at $850/square
--   (7 squares ESTIMATED — confirm measurement on site).
--   Production 19,888 kWh/yr ≈ 109% of usage → bill ≈ $24/mo floor.
--   Panels flagged non-export to protect NEM grandfathering (no true-up credit
--   assumed — surplus is EV/electrification headroom).
-- Option 2: PW3 only — restores full 14,512 kWh/yr (80% of usage) and shifts
--   the remaining ~3,723 kWh/yr of evening grid draw off the $0.749 peak.
--   Bill ≈ $344 → ~$83/mo.

alter table customers add column if not exists proposal jsonb;

do $$
declare
  v_findings text :=
    '2026-07-16 system analysis: 2013 array = 21 SunPower panels (~6.87 kW) on 3 strings into SunPower string inverter (west roof) — partial inverter failure, string side at ~51% of expected output. 2019 array = 7 panels on Enphase IQ7 micros (~2.2 kW) — producing normally. System total 25 kWh/day vs ~40 healthy (63% blended output); losing ~5,400 kWh/yr ≈ $2,440/yr at SDG&E rates. Fix: land all strings on Powerwall 3''s integrated 6-MPPT inverter (20 kW DC input) and decommission the SunPower unit — no standalone inverter or optimizers needed. Annual usage ~18,235 kWh (9,110 net grid + 9,125 produced).';
  v_proposal jsonb := $json$
  {
    "status": "draft",
    "created_at": "2026-07-16T00:00:00Z",
    "accepted_option": null,
    "financing": null,
    "loan_term": null,
    "approvalRequired": false,
    "draft_note": "DRAFT PRICING — line items are dealer cost + estimated labor/reroof. Load Previous in the builder, set retail System Price per option, confirm reroof squares and monthly bill, then Send.",
    "insight": "Erik, your production history tells a clear story: the 21-panel array from 2013 should still deliver about 30 kWh a day, but since the SunPower inverter started failing the whole system has dropped from ~40 kWh to ~25 kWh a day — roughly 5,400 kWh a year you now buy back from SDG&E at full retail, about $200 every month, while your 7 newer Enphase panels keep working fine. Because your NEM status is grandfathered, every kWh we restore is credited at the full retail rate, and there is a real cost saving built into both options: the Powerwall 3 includes its own 11.5 kW solar inverter with 6 independent MPPT inputs, so your 3 strings land directly on it — no separate replacement inverter and no optimizers to buy. Option 2 restores your full ~14,500 kWh/yr production and adds 13.5 kWh of storage to shift your remaining evening usage off the $0.749/kWh peak rate, taking an estimated $344/mo bill to roughly $83. Option 1 goes further: 8 more 420W panels (+5,376 kWh/yr), 27 kWh of total storage for whole-home backup, and a fresh west-section roof before the equipment goes on — pushing production to ~109% of your 18,000+ kWh annual usage and your bill to about the $24 minimum. Every month the failed inverter stays in place is another ~$200 handed back to SDG&E.",
    "options": [
      {
        "id": "erik_opt1_full",
        "title": "Powerwall 3 + Expansion + 8 New Panels + West Reroof",
        "subtitle": "Full offset, whole-home backup, new roof under the array",
        "description": "Tesla Powerwall 3 (integrated 6-MPPT inverter absorbs all 3 existing strings) · Powerwall Expansion Pack (27 kWh total) · 8 × Tesla 420W panels (3.36 kW, non-export/NEM-protected) · SunPower inverter decommission + string re-termination · West roof section reroof @ $850/square",
        "price": 34008,
        "participate": false,
        "participate_price": null,
        "non_export": true,
        "restore_array": true,
        "array_output_pct": 63,
        "milestones": { "deposit": 1000, "remaining": 33008 },
        "line_items": [
          { "name": "Tesla Powerwall 3 ×1 (integrated 11.5 kW / 6-MPPT solar inverter)", "price": 12500, "isCustom": false },
          { "name": "Tesla Powerwall Expansion Pack ×1 (+13.5 kWh → 27 kWh total)", "price": 7000, "isCustom": false },
          { "name": "Tesla 420W Panel ×8 (3.36 kW)", "price": 7358, "isCustom": false },
          { "name": "String re-termination (3 strings → PW3 MPPTs) + SunPower inverter decommission — DRAFT labor est.", "price": 1200, "isCustom": true },
          { "name": "West roof section reroof — $850/square × 7 squares (ESTIMATE — confirm measurement)", "price": 5950, "isCustom": true }
        ],
        "savings": {
          "conservative": { "monthly": 272, "annual": 3264, "total20yr": 107927, "afterBill": 72 },
          "moderate":     { "monthly": 320, "annual": 3840, "total20yr": 157421, "afterBill": 24 },
          "significant":  { "monthly": 368, "annual": 4416, "total20yr": 252926, "afterBill": 24 }
        },
        "prod_data": {
          "panelKwh": 5376, "panelKw": 3.36, "panelCount": 8,
          "panelSource": "NREL NSRDB San Diego avg (1,600 kWh/kW/yr)",
          "inverterKwh": 5387, "hasInverter": true, "sysKw": 9.1, "outputPct": 63,
          "batteryArbitrageKwh": 2234, "hasBattery": true,
          "storageKwh": 27, "batteryUnits": 2, "batteryCycledDaily": 6.1,
          "surplusKwh": 0, "annualUsageKwh": 18235, "billBaseline": 344
        }
      },
      {
        "id": "erik_opt2_restore",
        "title": "System Restore + Powerwall 3",
        "subtitle": "Replace the failed SunPower inverter with the PW3's built-in inverter + add storage",
        "description": "Tesla Powerwall 3 (integrated 6-MPPT inverter absorbs all 3 existing strings — no standalone inverter or optimizers needed) · SunPower inverter decommission + string re-termination",
        "price": 13700,
        "participate": false,
        "participate_price": null,
        "restore_array": true,
        "array_output_pct": 63,
        "milestones": { "deposit": 1000, "remaining": 12700 },
        "line_items": [
          { "name": "Tesla Powerwall 3 ×1 (integrated 11.5 kW / 6-MPPT solar inverter)", "price": 12500, "isCustom": false },
          { "name": "String re-termination (3 strings → PW3 MPPTs) + SunPower inverter decommission — DRAFT labor est.", "price": 1200, "isCustom": true }
        ],
        "savings": {
          "conservative": { "monthly": 231, "annual": 2767, "total20yr": 91494,  "afterBill": 113 },
          "moderate":     { "monthly": 261, "annual": 3133, "total20yr": 128437, "afterBill": 83 },
          "significant":  { "monthly": 292, "annual": 3499, "total20yr": 200405, "afterBill": 52 }
        },
        "prod_data": {
          "panelKwh": 0, "panelKw": 0, "panelCount": 0, "panelSource": null,
          "inverterKwh": 5387, "hasInverter": true, "sysKw": 9.1, "outputPct": 63,
          "batteryArbitrageKwh": 2234, "hasBattery": true,
          "storageKwh": 13.5, "batteryUnits": 1, "batteryCycledDaily": 6.1,
          "surplusKwh": 0, "annualUsageKwh": 18235, "billBaseline": 344
        }
      }
    ]
  }
  $json$::jsonb;
  n int;
begin
  update customers set
    proposal = v_proposal,
    system_size  = coalesce(system_size, 9.1),
    monthly_bill = coalesce(monthly_bill, 344),
    nem_status   = coalesce(nem_status, 'nem1'),
    utility      = coalesce(utility, 'SDG&E'),
    diagnostic_findings = case
      when coalesce(diagnostic_findings, '') = '' then v_findings
      else diagnostic_findings || E'\n\n' || v_findings
    end
  where (lower(coalesce(first_name,'')) like 'erik%' and lower(coalesce(last_name,'')) like 'starkey%')
     or address ilike '%calavo%';
  get diagnostics n = row_count;

  if n = 0 then
    insert into customers
      (first_name, last_name, address, lead_category, step, rep_id,
       system_size, monthly_bill, nem_status, utility, diagnostic_findings, proposal)
    values
      ('Erik', 'Starkey', 'Calavo Dr (confirm full address)', 'fixmy', 4, 'tech4',
       9.1, 344, 'nem1', 'SDG&E', v_findings, v_proposal);
  end if;
end $$;
