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
// ⚠️ Unlike eval-analysis-core.js's toImageBlock (which silently DROPS any non-image
// content-type, including PDF, despite a comment claiming otherwise — a real gap in
// that pipeline, flagged in CLAUDE.md, not fixed here since it's a separate shipped
// pipeline), THIS function properly sends a PDF bill as a `document` content block.
// The wizard tells reps "PDF is best" for the bill upload, so this path has to handle
// PDF correctly or it would silently fail on the exact format reps are steered toward.
//
// POST { billUrl, utility, lead: { address } }
// → { readable, annual_kwh, avg_rate_per_kwh, monthly_amount_paid, annual_amount_paid,
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
  name: 'report_bill_analysis',
  description: 'Report what was found on the utility bill document.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'False ONLY if the document could not be read at all — wrong file type, blank page, totally illegible. A bill that is readable but missing some figures is still readable=true; just leave those fields null.' },
      annual_kwh: { type: 'number', description: 'Total annual electricity consumption in kWh. Prefer a True-Up/12-month usage total if present. If only a single monthly bill is shown, estimate the annual figure from that one month (accounting for typical seasonal swings if a usage history graph is visible) and say so in notes.' },
      avg_rate_per_kwh: { type: 'number', description: 'Blended average price paid per kWh in dollars for the billing period shown (total electric charges divided by total kWh), e.g. 0.42. Not the highest tier rate — the effective blended average.' },
      monthly_amount_paid: { type: 'number', description: 'The dollar amount owed/charged on the most recent single billing period shown (before any true-up credit is applied).' },
      annual_amount_paid: { type: 'number', description: 'Total dollars paid/owed over the trailing 12 months. Prefer the True-Up statement\'s annual total if shown; otherwise estimate as monthly_amount_paid x 12 (adjust for known seasonal swings if visible) and say so in notes.' },
      care: { type: 'boolean', description: 'True only if the bill explicitly shows CARE (California Alternate Rates for Energy) discount enrollment.' },
      fera: { type: 'boolean', description: 'True only if the bill explicitly shows FERA (Family Electric Rate Assistance) discount enrollment.' },
      medical_baseline: { type: 'boolean', description: 'True only if the bill explicitly shows a Medical Baseline allowance/adjustment.' },
      source: { type: 'string', enum: ['true_up', 'monthly_bill', 'unknown'], description: 'true_up = a 12-month True-Up/annual statement was read (most accurate annual figures). monthly_bill = only a single month\'s bill was available (annual figures are an estimate). unknown = could not tell.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: { type: 'string', description: 'Anything the rep should know before trusting these numbers: illegible sections, which figures are estimated vs. actual, an unusual rate schedule, multiple accounts/meters on one bill, etc. Empty string if nothing to flag.' }
    },
    required: ['readable']
  }
};

const SYSTEM = `You are Quoya, reading a California residential utility bill (SDG&E, SCE, LADWP, or another CA utility) uploaded by a Solar Review sales rep during a field evaluation. Extract exactly what report_bill_analysis asks for — nothing more.

What to look for:
- "Total kWh" / usage figures, and a 12-month usage history graph or table if present (SDG&E/SCE True-Up statements carry these; a single monthly bill usually does not).
- The bill's total dollar amount for the period, and any annual True-Up total if this is a NEM/true-up statement.
- Discount program lines: "CARE", "California Alternate Rates for Energy", "FERA", "Family Electric Rate Assistance", or "Medical Baseline" — these are usually called out explicitly near the rate schedule or account summary, not something to infer.
- Tiered rate schedules (Tier 1/2/3, Baseline/Non-Baseline, Peak/Off-Peak on a TOU plan) — compute the BLENDED average ($/kWh), not any single tier's rate.

Never guess a number that is not supported by the document. If a figure genuinely cannot be determined, leave it null and say why in notes rather than inventing a plausible-looking value — a wrong number handed to a rep as fact is worse than a blank field.

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
    return reply(200, {
      readable: out.readable !== false,
      annual_kwh: typeof out.annual_kwh === 'number' ? out.annual_kwh : null,
      avg_rate_per_kwh: typeof out.avg_rate_per_kwh === 'number' ? out.avg_rate_per_kwh : null,
      monthly_amount_paid: typeof out.monthly_amount_paid === 'number' ? out.monthly_amount_paid : null,
      annual_amount_paid: typeof out.annual_amount_paid === 'number' ? out.annual_amount_paid : null,
      care: !!out.care,
      fera: !!out.fera,
      medical_baseline: !!out.medical_baseline,
      source: ['true_up', 'monthly_bill', 'unknown'].indexOf(out.source) >= 0 ? out.source : 'unknown',
      confidence: ['high', 'medium', 'low'].indexOf(out.confidence) >= 0 ? out.confidence : 'low',
      notes: typeof out.notes === 'string' ? out.notes.slice(0, 500) : ''
    });
  } catch (e) {
    console.error('eval-bill-analysis failed:', e.message);
    return reply(200, { readable: false, notes: 'Quoya could not analyze the bill right now — try again in a moment.' });
  }
};
