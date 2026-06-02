// generate-proposal-insight.js
// Generates a customer-facing AI insight for inverter_swap proposals.
// System prompt is enriched with verified SDG&E rate research, NEM 1.0 mechanics,
// San Diego PVWatts data, and inverter degradation findings.
//
// POST body: {
//   notes, system_size, monthly_bill, nem_status, installer, issue,
//   inverter_output_pct,   // e.g. 25 (percent of rated capacity)
//   monthly_loss_est,      // $/month being lost due to degraded inverter
//   expected_bill_with_fix,// $/month after fix (typically ~$25 base services charge only)
//   new_system_size_kw,    // system_size + 4.2 kW (10 × 420W panels)
//   annual_kwh_with_bundle // new_system_size_kw × 1600
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
    notes, system_size, monthly_bill, nem_status, installer, issue,
    inverter_output_pct, monthly_loss_est, expected_bill_with_fix,
    new_system_size_kw, annual_kwh_with_bundle
  } = body;

  // Build a rich, specific user message from all available data
  const parts = [];
  if (installer)             parts.push(`Original installer: ${installer}`);
  if (system_size)           parts.push(`Current system size: ${system_size} kW DC`);
  if (nem_status)            parts.push(`NEM status: ${nem_status.toUpperCase()} — full retail rate credit preserved`);
  if (monthly_bill)          parts.push(`Current monthly SDG&E bill: $${monthly_bill} (with broken inverter)`);
  if (inverter_output_pct)   parts.push(`Inverter currently running at: ~${inverter_output_pct}% of rated capacity`);
  if (monthly_loss_est)      parts.push(`Estimated monthly generation loss: ~$${Math.round(monthly_loss_est)}/month paid to SDG&E that solar should cover`);
  if (expected_bill_with_fix)parts.push(`Expected monthly bill after fix: ~$${Math.round(expected_bill_with_fix)} (Base Services Charge only)`);
  if (new_system_size_kw)    parts.push(`New system size after adding 10 × 420W panels: ${new_system_size_kw} kW`);
  if (annual_kwh_with_bundle)parts.push(`Expected annual production with full bundle: ~${Math.round(annual_kwh_with_bundle).toLocaleString()} kWh/yr`);
  if (issue)                 parts.push(`Diagnostic finding: ${issue}`);
  if (notes)                 parts.push(`Tech notes: ${notes.slice(0, 600)}`);

  const userMessage = parts.length
    ? `Customer profile:\n${parts.join('\n')}\n\nWrite a 2–3 sentence customer-facing insight for their proposal now.`
    : 'Write a 2–3 sentence customer-facing insight for a San Diego homeowner with a failing solar inverter on SDG&E NEM 1.0.';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system: `You are a solar energy advisor writing a 2–3 sentence customer-facing insight for a proposal.
Use the verified research context below to make the insight specific and credible.
Reference actual numbers when available (system size, monthly loss, expected post-fix bill).
Explain clearly what the problem is costing them RIGHT NOW and what the full bundle will do.
Highlight NEM 1.0 status as a valuable preserved asset.
Plain English only. No jargon. Do NOT mention dollar amounts unless they are provided in the customer profile.
Do NOT start with "I". Output only the insight paragraph — no labels, no headers.

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
