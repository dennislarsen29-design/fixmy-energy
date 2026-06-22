// generate-proposal-insight.js
// Generates a customer-facing AI insight for solar proposal options.
// Branches by service_type: inverter_swap | battery_retrofit | panel_add | new_solar
//
// POST body: {
//   service_type, notes, diagnostic_findings, first_name,
//   system_size, monthly_bill, nem_status, installer, issue,
//   inverter_output_pct, monthly_loss_est, expected_bill_with_fix,
//   new_system_size_kw, annual_kwh_with_bundle,
//   annual_kwh_solar_api,       // from Google Solar API for this specific address
//   calculated_monthly_savings, // production-based $/month
//   calculated_annual_savings,  // production-based $/year
//   savings_source,             // "Google Solar API" or "NREL NSRDB San Diego avg"
//   panel_kw_added,             // kW of new panels in this proposal
//   has_battery                 // bool
// }
// Returns: { insight: "..." }

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

// ── Verified research context embedded in system prompt ──────────────────────
// Sources: CPUC SB 695 reports, NREL PVWatts, BLS FRED, actual SDG&E bill analysis
const RESEARCH_CONTEXT = `
VERIFIED SDG&E RATE DATA (as of 2026):
- Effective blended residential rate: ~$0.45/kWh (confirmed from actual bill: $3,115 / 6,877 kWh)
- Tier 1 (0–130% baseline): 41¢/kWh | Tier 2 (131%+): 52¢/kWh
- On-peak (4–9 PM weekdays): $0.749/kWh
- Super off-peak (midnight–6 AM + 10 AM–2 PM weekdays since May 2026): $0.360/kWh
- Fixed Base Services Charge: ~$24/month — this charge cannot be offset by solar
- SDG&E rate increase history: 7%/yr official CPUC average 2016–2024; 13.4%/yr CAGR 2020–2024
- CPUC 2023 SB 695 projection: 10.4%/yr for 2023–2026

NEM 1.0 MECHANICS (SDG&E DR-SES / DR-Residential):
- NEM 1.0 = full retail rate credit for every kWh exported to grid (1:1 netting at TOU rates)
- Monthly credits roll forward and offset future charges
- Annual true-up: any net surplus paid at only ~$0.02–0.05/kWh (wholesale rate)
- NEM 1.0 is grandfathered for 20 years from original interconnection date
- A well-sized NEM 1.0 system in San Diego can reduce the annual bill to approximately
  $24/month (the non-nettable Base Services Charge) when generating more than consumed
- NEM 1.0 grandfathering is preserved when adding storage or panels (CPUC D.22-12-056)

SAN DIEGO SOLAR PRODUCTION (NREL NSRDB / PVWatts):
- Average specific yield: 1,600 kWh per kW of installed DC capacity per year
- Example: 7.83 kW system → ~12,528 kWh/yr; 12 kW system → ~19,200 kWh/yr
- Panel degradation: ~0.5%/year (NREL median, 11,000+ data points)
- Coastal San Diego slight marine layer effect; inland (Poway, Santee) near top of range

INVERTER DEGRADATION (NREL / PVEL research):
- String inverters typically carry a 10-year manufacturer warranty — at/past 10 years,
  failure rates increase significantly; 10 years is effectively end-of-life
- A system operating at 25% of rated inverter capacity loses 75% of its generation
- A 7.83 kW system at 25% output generates only ~3,132 kWh/yr instead of ~12,528 kWh/yr
  — that's ~9,396 kWh/yr in lost generation, worth ~$4,247/yr or ~$354/month at SDG&E rates
- Zero NEM credits on a bill (no "Applied Credits" in NEM Summary) = system is effectively
  generating no exportable surplus; the solar is not offsetting grid consumption meaningfully
- After inverter replacement: system recovers to 88–95% of nameplate (capped by panel age)
- New Tesla inverter (within Powerwall 3) adds 3–6% efficiency gain vs 10–15 yr old units

PROPOSAL BUNDLE DETAILS:
- 10 × Tesla 420W panels = 4.2 kW additional DC capacity
- Additional annual production: 4.2 × 1,600 = 6,720 kWh/yr
- Tesla Powerwall 3: 13.5 kWh usable, 11.5 kW continuous — stores midday solar,
  discharges during on-peak (4–9 PM) to avoid $0.749/kWh grid purchases
- Net Powerwall arbitrage (May 2026 super off-peak expansion): ~$0.31/kWh shifted
  (stores at $0.36 midday, discharges at $0.749 peak × 89% round-trip efficiency)
- Adding storage does NOT affect NEM 1.0 grandfathering (CPUC confirmed)
`;

// ── Per-service-type focus instructions ──────────────────────────────────────
const SERVICE_FOCUS = {
  inverter_swap: `Write 3–5 sentences that do ALL of the following:
1. Open with the customer's specific diagnosed problem and what it is costing them RIGHT NOW in real dollars per month — make it concrete and personal
2. Reference their NEM 1.0 status as a grandfathered asset worth serious money — losing production now costs them full retail-rate dollars
3. Describe exactly what the proposed fix restores and adds in concrete production and bill terms
4. Close with urgency — every month without the fix is another month of overpaying SDG&E`,

  battery_retrofit: `Write 3–5 sentences that do ALL of the following:
1. Open with the customer's current situation — their solar generates well during the day but they're still paying $0.749/kWh peak rates (4–9 PM) because there's no storage
2. Describe the Powerwall 3's TOU arbitrage value concretely using their numbers: stores midday solar at $0.36/kWh super off-peak rate, discharges at peak to avoid $0.749/kWh — that's a $0.31/kWh shift on every stored kWh
3. Reference that adding storage does NOT affect their NEM 1.0 grandfathered rate (CPUC D.22-12-056) — this is a no-downside upgrade
4. Close with urgency — SDG&E's on-peak window is 4–9 PM every weekday; every evening without storage is money going back to the utility`,

  panel_add: `Write 3–5 sentences that do ALL of the following:
1. Open with the concrete production gain from the additional panels — X kW at 1,600 kWh/kW/yr = Y kWh/yr of new generation credited at full NEM retail rate
2. Value that production at $0.453/kWh (SDG&E blended rate) under their NEM 1.0 credit, showing the annual dollar value
3. Reference the address-specific Solar API estimate if provided, or NREL San Diego average if not — make the source clear so the number feels real, not guessed
4. Close with the compounding value — each additional kWh avoids rates that are rising ~7%/yr per CPUC SB 695, so the value of this production grows every year`,

  new_solar: `Write 3–5 sentences that do ALL of the following:
1. Open with the customer's current monthly SDG&E bill and what that compounds to over time at 7%/yr rate escalation (CPUC SB 695 projection)
2. Describe the NEM lock-in opportunity — customers who install now lock in full retail-rate credits for 20 years; waiting means installing under less favorable future rate structures
3. Show the full offset potential: annual system production vs. their annual usage at $0.453/kWh, with the specific data source (Solar API or NREL estimate)
4. Close with urgency — every month on full utility power is another month of paying rates that compound upward with no cap`
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!ANTHROPIC_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    service_type,
    notes, diagnostic_findings, first_name,
    system_size, monthly_bill, nem_status, installer, issue,
    inverter_output_pct, monthly_loss_est, expected_bill_with_fix,
    new_system_size_kw, annual_kwh_with_bundle,
    annual_kwh_solar_api, calculated_monthly_savings, calculated_annual_savings,
    savings_source, panel_kw_added, has_battery
  } = body;

  const svcType = service_type || 'inverter_swap';
  const focusInstructions = SERVICE_FOCUS[svcType] || SERVICE_FOCUS.inverter_swap;

  // Build a rich, specific user message from all available data
  const parts = [];
  if (first_name)            parts.push(`Customer first name: ${first_name} (use once, naturally)`);
  if (installer)             parts.push(`Original installer: ${installer}`);
  if (system_size)           parts.push(`Current system size: ${system_size} kW DC`);
  if (nem_status)            parts.push(`NEM status: ${nem_status.toUpperCase()} — full retail rate credit grandfathered`);
  if (monthly_bill)          parts.push(`Current monthly SDG&E bill: $${monthly_bill} (while system is underperforming or without storage)`);
  if (inverter_output_pct)   parts.push(`Inverter currently running at: ~${inverter_output_pct}% of rated capacity`);
  if (monthly_loss_est)      parts.push(`Estimated monthly generation loss: ~$${Math.round(monthly_loss_est)}/month the customer is paying SDG&E that their solar should cover`);
  if (expected_bill_with_fix)parts.push(`Expected monthly bill after full fix: ~$${Math.round(expected_bill_with_fix)} (near the $24 base services charge minimum under NEM 1.0)`);
  if (new_system_size_kw)    parts.push(`New system size after adding panels: ${new_system_size_kw} kW`);
  if (annual_kwh_with_bundle)parts.push(`Expected annual production with full bundle: ~${Math.round(annual_kwh_with_bundle).toLocaleString()} kWh/yr`);
  if (panel_kw_added)        parts.push(`Additional panel capacity being added: ${panel_kw_added} kW DC`);
  if (has_battery)           parts.push(`Proposal includes Tesla Powerwall 3: 13.5 kWh usable, stores midday solar for evening peak discharge`);
  // Production-based calculated savings (derived from actual kWh × verified SDG&E rate)
  if (annual_kwh_solar_api)  parts.push(`Google Solar API production estimate for this specific roof: ${Math.round(annual_kwh_solar_api).toLocaleString()} kWh/yr (address-specific, not a generic estimate)`);
  if (calculated_monthly_savings) parts.push(`Production-based monthly savings calculation: ~$${calculated_monthly_savings}/month (kWh production × $0.453/kWh SDG&E rate)`);
  if (calculated_annual_savings)  parts.push(`Production-based annual savings calculation: ~$${calculated_annual_savings}/yr`);
  if (savings_source && !annual_kwh_solar_api) parts.push(`Production calculation source: ${savings_source}`);
  if (diagnostic_findings)   parts.push(`Tech's on-site diagnostic findings (reference these specifically — the customer saw this firsthand): ${diagnostic_findings.slice(0, 300)}`);
  else if (issue)            parts.push(`Diagnostic finding: ${issue}`);
  if (notes)                 parts.push(`Additional tech notes: ${notes.slice(0, 400)}`);

  const userMessage = parts.length
    ? `Customer profile:\n${parts.join('\n')}\n\nWrite the proposal insight paragraph now.`
    : 'Write a proposal insight paragraph for a San Diego homeowner with a solar upgrade on SDG&E NEM 1.0.';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: `You are a solar sales coach writing a customer-facing proposal insight paragraph.
${focusInstructions}

Rules:
- Use ONLY the data provided. Never invent numbers. If diagnostic findings are given, reference them directly and specifically — the tech saw this with their own eyes, making it credible and personal to this homeowner.
- If calculated_monthly_savings or calculated_annual_savings are provided, use those exact numbers — they were derived from actual kWh production × verified SDG&E rates, not guessed.
- If Google Solar API data is provided, reference it as an address-specific estimate for this roof.
- Write in plain conversational English. No jargon, no buzzwords.
- Do NOT start with "I" or "Your system". Do NOT use the word "journey".
- Output ONLY the insight paragraph — no labels, headers, quotes, or introductory phrases.

${RESEARCH_CONTEXT}`,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Claude API error ' + resp.status + ': ' + errText.slice(0, 200) }) };
    }

    const data = await resp.json();
    const insight = data.content?.[0]?.text?.trim() ?? null;
    if (!insight) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'No insight returned' }) };

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ insight }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
