// Shared Quoya evaluation-analysis logic, used by eval-analysis-background.js.
// Extracted 2026-08-19 when the synchronous eval-analysis.js was retired in favor of a
// background function + lead_evaluations polling — Netlify's 26s synchronous cap was
// cutting off a slow vision+web-search run mid-flight ("Quoya took too long" in the
// field). Keeping the prompt/tool/photo-ranking logic in one place so there is only ever
// one implementation to edit.

const MODEL = 'claude-opus-5';

// Photo labels that are worth spending vision tokens on, most diagnostic first. A full
// evaluation can carry 20+ images; sending all of them is slow and mostly redundant.
const VISION_PRIORITY = [
  'Inverter Photo', 'Serial Number', 'Production Screenshot', 'Utility Bill',
  'Meter Photo', 'MSP Step Back Photo', 'MSP Sticker Photo', 'Panel Placard',
  'Battery Placement Wall Photo', 'Solar Array', 'Front of House'
];
const MAX_IMAGES = 8;

// A modern phone photo can run 5-15MB unresized, and this project has no image-resize
// library available (no `sharp`, nothing installed) — the fetched bytes go straight to
// base64 as-is. With no cap, 8 full-resolution photos could both (a) exceed Anthropic's
// per-request size limit outright ("request_too_large", confirmed live 2026-08-19 on a
// real evaluation) and (b) risk OOM-killing the whole Netlify function while buffering
// them — a hard process crash bypasses every try/catch, which is almost certainly why a
// separate evaluation the same day got stuck at status='analyzing' forever with no error
// ever written. Anthropic also gains nothing from more than ~1568px on the long edge —
// larger just gets downscaled server-side — so a byte cap costs no real accuracy.
const MAX_SINGLE_IMAGE_BYTES = 8 * 1024 * 1024;   // skip any one image over this, raw
const MAX_TOTAL_B64_BYTES    = 24 * 1024 * 1024;  // stop adding images once the running
                                                    // base64 total would cross this —
                                                    // leaves headroom under Anthropic's
                                                    // ~32MB request cap for the tool
                                                    // schema, system prompt and text.

function rankPhotos(photos) {
  return photos.slice().sort((a, b) => {
    const ia = VISION_PRIORITY.indexOf(a.label || '');
    const ib = VISION_PRIORITY.indexOf(b.label || '');
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

async function toImageBlock(p) {
  try {
    const r = await fetch(p.url, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    // A PDF utility bill can't go down the vision path — it's passed as a document block.
    if (!/^image\/(jpeg|png|gif|webp)$/.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_SINGLE_IMAGE_BYTES) {
      console.warn('[eval-analysis] skipping oversized photo', p.url, buf.length, 'bytes');
      return null;
    }
    const b64 = buf.toString('base64');
    return { type: 'image', source: { type: 'base64', media_type: ct, data: b64 } };
  } catch (e) {
    console.warn('[eval-analysis] photo fetch failed', p.url, e.message);
    return null;
  }
}

const TOOL = {
  name: 'report_evaluation',
  description: 'Report the evaluation findings, or the questions needed to complete them.',
  input_schema: {
    type: 'object',
    properties: {
      confident: { type: 'boolean', description: 'True only if you can recommend a scope of work responsibly from what you were given.' },
      questions: {
        type: 'array',
        description: 'When not confident: the specific things the rep must check on-site. Plain language a non-expert can act on. Prefer multiple choice.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            question: { type: 'string', description: 'Short, concrete, answerable while standing at the equipment.' },
            choices: { type: 'array', items: { type: 'string' }, description: 'Tappable answers. Empty for free text.' },
            why: { type: 'string', description: 'One line: what this rules in or out.' }
          },
          required: ['id', 'question']
        }
      },
      equipment: {
        type: 'object',
        properties: {
          brand: { type: 'string' }, model: { type: 'string' }, serial: { type: 'string' },
          manufacture_year: { type: 'string' },
          warranty_status: { type: 'string', description: 'e.g. "Out of warranty — 12yr standard, manufactured 2014"' },
          warranty_action: { type: 'string', description: 'If a claim is still possible: who to call and what is needed. Empty if not.' }
        }
      },
      diagnosis: { type: 'string', description: 'Plain English, no jargon. What is wrong and why you think so. A rep reads this aloud to themselves before knocking.' },
      likely_causes: {
        type: 'array',
        items: {
          type: 'object',
            properties: {
              cause: { type: 'string' },
              likelihood: { type: 'string', enum: ['high', 'medium', 'low'] },
              evidence: { type: 'string' }
            },
          required: ['cause', 'likelihood']
        }
      },
      recommendation: {
        type: 'object',
        properties: {
          headline: { type: 'string', description: 'The one-line recommended path, e.g. "Replace the dead inverter with a Powerwall 3".' },
          why: { type: 'string', description: 'Why this beats the alternatives, in the homeowner\'s terms.' },
          alternative: { type: 'string', description: 'The other realistic option and why it is second choice.' }
        }
      },
      talking_points: { type: 'array', items: { type: 'string' }, description: '3-5 things to say to the homeowner, in their words. No jargon.' },
      objections: {
        type: 'array',
        description: 'Objections this specific situation invites, with an answer.',
        items: { type: 'object', properties: { objection: { type: 'string' }, answer: { type: 'string' } }, required: ['objection', 'answer'] }
      },
      proposal_prefill: {
        type: 'object',
        description: 'What to put in the internal proposal builder. Use ONLY option_key values from the catalog you were given.',
        properties: {
          option_keys: { type: 'array', items: { type: 'string' } },
          powerwall_count: { type: 'number', description: '0 if no battery is being proposed.' },
          restore_array: { type: 'boolean', description: 'True if existing strings will be reconnected to the new inverter.' },
          array_output_pct: { type: 'number', description: 'Measured current output as a % of expected. 100 if the array is healthy.' },
          notes_for_rep: { type: 'string', description: 'Anything the rep must set manually — squares, panel counts, prices.' }
        }
      },
      missing_data: { type: 'array', items: { type: 'string' }, description: 'Photos or documents that would sharpen this. Not blocking.' }
    },
    required: ['confident']
  }
};

const SYSTEM = `You are Quoya, the field-evaluation analyst for Solar Review (a solar diagnostic, repair and battery-retrofit company in Southern California).

Your reader is a SALES REP WITH NO SOLAR BACKGROUND standing in a homeowner's driveway. Everything you write must be usable by that person. No jargon unless you immediately define it. Never write "consult a qualified technician" — you are the technician.

Rules:
1. If the evidence does not support a responsible recommendation, set confident=false and return QUESTIONS. Ask things the rep can check in the next two minutes at the equipment — an LED colour, a number on a screen, whether a breaker is off. A confident wrong diagnosis handed to a non-expert reaches the customer, which is worse than asking.
2. Use web search for: this exact inverter model's known failure modes, service bulletins and recalls; its warranty length and whether the manufacturer still honours claims (several of these companies are bankrupt); and the meaning of any error code visible in the photos.
3. Serial numbers on SolarEdge, Enphase and SMA encode a manufacture date. Decode it and use it to compute remaining warranty.
4. If the original installer is out of business, say so plainly and explain what that means for the homeowner — the warranty may still be live with the MANUFACTURER even when the installer is gone. This is the single most valuable thing you can tell them.
5. proposal_prefill.option_keys must be exact option_key strings from the catalog provided. Never invent one. If nothing fits, return an empty array and explain in notes_for_rep.
6. Prices in the catalog are DEALER COST, not retail. Never state a price to the homeowner and never put one in talking_points.
7. A string inverter usually fails PARTIALLY — one MPPT or string down means 40-65% output, not 25%. Derive array_output_pct from measured production versus expected whenever production data is present; only fall back to an estimate if it is not.
8. A Powerwall 3 has its own 11.5kW solar inverter with 6 MPPTs. When an inverter is dead, existing strings can land directly on the PW3, so no standalone replacement inverter is needed. This is the default cost-reduction play on inverter-failure jobs — check whether it applies before recommending a plain inverter swap.

Call report_evaluation exactly once.`;

// Runs the full analysis. Returns { out } on success, or { error: { message, detail, code } }.
// Never throws — every failure path is caught and classified so the caller always has
// something safe to persist.
async function runEvalAnalysis(anthropicKey, body) {
  const photos   = Array.isArray(body.photos) ? body.photos.filter(p => p && typeof p.url === 'string') : [];
  const hardware = body.hardware || {};
  const lead     = body.lead || {};
  const catalog  = Array.isArray(body.catalog) ? body.catalog.slice(0, 60) : [];
  const answers  = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const notes    = String(body.notes || '').slice(0, 4000);
  const utility  = String(body.utility || '').slice(0, 40);

  try {
    const ranked = rankPhotos(photos).slice(0, MAX_IMAGES);
    const blocks = [];
    let b64Total = 0, includedImages = 0;
    for (const p of ranked) {
      const b = await toImageBlock(p);
      if (!b) continue;
      const size = b.source.data.length;
      // Stop once the NEXT image would cross the budget, rather than the current running
      // total — a strict running-total check would still let one huge image slip through
      // right at the boundary. Images already earlier in VISION_PRIORITY order are kept;
      // this only ever trims off the least-diagnostic tail.
      if (b64Total + size > MAX_TOTAL_B64_BYTES) {
        console.warn('[eval-analysis] image budget reached at', includedImages, 'images —',
          'dropping', p.label || 'unlabeled', 'and anything lower-priority');
        break;
      }
      b64Total += size;
      includedImages++;
      blocks.push({ type: 'text', text: `Photo — ${p.label || 'unlabeled'}:` });
      blocks.push(b);
    }

    const ctx = [];
    if (lead.address)            ctx.push(`Property: ${lead.address}`);
    if (lead.original_installer) ctx.push(`Original installer: ${lead.original_installer}${lead.install_year ? ` (installed ${lead.install_year})` : ''}`);
    if (lead.system_size)        ctx.push(`System size on file: ${lead.system_size} kW`);
    if (lead.monthly_bill)       ctx.push(`Monthly electric bill: $${lead.monthly_bill}`);
    if (utility)                 ctx.push(`Utility: ${utility}`);
    if (hardware.brand)          ctx.push(`Inverter brand (confirmed by rep): ${hardware.brand}`);
    if (hardware.model)          ctx.push(`Inverter model (rep): ${hardware.model}`);
    if (hardware.serial)         ctx.push(`Serial (rep): ${hardware.serial}`);
    if (hardware.platform)       ctx.push(`Monitoring platform: ${hardware.platform}`);
    if (notes)                   ctx.push(`Reported issue / rep + customer notes:\n${notes}`);

    const answerKeys = Object.keys(answers);
    if (answerKeys.length) {
      ctx.push('Rep answered your previous questions:\n' +
        answerKeys.map(k => `- ${k}: ${String(answers[k]).slice(0, 400)}`).join('\n'));
    }

    if (catalog.length) {
      ctx.push('What Solar Review sells (proposal catalog — option_key | title | service_type | dealer cost):\n' +
        catalog.map(c => `${c.option_key} | ${c.title} | ${c.service_type || ''} | ${c.default_price != null ? '$' + c.default_price : 'n/a'}`).join('\n'));
    }

    if (!blocks.length) ctx.push('NOTE: no readable photos were supplied. Rely on the text above, and ask for what you need.');

    blocks.push({ type: 'text', text: ctx.join('\n\n') + '\n\nAnalyze this evaluation and call report_evaluation.' });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        // Required for the web_search server tool. Omitting it fails EVERY call — the
        // exact bug that stopped finance-agent.js producing a single report for weeks.
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        system: SYSTEM,
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 6 },
          TOOL
        ],
        messages: [{ role: 'user', content: blocks }]
      })
    });

    if (!res.ok) {
      const raw = await res.text();
      console.error('[eval-analysis] Anthropic ' + res.status + ': ' + raw.slice(0, 500));
      let code = 'upstream';
      if (/credit balance/i.test(raw)) code = 'credit';
      else if (res.status === 429) code = 'rate_limit';
      else if (res.status === 401 || res.status === 403) code = 'auth';
      return { error: { message: 'Quoya analysis unavailable', detail: raw.slice(0, 300), code } };
    }

    const data = await res.json();
    const call = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'report_evaluation');
    if (!call) {
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').slice(0, 600);
      console.error('[eval-analysis] no tool call. stop_reason=' + data.stop_reason);
      return { error: { message: 'Quoya analysis unavailable', detail: text || 'no tool call', code: 'upstream' } };
    }

    const out = call.input || {};
    // A model that returns confident=false but no questions would strand the rep with a
    // dead end. Give them something actionable either way.
    if (!out.confident && !(out.questions || []).length) {
      out.questions = [{
        id: 'freeform',
        question: 'Describe what you are seeing at the equipment — lights, screen, anything unusual.',
        choices: [],
        why: 'Quoya needs more to go on.'
      }];
    }
    console.log('[eval-analysis] confident=' + !!out.confident +
      ' questions=' + ((out.questions || []).length) +
      ' images=' + includedImages + '/' + ranked.length +
      ' keys=' + ((out.proposal_prefill && out.proposal_prefill.option_keys) || []).join(','));

    return { out };
  } catch (e) {
    console.error('[eval-analysis] ' + e.message);
    return { error: { message: 'Quoya analysis unavailable', detail: e.message, code: 'upstream' } };
  }
}

module.exports = { runEvalAnalysis };
