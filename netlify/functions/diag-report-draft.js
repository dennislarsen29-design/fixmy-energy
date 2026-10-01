// Quoya Assist — Diagnostic Report drafter (2026-10-01, per Dennis).
//
// The installer (Cosmic etc.) reports diagnostic findings over the PHONE, never in writing,
// and Dennis types them up in his own shorthand ("H/O", "micros", "AC mods"). This turns those
// raw notes into the plain-language customer Diagnostic Report that lands in
// customers.diagnostic_findings. It ONLY drafts — the portal shows the result in an editable
// box and nothing reaches the customer until Dennis saves it.
//
// Hardened like dialer-notes.js: origin allowlist, payload rebuilt server-side, notes capped,
// model/max_tokens fixed here. Single focused call (no web search), so it runs synchronously
// (netlify.toml timeout=26).
//
// ENV vars required: ANTHROPIC_KEY.

const MAX_NOTES = 6000;

const ALLOWED_ORIGIN_HOSTS = new Set(['fixmy.energy', 'www.fixmy.energy']);
function originAllowed(event) {
  const h = event.headers || {};
  const src = h.origin || h.Origin || h.referer || h.Referer || '';
  if (!src) return false;
  try {
    const host = new URL(src).hostname.toLowerCase();
    return ALLOWED_ORIGIN_HOSTS.has(host) || host.endsWith('.netlify.app');
  } catch (e) { return false; }
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (obj) => ({ statusCode: 200, headers: cors, body: JSON.stringify(obj) });

// The only headings the customer report may contain — the portal + proposal page bold exactly these.
const HEADINGS = ['What we found:', 'Why it happened:', 'What we recommend:', 'Warranty / coverage:'];

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!originAllowed(event)) return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Forbidden' }) };

  const key = process.env.ANTHROPIC_KEY;
  if (!key) return reply({ error: 'not_configured' });

  let incoming;
  try { incoming = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const notes = String(incoming.notes || '').slice(0, MAX_NOTES).trim();
  if (notes.length < 10) return reply({ error: 'too_short' });
  const ctx = incoming.context || {};
  const first = String(ctx.first_name || '').slice(0, 60);
  const addr = String(ctx.address || '').slice(0, 160);
  const existing = String(ctx.existing_report || '').slice(0, 3000);

  const prompt = [
    'You write the customer-facing "Diagnostic Report" for Solar Review, a San Diego solar repair company. A technician from our installer partner inspected a homeowner\'s solar system and phoned the findings to our owner, who typed them below in rough shorthand. Rewrite them as a short, clear report the HOMEOWNER will read.',
    '',
    first ? 'Homeowner first name: ' + first : '',
    addr ? 'Address: ' + addr : '',
    '',
    'RAW NOTES (the only source of truth):',
    notes,
    existing ? '\nREPORT ALREADY ON FILE (revise/merge if the notes update it, otherwise ignore):\n' + existing : '',
    '',
    'RULES:',
    '- Plain language an average homeowner understands. Expand shorthand (H/O = the homeowner, micros = microinverters, AC mods = AC modules). Explain a technical term in a few words if you must use it.',
    '- Use ONLY facts in the notes. Never invent a finding, cause, number, date, warranty term, or dollar figure. If the notes do not say it, leave it out.',
    '- Refer to "our technician" / "our team". Never mention that findings came by phone, text, or from a specific company by name unless the notes make it part of the finding (e.g. a manufacturer\'s warranty).',
    '- Never quote a price for Solar Review\'s work, never promise a result or savings, never state or guess an incentive amount (a credit another company already agreed to, stated in the notes, may be mentioned as stated). Never talk down the original installer or blame anyone.',
    '- Never claim a partnership with a manufacturer.',
    '- Calm, factual, reassuring tone. Short sentences. No emojis, no markdown symbols (no ** or #).',
    '- Use ONLY these section headings, each on its own line ending with a colon, in this order, and OMIT any section the notes do not support: ' + HEADINGS.join(' | '),
    '- Put the plain-text body directly under its heading. Separate sections with one blank line. Bullets (a leading "- ") are fine for lists of items.',
    '',
    'Respond with ONLY valid JSON, no extra text:',
    '{ "report": "<the report text>", "needs_detail": "<ONE short sentence telling the owner what crucial information is missing or unclear in the notes (e.g. what the recommended fix is), or null if the notes are enough>" }'
  ].filter(function (l) { return l !== ''; }).join('\n');

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      const upstream = (data.error && data.error.message) || ('Anthropic HTTP ' + resp.status);
      console.error('diag-report-draft upstream failed:', resp.status, upstream);
      // Rep-safe generic error; raw cause only in the separate detail field (portal shows it to admin only).
      return reply({ error: 'unavailable', detail: String(upstream).slice(0, 300) });
    }
    let raw = ((data.content && data.content[0] && data.content[0].text) || '').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const brace = raw.indexOf('{'); if (brace > 0) raw = raw.slice(brace);
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return reply({ error: 'unparseable' }); }
    let report = String(parsed.report || '').replace(/\*\*/g, '').trim();
    if (!report) return reply({ error: 'unparseable' });
    const needs = typeof parsed.needs_detail === 'string' && parsed.needs_detail.trim() ? parsed.needs_detail.trim().slice(0, 220) : null;
    return reply({ report: report.slice(0, 3500), needs_detail: needs });
  } catch (e) {
    console.error('diag-report-draft failed:', e.message);
    return reply({ error: 'unavailable', detail: String(e.message || e).slice(0, 200) });
  }
};
