// Quoya Assist — live field-extraction endpoint (2026-08-25, per Dennis).
//
// Takes a running, still-in-progress speech-to-text transcript of a live call plus
// whatever the form/card already knows, and returns any NEW field values it can
// confidently pull out (New Lead Capture uses these to type straight into the form),
// what's still missing, and one short coaching line if the conversation seems off
// track or a required question hasn't come up yet (Dialer/Doors use only this —
// an existing lead's name/phone/address are already on file, so there's nothing to
// auto-fill there, only something to nudge the rep about).
//
// Hardened like dialer-notes.js: origin allowlist, payload reconstructed server-side,
// transcript length capped, model/max_tokens fixed here. Called repeatedly (every
// few seconds) while a call is live, so this stays on the cheap/fast Haiku model with
// a small max_tokens budget — this is NOT the end-of-call summarizer, dialer-notes.js
// still owns that.
//
// ENV vars required: ANTHROPIC_KEY.

const MAX_TRANSCRIPT = 6000;

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
  if (!key) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'not_configured' }) };

  let incoming;
  try { incoming = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const transcript = String(incoming.transcript || '').slice(0, MAX_TRANSCRIPT);
  if (transcript.trim().length < 15) return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'too_short' }) };

  const known = incoming.known || {};
  const knownLines = [
    'first_name: ' + JSON.stringify(String(known.first_name || '')),
    'last_name: ' + JSON.stringify(String(known.last_name || '')),
    'phone: ' + JSON.stringify(String(known.phone || '')),
    'email: ' + JSON.stringify(String(known.email || '')),
    'address: ' + JSON.stringify(String(known.address || '')),
    'monthly_bill: ' + JSON.stringify(String(known.monthly_bill || '')),
    'has_solar: ' + JSON.stringify(String(known.has_solar || '')),
    'postcard_available: ' + (known.postcard_available ? 'true' : 'false'),
    'utility_bill_available: ' + (known.utility_bill_available ? 'true' : 'false'),
    'window_prompted: ' + (known.window_prompted ? 'true' : 'false')
  ].join('\n');

  const prompt = [
    'You are "Quoya Assist", a live administrative assistant listening in on a solar sales rep\'s phone call with a homeowner (Solar Review / FixMy.Energy, San Diego). You get a rough, still-in-progress speech-to-text transcript of the call so far — both sides mixed together, imperfect. Your job is to fill in a lead-intake form AS THE CALL HAPPENS, and to gently coach the rep if they are missing something important or drifting off track.',
    '',
    'FIELDS ALREADY ON THE FORM (do not repeat these back unless the transcript gives a DIFFERENT, more complete, or corrected value):',
    knownLines,
    '',
    'TRANSCRIPT SO FAR:',
    transcript,
    '',
    'Respond with ONLY valid JSON, no extra text:',
    '{',
    '  "fields": {',
    '    "first_name": "<string or null — only if clearly stated>",',
    '    "last_name": "<string or null>",',
    '    "phone": "<string or null — digits/formatting as heard, only if clearly stated as THEIR number>",',
    '    "email": "<string or null — only if clearly spelled out or stated>",',
    '    "address": "<string or null — the service address being discussed, only if clearly stated>",',
    '    "monthly_bill": "<number as a string, or null — their average monthly electric bill paid to the utility, NOT a solar loan/lease payment>",',
    '    "has_solar": "<\'yes\', \'no\', or null — do they currently have solar panels on the house>",',
    '    "postcard_available": <true only if the transcript shows they confirmed having the mailer/postcard on hand, else false>,',
    '    "utility_bill_available": <true only if they confirmed having a recent utility bill available, else false>,',
    '    "window_prompted": <true only if the rep told them about the two-hour arrival window for the appointment, else false>',
    '  },',
    '  "missing": ["<short label, e.g. \'Monthly Bill\', for anything from: First Name, Cell Phone, Service Address, that is STILL not known after applying the fields above and is a required field, in the order they would naturally come up in a qualifying call>"],',
    '  "guidance": "<ONE short, plain-spoken sentence coaching the rep right now, or null if nothing needed. Use this ONLY when: a required field is still missing and the conversation seems to have moved past it, OR the conversation has clearly drifted off-topic from qualifying this lead. Never invent urgency — null is the common case.>"',
    '}',
    '',
    'Only set a field if the transcript actually supports it — never guess or invent a value. Leave a field null rather than fabricate. A misheard or unclear value should be left null, not forced.'
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
        // Trimmed from 400 -- the real JSON payload (10 fields + a short missing
        // list + one guidance sentence) comfortably fits in ~250-300 tokens, and
        // every unused token in the cap is dead decode time on the speed-critical
        // path (2026-08-25, "it's very slow" follow-up).
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      const upstream = (data.error && data.error.message) || ('Anthropic HTTP ' + resp.status);
      console.error('quoya-assist-extract upstream failed:', resp.status, upstream);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'unavailable' }) };
    }

    let raw = ((data.content && data.content[0] && data.content[0].text) || '').trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const brace = raw.indexOf('{'); if (brace > 0) raw = raw.slice(brace);
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch (e) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'unparseable' }) };
    }

    const f = parsed.fields || {};
    const fields = {
      first_name: typeof f.first_name === 'string' ? f.first_name.slice(0, 80) : null,
      last_name: typeof f.last_name === 'string' ? f.last_name.slice(0, 80) : null,
      phone: typeof f.phone === 'string' ? f.phone.slice(0, 40) : null,
      email: typeof f.email === 'string' ? f.email.slice(0, 120) : null,
      address: typeof f.address === 'string' ? f.address.slice(0, 200) : null,
      monthly_bill: typeof f.monthly_bill === 'string' ? f.monthly_bill.slice(0, 20) : null,
      has_solar: (f.has_solar === 'yes' || f.has_solar === 'no') ? f.has_solar : null,
      postcard_available: f.postcard_available === true,
      utility_bill_available: f.utility_bill_available === true,
      window_prompted: f.window_prompted === true
    };
    const missing = Array.isArray(parsed.missing) ? parsed.missing.slice(0, 6).map(function (s) { return String(s).slice(0, 40); }) : [];
    const guidance = typeof parsed.guidance === 'string' && parsed.guidance.trim() ? parsed.guidance.trim().slice(0, 200) : null;

    return { statusCode: 200, headers: cors, body: JSON.stringify({ fields: fields, missing: missing, guidance: guidance }) };
  } catch (e) {
    console.error('quoya-assist-extract failed:', e.message);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'unavailable' }) };
  }
};
