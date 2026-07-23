// Dialer AI note-taker — receives a live call transcript from the Black Box
// Dialer's 🎙 AI Notes feature (browser SpeechRecognition on speakerphone) and
// returns a crisp CRM call note + a suggested disposition. The note prefills
// the dialer's call-note box for the rep to review; nothing is auto-committed.
//
// Hardened like claude-vision.js: origin allowlist + payload reconstructed
// server-side, transcript length capped, model/max_tokens fixed here.
//
// ENV vars required: ANTHROPIC_KEY.

const OUTCOMES = ['no_answer', 'left_vm', 'callback', 'warm', 'booked', 'not_interested', 'wrong_number', 'dnc'];
const MAX_TRANSCRIPT = 12000;

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

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!originAllowed(event)) return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Forbidden' }) };

  const key = process.env.ANTHROPIC_KEY;
  if (!key) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'ANTHROPIC_KEY not set in Netlify' }) };

  let incoming;
  try { incoming = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const transcript = String(incoming.transcript || '').slice(0, MAX_TRANSCRIPT);
  if (transcript.trim().length < 25) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Transcript too short' }) };
  const lead = incoming.lead || {};
  const leadCtx = [
    lead.name ? 'Homeowner: ' + String(lead.name).slice(0, 80) : '',
    lead.installer ? 'Original installer (defunct): ' + String(lead.installer).slice(0, 80) : '',
    lead.address ? 'Address: ' + String(lead.address).slice(0, 120) : ''
  ].filter(Boolean).join('\n');

  const prompt = [
    'You are the note-taker for Solar Review, a San Diego solar diagnostic company. A sales rep just finished a cold call to a homeowner (often one whose original solar installer went out of business). Below is a rough speech-to-text transcript of the call — both sides mixed together, imperfect transcription.',
    '',
    leadCtx ? leadCtx + '\n' : '',
    'TRANSCRIPT:',
    transcript,
    '',
    'Write a CRM call note and suggest the disposition. Respond with ONLY valid JSON, no extra text:',
    '{',
    '  "note": "<2-4 sentences: who they spoke to, key facts about the solar system/bill mentioned, their sentiment, objections raised, and the agreed next step. Facts only — no filler.>",',
    '  "suggested_outcome": "<exactly one of: ' + OUTCOMES.join(' | ') + '>"',
    '}',
    '',
    'Disposition guide: booked = appointment time agreed; callback = they asked to be called at a specific/later time; warm = real interest, no commitment; not_interested = clear no; dnc = asked to stop being contacted; wrong_number = not the homeowner; left_vm = the transcript is the rep leaving a voicemail; no_answer = no conversation happened.'
  ].join('\n');

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error((data.error && data.error.message) || ('Anthropic HTTP ' + resp.status));

    let raw = ((data.content && data.content[0] && data.content[0].text) || '').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const brace = raw.indexOf('{'); if (brace > 0) raw = raw.slice(brace);
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch (e) { /* fall through */ }

    const note = String(parsed.note || raw || '').slice(0, 1200);
    const outcome = OUTCOMES.indexOf(parsed.suggested_outcome) >= 0 ? parsed.suggested_outcome : null;
    return { statusCode: 200, headers: cors, body: JSON.stringify({ note: '🎙 ' + note, suggested_outcome: outcome }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
