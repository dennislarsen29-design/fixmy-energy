// eval-troubleshoot-background.js — Quoya Troubleshoot: intelligent on-site error-code
// diagnosis for a downed system (2026-09-18, per Dennis: "I would also like this feature
// to be intelligent. To use its own search and troubleshooting capabilities to help fix
// real issues.")
//
// Fired from the Eval Wizard's Power Cycle step. Reads the rep's error-code photos
// (vision), identifies the exact fault codes on the exact inverter model, uses the
// web_search server tool to pull that model's real documentation / known failure modes /
// service bulletins, and returns concrete next steps a NON-electrician field rep can do —
// switches, breakers, and display buttons ONLY. Result lands in
// lead_evaluations.troubleshoot (jsonb, migration 20260918c) and the wizard polls it —
// the same background-function + row-polling pattern as eval-analysis-background.js.
//
// POST { evalId, photos:[{url,label}], hardware:{brand,model,serial},
//        answers:{ pc_0..pc_7, pc_outcome, ... },
//        lead:{address, system_size, install_year, original_installer} }
//
// Deliberately a separate, focused call from the full eval analysis: this one is about
// THIS fault RIGHT NOW while the rep is standing at the inverter — not scope-of-work /
// proposal building. Runs comfortably inside the 15-min background budget.

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_KEY = process.env.SUPA_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPA_KEY;

const MODEL = 'claude-sonnet-5';

// Error-code screens first — they ARE the diagnosis. Then whatever identifies the unit.
const PHOTO_PRIORITY = ['Error Codes', 'Inverter Photo', 'Serial Number', 'MSP Sticker Photo', 'Production Screenshot'];
const MAX_IMAGES = 6;                              // focused task — codes + unit ID, not the whole site
const MAX_SINGLE_IMAGE_BYTES = 8 * 1024 * 1024;    // same budgets as eval-analysis-core.js —
const MAX_TOTAL_B64_BYTES = 24 * 1024 * 1024;      // the request_too_large / OOM lesson, 2026-08-19

const ALLOWED_ORIGINS = [
  'https://fixmy.energy', 'https://www.fixmy.energy', 'http://localhost:8888'
];
function corsFor(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

async function patchTroubleshoot(evalId, ts) {
  if (!SUPA_KEY) return;
  try {
    await fetch(`${SUPA_URL}/rest/v1/lead_evaluations?id=eq.${evalId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ troubleshoot: ts, updated_at: new Date().toISOString() })
    });
  } catch (e) {
    console.error('[eval-troubleshoot] patch failed:', e.message);
  }
}

async function toImageBlock(p) {
  try {
    const r = await fetch(p.url, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!/^image\/(jpeg|png|gif|webp)$/.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_SINGLE_IMAGE_BYTES) {
      console.warn('[eval-troubleshoot] skipping oversized photo', p.url, buf.length, 'bytes');
      return null;
    }
    return { type: 'image', source: { type: 'base64', media_type: ct, data: buf.toString('base64') } };
  } catch (e) {
    console.warn('[eval-troubleshoot] photo fetch failed', p.url, e.message);
    return null;
  }
}

const TOOL = {
  name: 'report_troubleshoot',
  description: 'Report the on-site troubleshooting findings for this downed/faulting solar system.',
  input_schema: {
    type: 'object',
    properties: {
      identified: { type: 'boolean', description: 'True if at least one specific fault/error code or failure mode was identified from the photos and research.' },
      codes: {
        type: 'array',
        description: 'Every distinct error/fault code visible in the photos (or clearly implied by LED patterns). Empty if none readable.',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'The code exactly as displayed, e.g. "Error 18xC", "Event 3501", "F0021".' },
            meaning: { type: 'string', description: 'One plain-language sentence: what this code means on THIS model, per the manufacturer.' },
            severity: { type: 'string', enum: ['info', 'warning', 'fault', 'critical'] }
          },
          required: ['code', 'meaning']
        }
      },
      diagnosis: { type: 'string', description: 'The most likely root cause in 2-4 plain sentences a non-expert rep can read out. Name the component (arc-fault, isolation/ground fault, grid parameters, failed board, etc.).' },
      on_site_steps: {
        type: 'array',
        description: 'Concrete next actions the rep can do RIGHT NOW, in order. Switches, breakers, display buttons, and observation ONLY — never opening covers, touching wiring, or roof work.',
        items: {
          type: 'object',
          properties: {
            step: { type: 'string', description: 'One imperative sentence.' },
            detail: { type: 'string', description: 'Optional: what to look for / why.' }
          },
          required: ['step']
        }
      },
      resolution: {
        type: 'string',
        enum: ['power_cycle_likely_fixes', 'on_site_fixable', 'needs_licensed_electrician', 'needs_parts', 'warranty_claim', 'needs_more_info'],
        description: 'The honest outlook. warranty_claim when the code indicates a known hardware failure on a unit plausibly still under manufacturer warranty.'
      },
      warranty_note: { type: 'string', description: 'If determinable: manufacturer warranty length for this model, and whether the install year / serial-decoded date suggests it is still covered. Empty if unknown — never guess.' },
      homeowner_talking_point: { type: 'string', description: 'Two sentences the rep can say to the homeowner, plain language. NEVER a price, NEVER a promised outcome, never a named incentive.' },
      photo_retake: { type: 'string', description: 'Set ONLY if the error-code photos are unreadable: one sentence telling the rep exactly what to re-shoot. Empty otherwise.' },
      sources: {
        type: 'array',
        description: 'The manufacturer docs / pages the diagnosis leans on.',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, url: { type: 'string' } },
          required: ['title']
        }
      }
    },
    required: ['identified', 'diagnosis', 'on_site_steps', 'resolution']
  }
};

const SYSTEM = [
  'You are Quoya, Solar Review\'s field troubleshooting expert. A sales rep — NOT an electrician,',
  'NOT a solar technician — is standing at a homeowner\'s faulting/downed solar system in Southern',
  'California right now, and has photographed the inverter\'s error codes for you.',
  '',
  'Your job: identify the exact fault, research it, and give the rep real, safe next steps on site.',
  '',
  'HARD SAFETY RULES — every step you give must obey all of these:',
  '- Switches, breakers, plugs, and display/menu buttons ONLY.',
  '- NEVER instruct opening any cover, enclosure, panel dead-front, junction box, or wiring compartment.',
  '- NEVER instruct touching, probing, or measuring any conductor. No multimeters.',
  '- NEVER instruct going on the roof.',
  '- Anything burnt, melted, buzzing, or smelling of smoke: the instruction is stop, photograph, leave it OFF.',
  '',
  'METHOD:',
  '1. Read every error/fault code, LED pattern, and status text visible in the photos. Read the model',
  '   and serial from the photos when present — trust what you can see over what you were told.',
  '2. Use web_search for THIS exact manufacturer + model + code: the manufacturer\'s own error-code',
  '   documentation, known failure modes, service bulletins, recalls, and warranty terms. Search the',
  '   real code string. Prefer manufacturer sources over forums; use forums only to corroborate.',
  '3. Decode the manufacture date from the serial number format when you know the scheme; combined',
  '   with the install year, judge whether the manufacturer warranty plausibly still applies. If you',
  '   cannot determine it, say so — never invent warranty coverage.',
  '4. Report via report_troubleshoot. Plain language throughout — the rep reads this out loud.',
  '',
  'HONESTY RULES:',
  '- Never state a price or dollar figure anywhere.',
  '- Never promise an outcome to the homeowner ("this will fix it") — say what is likely.',
  '- If the photos are unreadable, say exactly that via photo_retake and ask for the specific re-shoot.',
  '- If the evidence does not support a diagnosis, resolution = needs_more_info with the questions in',
  '  on_site_steps as observation steps. A wrong confident diagnosis is worse than an honest unknown.',
  '- A rep-performed power cycle that already failed to clear the fault means "power cycle it again"',
  '  is NOT an answer — the pc_ checklist state you are given says whether that was already done.'
].join('\n');

async function runTroubleshoot(body) {
  const photos = Array.isArray(body.photos) ? body.photos : [];
  const hw = body.hardware || {};
  const lead = body.lead || {};
  const answers = body.answers || {};

  // Error-code photos first, then unit-ID shots; everything else is left out entirely —
  // this is a focused fault read, not the full site analysis.
  const ranked = photos
    .filter(p => p && p.url && PHOTO_PRIORITY.includes(p.label || ''))
    .sort((a, b) => PHOTO_PRIORITY.indexOf(a.label || '') - PHOTO_PRIORITY.indexOf(b.label || ''))
    .slice(0, MAX_IMAGES * 2); // fetch headroom — some may fail/oversize below

  const blocks = [];
  let b64Total = 0, included = 0;
  for (const p of ranked) {
    if (included >= MAX_IMAGES) break;
    const blk = await toImageBlock(p);
    if (!blk) continue;
    const size = blk.source.data.length;
    if (b64Total + size > MAX_TOTAL_B64_BYTES) {
      console.warn('[eval-troubleshoot] image budget reached, trimming tail');
      break;
    }
    blocks.push({ type: 'text', text: `Photo (${p.label || 'uncategorized'}):` }, blk);
    b64Total += size; included++;
  }

  const pcDone = Object.keys(answers).filter(k => /^pc_\d+$/.test(k) && answers[k]).length;
  const ctx = [];
  ctx.push('SYSTEM CONTEXT (rep-entered — photos win on any conflict):');
  ctx.push(`Inverter brand: ${hw.brand || 'unknown'} | model: ${hw.model || 'unknown'} | serial: ${hw.serial || 'unknown'}`);
  ctx.push(`Install year: ${lead.install_year || 'unknown'} | original installer: ${lead.original_installer || 'unknown'} | system size: ${lead.system_size || 'unknown'} kW`);
  if (lead.address) ctx.push(`Site: ${lead.address}`);
  ctx.push(`Power-cycle checklist: ${pcDone}/8 steps done. Outcome so far: ${answers.pc_outcome || 'not attempted / not recorded yet'}.`);
  if (!included) ctx.push('NOTE: no readable error-code photos were supplied — work from the context above, say what photos you need via photo_retake, and keep on_site_steps to observation.');

  blocks.push({ type: 'text', text: ctx.join('\n') + '\n\nIdentify the fault, research it, and call report_troubleshoot.' });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      // Required for the web_search server tool. Omitting it fails EVERY call — the
      // finance-agent bug, documented repeatedly. Do not remove.
      'anthropic-beta': 'web-search-2025-03-05'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
        TOOL
      ],
      messages: [{ role: 'user', content: blocks }]
    })
  });

  if (!res.ok) {
    const raw = await res.text();
    console.error('[eval-troubleshoot] Anthropic ' + res.status + ': ' + raw.slice(0, 500));
    return { error: 'Anthropic ' + res.status + ': ' + raw.slice(0, 300) };
  }

  const data = await res.json();
  const call = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'report_troubleshoot');
  if (!call) {
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').slice(0, 400);
    console.error('[eval-troubleshoot] no tool call. stop_reason=' + data.stop_reason);
    return { error: 'no tool call — ' + (text || data.stop_reason || 'empty response') };
  }

  const out = call.input || {};
  // Never strand the rep with an empty screen: an identified-nothing result still needs
  // something actionable in it — same rule as eval-analysis-core's question backfill.
  if (!Array.isArray(out.on_site_steps) || !out.on_site_steps.length) {
    out.on_site_steps = [{ step: 'Re-photograph the inverter display up close, straight-on, with every code visible, then run Quoya Troubleshoot again.' }];
  }
  out._images = included;
  console.log('[eval-troubleshoot] identified=' + !!out.identified + ' codes=' + ((out.codes || []).length)
    + ' resolution=' + (out.resolution || '?') + ' images=' + included);
  return { out };
}

exports.handler = async function (event) {
  const CORS = corsFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const evalId = body.evalId;
  if (!evalId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'evalId required' }) };

  if (!ANTHROPIC_KEY) {
    await patchTroubleshoot(evalId, { status: 'failed', error: 'ANTHROPIC_KEY not set', at: new Date().toISOString() });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, skipped: 'no key' }) };
  }

  await patchTroubleshoot(evalId, { status: 'analyzing', at: new Date().toISOString() });

  // The `-background` filename suffix gives this the 15-minute budget — awaiting the
  // full run here is what that buys (see eval-analysis-background.js).
  let out, error;
  try {
    ({ out, error } = await runTroubleshoot(body));
  } catch (e) {
    console.error('[eval-troubleshoot] ' + e.message);
    error = e.message;
  }

  if (error || !out) {
    await patchTroubleshoot(evalId, { status: 'failed', error: String(error || 'unknown'), at: new Date().toISOString() });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false }) };
  }

  await patchTroubleshoot(evalId, { status: 'ready', result: out, at: new Date().toISOString() });
  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
};
