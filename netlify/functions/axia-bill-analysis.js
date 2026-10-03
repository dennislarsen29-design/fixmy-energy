// Quoya Assist — utility bill reader for the Axia/QCells Site Evaluation (2026-09-24, per
// Dennis: "rework the Axia/QCells Site Evaluation... mimic the FixMy.energy Evaluation but
// specify the details only related to onboarding with Axia/QCells").
//
// Deliberately a SEPARATE function from eval-bill-analysis.js (FixMy's own bill reader),
// even though the two documents look similar — Axia's version has different requirements
// that don't belong on FixMy's already-shipped, already-documented pipeline: a month-by-
// month usage breakdown (bar chart / NEM summary table), the account-holder name (for a
// client-side title/lead cross-reference), and a strict Generation+Delivery-only rate
// figure instead of a blended-total rate. Same "deliberately a separate, focused call"
// pattern already used throughout this codebase (eval-bill-analysis.js itself vs. the full
// eval-analysis-background.js diagnosis) — one document, no web_search, forced tool_choice.
//
// The two derived numbers Dennis asked for by exact formula:
//   Average Rate ($/kWh)   = Electric Generation + Delivery charges for the billing period
//                             (excludes gas)  ÷  kWh consumed that same period
//   Average Monthly Bill   = (Average Rate × Annual kWh consumption) ÷ 12
// Both are computed HERE in code from Quoya's raw extracted figures — never trusted to the
// model's own arithmetic, same "never trust the model's division" rule this file follows
// everywhere else a derived dollar figure matters (_evUpgradeSizing, _propRecalcRedline,
// etc.). Quoya only ever reports what it can read directly off the document.
//
// POST { billUrl, lead: { address } }
// → { readable, account_holder_name, period_generation_delivery_charges, period_kwh,
//     annual_kwh, avg_rate_per_kwh, avg_monthly_bill, monthly_usage:[{month,kwh}],
//     care, fera, medical_baseline, source, confidence, notes }
//
// ENV vars required: ANTHROPIC_KEY.

const MODEL = 'claude-sonnet-5';
const MAX_FILE_BYTES = 15 * 1024 * 1024; // raw bytes fetched from Storage, before base64

const ALLOWED_ORIGIN_HOSTS = new Set(['fixmy.energy', 'www.fixmy.energy']);
function originAllowed(event) {
  const h = event.headers || {};
  const src = h.origin || h.Origin || h.referer || h.Referer || '';
  if (!src) return false;
  try {
    const host = new URL(src).hostname.toLowerCase();
    if (ALLOWED_ORIGIN_HOSTS.has(host)) return true;
    if (host.endsWith('.netlify.app')) return true; // deploy previews
    return false;
  } catch (e) { return false; }
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (status, body) => ({ statusCode: status, headers: cors, body: JSON.stringify(body) });

const TOOL = {
  name: 'report_axia_bill_analysis',
  description: 'Report what was found on the utility bill document, for Axia/QCells new-solar onboarding.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'False ONLY if the document could not be read at all — wrong file type, blank page, totally illegible. A bill that is readable but missing some figures is still readable=true; just leave those fields null.' },
      account_holder_name: { type: 'string', description: 'The customer/account-holder name exactly as printed on the bill (e.g. "John A Smith"). Empty string if no name is legible on the document.' },
      period_generation_delivery_charges: { type: 'number', description: 'The dollar total for ELECTRIC service charges on the most recent single billing period shown — Generation charges plus Delivery charges added together (some bills show them as one combined "Electric Charges" line, others break them out — sum whatever is broken out). Do NOT include gas charges. If the bill combines gas and electric on one statement, use ONLY the electric-service subtotal for this figure, never a total that mixes gas in.' },
      period_kwh: { type: 'number', description: 'Electricity consumption in kWh for that SAME billing period as period_generation_delivery_charges (not the annual total).' },
      annual_kwh: { type: 'number', description: 'Total annual electricity consumption in kWh. Prefer a True-Up/12-month usage total if present. If only a single monthly bill is shown, estimate the annual figure from that one month (accounting for typical seasonal swings if a usage history graph is visible) and say so in notes.' },
      monthly_usage: {
        type: 'array', description: 'Month-by-month kWh usage, read from a usage bar chart or a NEM (Net Energy Metering) summary table if either appears on the document — common on SDG&E/SCE bills and True-Up statements. List every month shown, in chronological order. A bar chart with labeled y-axis gridlines but no printed number on each bar is STILL READABLE — see the system prompt below for how. If NEITHER a chart nor a table is present anywhere on the document, return an empty array — do not invent monthly figures by dividing the annual total.',
        items: {
          type: 'object',
          properties: {
            month: { type: 'string', description: 'Short label exactly as shown, e.g. "Jan 2026" or "January".' },
            kwh: { type: 'number' },
            on_peak_kwh: { type: 'number', description: 'Null/omit if the chart has no On-Peak/Off-Peak/Super-Off-Peak color breakdown for this month.' },
            off_peak_kwh: { type: 'number' },
            super_off_peak_kwh: { type: 'number' },
            estimated: { type: 'boolean', description: 'True if this month came from visually reading a bar against chart gridlines (no exact printed number for that bar). False if an exact number was printed (e.g. in a usage table).' }
          },
          required: ['month', 'kwh']
        }
      },
      care: { type: 'boolean', description: 'True only if the bill explicitly shows CARE (California Alternate Rates for Energy) discount enrollment.' },
      fera: { type: 'boolean', description: 'True only if the bill explicitly shows FERA (Family Electric Rate Assistance) discount enrollment.' },
      medical_baseline: { type: 'boolean', description: 'True only if the bill explicitly shows a Medical Baseline allowance/adjustment.' },
      source: { type: 'string', enum: ['true_up', 'monthly_bill', 'unknown'], description: 'true_up = a 12-month True-Up/annual statement was read (most accurate annual figures). monthly_bill = only a single month\'s bill was available (annual figures are an estimate). unknown = could not tell.' },
      reading_method: { type: 'string', enum: ['table_exact', 'chart_estimated', 'single_month_only', 'none'], description: 'table_exact = an exact numeric usage table was printed and read directly. chart_estimated = monthly_usage was derived by visually reading a bar chart against its labeled axis gridlines — expected and normal, not a fallback. single_month_only = no history chart or table at all, just the current billing period. none = no usable monthly data found.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: { type: 'string', description: 'Anything the rep should know before trusting these numbers: illegible sections, which figures are estimated vs. actual, an unusual rate schedule, multiple accounts/meters on one bill, etc. Empty string if nothing to flag.' }
    },
    required: ['readable']
  }
};

const SYSTEM = `You are Quoya, reading a California residential utility bill (SDG&E, SCE, LADWP, or another CA utility) uploaded by a Solar Review sales rep onboarding a homeowner with Axia/QCells. Extract exactly what report_axia_bill_analysis asks for — nothing more. You do NOT compute any derived rate or average — the system does that math from your raw figures, so just report what is printed on the document.

What to look for:
- The account holder's name, printed on the bill (usually near the top, on the mailing address block or account-summary section).
- "Total kWh" / usage figures FOR THE CURRENT BILLING PERIOD, separate from any annual/True-Up total.
- The bill's ELECTRIC charges for that same period — Generation + Delivery combined. If the bill also carries gas service, gas has its OWN separate subtotal on most CA combined bills (SDG&E in particular) — do not include it.
- A usage HISTORY (a bar chart, or a NEM/Net Energy Metering summary table with one row per month) — most SDG&E/SCE bills carry an "Electric Usage History" chart even on a single monthly bill, not just True-Up statements. If you see one, transcribe every month's kWh.
- Discount program lines: "CARE", "California Alternate Rates for Energy", "FERA", "Family Electric Rate Assistance", or "Medical Baseline" — these are usually called out explicitly near the rate schedule or account summary, not something to infer.

Reading a monthly usage-history bar chart: many bills print a labeled y-axis (gridlines such as 0, 148, 296, 444, 592, 740 kWh) but do NOT print a number on each individual bar. This is still real, readable data — a bar whose top sits roughly a third of the way between the 444 and 592 gridlines is about 444 + (592-444)/3 ≈ 493 kWh. Read every visible bar this way, splitting it into On-Peak/Off-Peak/Super-Off-Peak by the color legend when the chart has one, and mark estimated:true. This is expected, ordinary work — the same thing a rep would do by eye standing at the customer's kitchen table — not a reason to leave monthly_usage empty. Only skip a specific month if its bar is genuinely too small or obscured to place against the gridlines; only return an empty array if no bars are visible at all. When an exact numeric usage table is ALSO printed, prefer its exact numbers over eyeballing the chart for those months and mark estimated:false.

Never guess a number that is not supported by the document. If a figure genuinely cannot be determined at all (not merely requiring a visual estimate against labeled gridlines, which you should do), leave it null (or the monthly_usage array empty) and say why in notes rather than inventing a plausible-looking value — a wrong number handed to a rep as fact is worse than a blank field.

Call report_axia_bill_analysis exactly once.`;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  if (!originAllowed(event)) return reply(403, { error: 'Forbidden' });

  const key = process.env.ANTHROPIC_KEY;
  if (!key) return reply(200, { readable: false, notes: 'Quoya is not configured on this environment.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }

  // Multi-page bills (2026-10-03): the rep uploads one photo per page, so accept up to 4 URLs and
  // send them all as pages of ONE bill. `billUrl` (single) is still accepted for older callers.
  const urls = (Array.isArray(payload.billUrls) ? payload.billUrls : [payload.billUrl])
    .map(function (u) { return String(u || ''); }).filter(Boolean).slice(0, 4);
  if (!urls.length) return reply(400, { error: 'billUrl required' });
  const address = String((payload.lead && payload.lead.address) || '').slice(0, 200);

  const blocks = [];
  let totalBytes = 0;
  try {
    for (const billUrl of urls) {
      const r = await fetch(billUrl, { signal: AbortSignal.timeout(9000) });
      if (!r.ok) return reply(200, { readable: false, notes: 'Could not fetch the uploaded bill (HTTP ' + r.status + ').' });
      const ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const buf = Buffer.from(await r.arrayBuffer());
      totalBytes += buf.length;
      if (buf.length > MAX_FILE_BYTES || totalBytes > MAX_FILE_BYTES * 2) {
        return reply(200, { readable: false, notes: 'The bill file(s) are too large to read (' + Math.round(totalBytes / 1024 / 1024) + 'MB).' });
      }
      const b64 = buf.toString('base64');
      if (ct === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
      } else if (/^image\/(jpeg|png|gif|webp)$/.test(ct)) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: ct, data: b64 } });
      } else {
        return reply(200, { readable: false, notes: 'Unsupported file type (' + (ct || 'unknown') + ') — re-upload as a PDF or a photo.' });
      }
    }
  } catch (e) {
    return reply(200, { readable: false, notes: 'Could not read the uploaded bill: ' + e.message });
  }

  const ctxLines = [];
  if (address) ctxLines.push('Property: ' + address);
  if (blocks.length > 1) ctxLines.push('These ' + blocks.length + ' files are PAGES of the SAME bill (one photo per page, in no guaranteed order). Combine them: a figure may be on any page.');
  ctxLines.push('Read this utility bill and call report_axia_bill_analysis.');

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1800,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'report_axia_bill_analysis' },
        messages: [{ role: 'user', content: blocks.concat([{ type: 'text', text: ctxLines.join('\n') }]) }]
      })
    });

    if (!resp.ok) {
      const raw = await resp.text();
      console.error('axia-bill-analysis upstream failed:', resp.status, raw.slice(0, 400));
      return reply(200, { readable: false, notes: 'Quoya could not analyze the bill right now — try again in a moment.' });
    }

    const data = await resp.json();
    const call = (data.content || []).find(function (b) { return b.type === 'tool_use' && b.name === 'report_axia_bill_analysis'; });
    if (!call) return reply(200, { readable: false, notes: 'Quoya did not return a readable result.' });

    const out = call.input || {};
    const periodCharges = typeof out.period_generation_delivery_charges === 'number' ? out.period_generation_delivery_charges : null;
    const periodKwh = typeof out.period_kwh === 'number' ? out.period_kwh : null;
    const annualKwh = typeof out.annual_kwh === 'number' ? out.annual_kwh : null;

    // The two formulas Dennis gave, computed here — never left to the model. Both are
    // null (never a divide-by-zero or a fabricated number) whenever their inputs aren't
    // both present and the divisor isn't zero.
    const avgRate = (periodCharges != null && periodKwh) ? Math.round((periodCharges / periodKwh) * 100000) / 100000 : null;
    const avgMonthlyBill = (avgRate != null && annualKwh != null) ? Math.round(((avgRate * annualKwh) / 12) * 100) / 100 : null;

    const monthlyUsage = Array.isArray(out.monthly_usage)
      ? out.monthly_usage
          .filter(function (m) { return m && typeof m.kwh === 'number' && m.month; })
          .slice(0, 24)
          .map(function (m) {
            return {
              month: String(m.month).slice(0, 20), kwh: m.kwh,
              on_peak_kwh: typeof m.on_peak_kwh === 'number' ? m.on_peak_kwh : null,
              off_peak_kwh: typeof m.off_peak_kwh === 'number' ? m.off_peak_kwh : null,
              super_off_peak_kwh: typeof m.super_off_peak_kwh === 'number' ? m.super_off_peak_kwh : null,
              estimated: m.estimated !== false
            };
          })
      : [];

    return reply(200, {
      readable: out.readable !== false,
      account_holder_name: typeof out.account_holder_name === 'string' ? out.account_holder_name.slice(0, 120) : '',
      period_generation_delivery_charges: periodCharges,
      period_kwh: periodKwh,
      annual_kwh: annualKwh,
      avg_rate_per_kwh: avgRate,
      avg_monthly_bill: avgMonthlyBill,
      monthly_usage: monthlyUsage,
      care: !!out.care,
      fera: !!out.fera,
      medical_baseline: !!out.medical_baseline,
      source: ['true_up', 'monthly_bill', 'unknown'].indexOf(out.source) >= 0 ? out.source : 'unknown',
      confidence: ['high', 'medium', 'low'].indexOf(out.confidence) >= 0 ? out.confidence : 'low',
      notes: typeof out.notes === 'string' ? out.notes.slice(0, 500) : '',
      reading_method: ['table_exact', 'chart_estimated', 'single_month_only', 'none'].indexOf(out.reading_method) >= 0 ? out.reading_method : (monthlyUsage.length ? 'chart_estimated' : 'none')
    });
  } catch (e) {
    console.error('axia-bill-analysis failed:', e.message);
    return reply(200, { readable: false, notes: 'Quoya could not analyze the bill right now — try again in a moment.' });
  }
};
