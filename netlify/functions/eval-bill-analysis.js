// Quoya Assist — utility bill reader for the Guided Solar Evaluation (2026-08-27, per Dennis).
//
// Fires automatically the moment a rep uploads the Utility Bill in the Eval Wizard's
// Consumption step. Reads that one document (photo or PDF) and extracts the numbers a
// rep needs for the pitch without having to do bill math by hand: total annual kWh
// consumption, the blended average rate per kWh, whether the account carries a CARE,
// FERA, or Medical Baseline discount, and the monthly + annualized dollar amount paid.
//
// Deliberately a separate, focused call from eval-analysis-background.js's full
// hardware/production diagnosis — this is one document, no web_search, and needs to
// come back fast enough to fill in a form while the rep is still standing there, not
// wait behind a multi-minute vision+search pass. Forced tool_choice (same pattern as
// finance-extract.js) so the reply is always machine-readable — no "no tool call" retry
// path needed for a single well-scoped extraction like this.
//
// This function has always properly sent a PDF bill as a `document` content block —
// the wizard tells reps "PDF is best" for the bill upload, so this path has to handle
// PDF correctly or it would silently fail on the exact format reps are steered toward.
// ⚠️ eval-analysis-core.js's toImageBlock had the matching gap (silently dropped any
// non-image content-type, PDF included, despite a comment claiming otherwise) — left
// unfixed here for a while as a separate pipeline, until reported live 2026-09-21
// ("Quoya couldn't read the file... it's a real pdf"). Fixed there using this exact
// content-type branch as the template, so both Quoya paths now handle PDF the same way.
//
// POST { billUrl, utility, lead: { address } }
// → { readable, utility_detected, annual_kwh, avg_rate_per_kwh, monthly_amount_paid,
//     annual_amount_paid, care, fera, medical_baseline, source, confidence, notes,
//     monthly_breakdown, reading_method }
// utility_detected (2026-09-28, per Dennis — "the select Utility feature is not
// necessary, if Quoya can pull the data from the bill they should read the name and
// select the correct utility") lets the Eval Wizard auto-fill which utility this is,
// read straight off the bill's own header, instead of requiring the rep to pick one
// manually before uploading.
//
// monthly_breakdown + reading_method (2026-09-30, per Dennis — "I don't know how it's
// coming up with annual consumption so showing each month is helpful... want Quoya to
// do reps job and then show the math to build credibility in the tool"). Real bill
// example that surfaced this: Jacob Stein's SDG&E bill has a genuinely readable
// "Electric Usage History" stacked bar chart — labeled y-axis gridlines at
// 0/148/296/444/592/740 kWh, On-Peak/Off-Peak/Super-Off-Peak color legend, 8 real
// monthly bars — but the model returned annual_kwh as a single-month extrapolation and
// explicitly said in notes it "could not transcribe reliable per-month figures" because
// individual bars carry no printed number. That's the wrong call: a labeled-gridline bar
// chart IS readable, the same way a rep standing at the kitchen table would read it — by
// eye, against the gridlines. The SYSTEM prompt below now instructs exactly that instead
// of permitting the punt, and monthly_breakdown is what makes the reasoning visible to a
// rep afterward (rendered as a table in the Eval Wizard) rather than a black-box annual
// number nobody can check. reading_method tells the UI (and the rep) how each figure was
// sourced — an exact printed table beats an eyeballed chart beats a single-month-only
// bill, and the UI shows that distinction rather than presenting all three the same way.
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
  name: 'report_bill_analysis',
  description: 'Report what was found on the utility bill document.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'False ONLY if the document could not be read at all — wrong file type, blank page, totally illegible. A bill that is readable but missing some figures is still readable=true; just leave those fields null.' },
      utility_detected: { type: 'string', enum: ['sdge', 'sce', 'ladwp', 'other', 'unknown'], description: 'Which utility issued this bill, read from the logo/header/company name printed on the document itself (e.g. "San Diego Gas & Electric" / "SDG&E" -> sdge, "Southern California Edison" -> sce, "Los Angeles Department of Water and Power" / "LADWP" -> ladwp). "other" if it is clearly a different CA utility (PG&E, SMUD, etc.) by name. "unknown" ONLY if the issuing utility genuinely cannot be identified from the document — never guess from a hint the rep may have typed elsewhere.' },
      annual_kwh: { type: 'number', description: 'Total annual electricity consumption in kWh. If monthly_breakdown covers 12 real months, this should be their sum. If monthly_breakdown covers fewer months (e.g. the homeowner recently moved in and only 6-8 months of real usage exist), still produce a best-effort full-year estimate by extrapolating the available months\' seasonal pattern, and say in notes that it is extrapolated from partial-year data. If no usage-history chart or table exists at all, estimate from the single month shown and say so in notes.' },
      avg_rate_per_kwh: { type: 'number', description: 'Blended average price paid per kWh in dollars for the billing period shown (total electric charges divided by total kWh), e.g. 0.42. Not the highest tier rate — the effective blended average.' },
      monthly_amount_paid: { type: 'number', description: 'The dollar amount owed/charged on the most recent single billing period shown (before any true-up credit is applied).' },
      annual_amount_paid: { type: 'number', description: 'Total dollars paid/owed over the trailing 12 months. Prefer the True-Up statement\'s annual total if shown; otherwise estimate as monthly_amount_paid x 12 (adjust for known seasonal swings if visible) and say so in notes.' },
      care: { type: 'boolean', description: 'True only if the bill explicitly shows CARE (California Alternate Rates for Energy) discount enrollment.' },
      fera: { type: 'boolean', description: 'True only if the bill explicitly shows FERA (Family Electric Rate Assistance) discount enrollment.' },
      medical_baseline: { type: 'boolean', description: 'True only if the bill explicitly shows a Medical Baseline allowance/adjustment.' },
      source: { type: 'string', enum: ['true_up', 'monthly_bill', 'unknown'], description: 'true_up = a 12-month True-Up/annual statement was read (most accurate annual figures). monthly_bill = only a single month\'s bill was available (annual figures are an estimate). unknown = could not tell.' },
      generation_provider: { type: 'string', enum: ['sdcp', 'cea', 'utility', 'other_cca', 'unknown'], description: 'Who supplies the ELECTRICITY (generation), read from the bill text. sdcp = the bill says energy is provided by San Diego Community Power. cea = Clean Energy Alliance. utility = the utility itself (e.g. SDG&E bundled service, no community choice provider). other_cca = another community choice aggregator. unknown = not stated. Only report sdcp when SDCP is actually printed on the bill.' },
      statement_period_end: { type: 'string', description: 'The END date of the billing period (or the statement/True-Up date) printed on THIS document, as YYYY-MM-DD. Used to tell which of several uploaded bills is the most recent. Null/omit only if no date is printed anywhere.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: { type: 'string', description: 'Anything the rep should know before trusting these numbers: illegible sections, which figures are estimated vs. actual, an unusual rate schedule, multiple accounts/meters on one bill, etc. Empty string if nothing to flag.' },
      reading_method: { type: 'string', enum: ['table_exact', 'chart_estimated', 'single_month_only', 'none'], description: 'table_exact = an exact numeric usage table (e.g. a NEM True-Up summary table) was printed and read directly, no eyeballing needed. chart_estimated = monthly_breakdown was derived by visually reading a bar chart against its labeled axis gridlines — this is expected and normal, not a fallback to apologize for. single_month_only = this bill shows only the current billing period, no history chart or table at all. none = no usable monthly usage data found anywhere on the document.' },
      monthly_breakdown: {
        type: 'array',
        description: 'One entry per real month visible in a usage-history chart (e.g. "Electric Usage History") or table on this bill. A stacked bar chart with labeled y-axis gridlines (e.g. 0/148/296/444/592/740) but no printed number on each individual bar is STILL READABLE — estimate each bar\'s total height, and each color segment\'s share of it, by eye against the nearest gridlines, exactly the way a rep standing at the customer\'s kitchen table would read the printed chart. Do this for every month with a visible bar. Only omit a month if its bar is genuinely too small or obscured to place against the gridlines at all — do not fabricate a month with no bar. Leave this array empty only when reading_method is single_month_only or none.',
        items: {
          type: 'object',
          properties: {
            month: { type: 'string', description: 'e.g. "Jan 2026" — read from the chart\'s x-axis label or the table\'s row label.' },
            total_kwh: { type: 'number' },
            on_peak_kwh: { type: 'number', description: 'Null/omit if the chart has no On-Peak/Off-Peak/Super-Off-Peak color breakdown for this month.' },
            off_peak_kwh: { type: 'number' },
            super_off_peak_kwh: { type: 'number' },
            estimated: { type: 'boolean', description: 'True if this month\'s figure was visually read against chart gridlines (no exact printed number for that specific bar). False only if an exact number was printed for this month (e.g. in a usage table).' }
          },
          required: ['month', 'total_kwh', 'estimated']
        }
      }
    },
    required: ['readable']
  }
};

const SYSTEM = `You are Quoya, reading a California residential utility bill (SDG&E, SCE, LADWP, or another CA utility) uploaded by a Solar Review sales rep during a field evaluation. Extract exactly what report_bill_analysis asks for — nothing more.

What to look for:
- Which utility issued the bill — the company name/logo printed in the header. Read it off the document; do not assume it matches whatever utility hint (if any) is passed in context, since that hint may be wrong or unset.
- "Total kWh" / usage figures, and a monthly usage-history graph or table if present — most SDG&E/SCE bills (not just True-Up statements) carry an "Electric Usage History" bar chart even on a single monthly bill.
- The bill's total dollar amount for the period, and any annual True-Up total if this is a NEM/true-up statement.
- Discount program lines: "CARE", "California Alternate Rates for Energy", "FERA", "Family Electric Rate Assistance", or "Medical Baseline" — these are usually called out explicitly near the rate schedule or account summary, not something to infer.
- Tiered rate schedules (Tier 1/2/3, Baseline/Non-Baseline, Peak/Off-Peak on a TOU plan) — compute the BLENDED average ($/kWh), not any single tier's rate.

SOURCE PRIORITY for kWh (2026-10-02, per Dennis — Mohan Krishnan): ALWAYS use printed numbers before eyeballing any chart.
1. The exact "kWh used" figure printed beside the Electric Usage History chart on page 1 (with "Days in billing cycle" and daily avg) is the exact usage for THAT bill's month — record it with estimated:false.
2. Any Net Energy Metering Summary table (usually page ~7 of 8): its Bill Date rows give exact On-Pk / Off-Pk / Super-Off-Pk / Total kWh for each billing period, and "YTD Totals" gives the running total for the true-up year. These are exact too (estimated:false). Also read System Size (kW), Start Date / True-Up Date and Version (NEM 1.0/2.0/3.0) from this table when present.
3. The "Summary of Current Charges" line (e.g. "Electric … 288 kWh") is also exact.
4. ONLY months with no printed number anywhere get eyeballed from the bar chart (estimated:true). Never overwrite an exact printed figure with a chart estimate, and anchor chart estimates to the exact months you do have (the chart's printed-month bar must match its printed number — use that to calibrate the rest).
NEM CAUTION: for solar/NEM customers these printed kWh are NET (usage minus solar export) and can be negative (e.g. -197 kWh in a month = net exporter). Report them exactly as printed, but a net figure is NOT gross household consumption — say so in notes, do not present a sum of net months as annual consumption, and never let a net/negative total silently become annual_kwh. Dollar amounts: use the printed "Total Charges this Month" / current charges for monthly_amount_paid, not the credit balance or total account balance.

Reading a monthly usage-history bar chart: many bills print a labeled y-axis (gridlines such as 0, 148, 296, 444, 592, 740 kWh) but do NOT print a number on each individual bar. This is still real, readable data — a bar whose top sits roughly a third of the way between the 444 and 592 gridlines is about 444 + (592-444)/3 ≈ 493 kWh. Read every visible bar this way, splitting it into On-Peak/Off-Peak/Super-Off-Peak by the color legend when the chart has one. This is expected, ordinary work — the same thing a rep would do by eye standing at the customer's kitchen table — not a reason to skip the chart or leave monthly_breakdown empty. Only skip a specific month if its bar is genuinely too small or obscured to place against the gridlines; only skip the whole chart if no bars are visible at all. When an exact numeric usage table is ALSO printed (common on True-Up statements), prefer its exact numbers over eyeballing the chart for those months.

If the bill covers a homeowner who recently moved in (the chart shows real bars for only some months, with earlier months blank or absent), report only the real months in monthly_breakdown, say so plainly in notes, and still produce a reasonable full-year annual_kwh estimate by extrapolating the visible months' seasonal pattern — never silently pass off a partial year as a confident full year without saying so.

Never guess a number that is not supported by the document. If a figure genuinely cannot be determined at all (not merely requiring a visual estimate against labeled gridlines, which you should do), leave it null and say why in notes rather than inventing a plausible-looking value — a wrong number handed to a rep as fact is worse than a blank field.

Call report_bill_analysis exactly once.`;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  if (!originAllowed(event)) return reply(403, { error: 'Forbidden' });

  const key = process.env.ANTHROPIC_KEY;
  if (!key) return reply(200, { readable: false, notes: 'Quoya is not configured on this environment.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }

  const billUrl = String(payload.billUrl || '');
  if (!billUrl) return reply(400, { error: 'billUrl required' });
  const utility = String(payload.utility || '').slice(0, 60);
  const address = String((payload.lead && payload.lead.address) || '').slice(0, 200);

  let block;
  try {
    const r = await fetch(billUrl, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return reply(200, { readable: false, notes: 'Could not fetch the uploaded bill (HTTP ' + r.status + ').' });
    const ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) {
      return reply(200, { readable: false, notes: 'The bill file is too large to read (' + Math.round(buf.length / 1024 / 1024) + 'MB).' });
    }
    const b64 = buf.toString('base64');
    if (ct === 'application/pdf') {
      block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
    } else if (/^image\/(jpeg|png|gif|webp)$/.test(ct)) {
      block = { type: 'image', source: { type: 'base64', media_type: ct, data: b64 } };
    } else {
      return reply(200, { readable: false, notes: 'Unsupported file type (' + (ct || 'unknown') + ') — re-upload as a PDF or a photo.' });
    }
  } catch (e) {
    return reply(200, { readable: false, notes: 'Could not read the uploaded bill: ' + e.message });
  }

  const ctxLines = [];
  if (utility) ctxLines.push('Utility: ' + utility);
  if (address) ctxLines.push('Property: ' + address);
  ctxLines.push('Read this utility bill and call report_bill_analysis.');

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
        max_tokens: 1200,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'report_bill_analysis' },
        messages: [{ role: 'user', content: [block, { type: 'text', text: ctxLines.join('\n') }] }]
      })
    });

    if (!resp.ok) {
      const raw = await resp.text();
      console.error('eval-bill-analysis upstream failed:', resp.status, raw.slice(0, 400));
      return reply(200, { readable: false, notes: 'Quoya could not analyze the bill right now — try again in a moment.' });
    }

    const data = await resp.json();
    const call = (data.content || []).find(function (b) { return b.type === 'tool_use' && b.name === 'report_bill_analysis'; });
    if (!call) return reply(200, { readable: false, notes: 'Quoya did not return a readable result.' });

    const out = call.input || {};
    // Sanitize monthly_breakdown defensively — this renders directly as a table in the
    // Eval Wizard, so a malformed entry from the model must never reach the UI raw.
    const monthlyBreakdown = Array.isArray(out.monthly_breakdown)
      ? out.monthly_breakdown.slice(0, 24).map(function (m) {
          m = m || {};
          return {
            month: typeof m.month === 'string' ? m.month.slice(0, 20) : '',
            total_kwh: typeof m.total_kwh === 'number' ? m.total_kwh : null,
            on_peak_kwh: typeof m.on_peak_kwh === 'number' ? m.on_peak_kwh : null,
            off_peak_kwh: typeof m.off_peak_kwh === 'number' ? m.off_peak_kwh : null,
            super_off_peak_kwh: typeof m.super_off_peak_kwh === 'number' ? m.super_off_peak_kwh : null,
            estimated: m.estimated !== false
          };
        }).filter(function (m) { return m.month && typeof m.total_kwh === 'number'; })
      : [];
    return reply(200, {
      readable: out.readable !== false,
      utility_detected: ['sdge', 'sce', 'ladwp', 'other', 'unknown'].indexOf(out.utility_detected) >= 0 ? out.utility_detected : 'unknown',
      annual_kwh: typeof out.annual_kwh === 'number' ? out.annual_kwh : null,
      avg_rate_per_kwh: typeof out.avg_rate_per_kwh === 'number' ? out.avg_rate_per_kwh : null,
      monthly_amount_paid: typeof out.monthly_amount_paid === 'number' ? out.monthly_amount_paid : null,
      annual_amount_paid: typeof out.annual_amount_paid === 'number' ? out.annual_amount_paid : null,
      care: !!out.care,
      fera: !!out.fera,
      medical_baseline: !!out.medical_baseline,
      source: ['true_up', 'monthly_bill', 'unknown'].indexOf(out.source) >= 0 ? out.source : 'unknown',
      generation_provider: ['sdcp', 'cea', 'utility', 'other_cca', 'unknown'].indexOf(out.generation_provider) >= 0 ? out.generation_provider : 'unknown',
      statement_period_end: (typeof out.statement_period_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(out.statement_period_end)) ? out.statement_period_end : null,
      confidence: ['high', 'medium', 'low'].indexOf(out.confidence) >= 0 ? out.confidence : 'low',
      notes: typeof out.notes === 'string' ? out.notes.slice(0, 500) : '',
      reading_method: ['table_exact', 'chart_estimated', 'single_month_only', 'none'].indexOf(out.reading_method) >= 0 ? out.reading_method : (monthlyBreakdown.length ? 'chart_estimated' : 'none'),
      monthly_breakdown: monthlyBreakdown
    });
  } catch (e) {
    console.error('eval-bill-analysis failed:', e.message);
    return reply(200, { readable: false, notes: 'Quoya could not analyze the bill right now — try again in a moment.' });
  }
};
