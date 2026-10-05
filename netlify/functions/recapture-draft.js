// Quoya Assist — recapture message drafter (2026-10-05, per Dennis).
// A lead was Paused / Not interested but may still want help. This DRAFTS one gentle SMS + email
// for the rep to review, edit and approve — it never sends anything (recapture-send.js does, only
// after a rep taps Send). Hardened like diag-report-draft.js: origin allowlist, inputs capped,
// model/max_tokens fixed here, no web search, single focused call.
// ENV: ANTHROPIC_KEY.
const ALLOWED_ORIGIN_HOSTS = new Set(['fixmy.energy', 'www.fixmy.energy']);
function originAllowed(event) {
  const h = event.headers || {};
  const src = h.origin || h.Origin || h.referer || h.Referer || '';
  if (!src) return false;
  try { const host = new URL(src).hostname.toLowerCase(); return ALLOWED_ORIGIN_HOSTS.has(host) || host.endsWith('.netlify.app'); } catch (e) { return false; }
}
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (obj) => ({ statusCode: 200, headers: cors, body: JSON.stringify(obj) });

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!originAllowed(event)) return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Forbidden' }) };
  const key = process.env.ANTHROPIC_KEY;
  if (!key) return reply({ error: 'not_configured' });
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const first = String(b.first_name || 'there').slice(0, 60);
  const exit = ['paused', 'not_interested'].indexOf(b.exit) > -1 ? b.exit : 'paused';
  const reason = String(b.reason || '').slice(0, 400);
  const touch = Math.min(3, Math.max(1, parseInt(b.touch, 10) || 1));
  const sensitive = !!b.sensitive;
  const service = b.pipeline === 'new_solar' ? 'a new solar system' : 'a solar check-up / repair / battery upgrade';
  const rep = String(b.rep_name || 'the Solar Review team').slice(0, 60);
  const lastNote = String(b.last_note || '').slice(0, 500);

  const prompt = [
    'You write a SHORT follow-up for Solar Review, a San Diego solar company, to a homeowner who asked to pause or decided not to move forward on ' + service + '. A human rep will review and edit before anything is sent.',
    '',
    'Homeowner first name: ' + first,
    'Status: ' + (exit === 'paused' ? 'asked us to wait / reschedule' : 'said not interested right now'),
    reason ? 'Reason the rep recorded: ' + reason : '',
    lastNote ? 'Recent note: ' + lastNote : '',
    'This is follow-up number ' + touch + ' of ' + (sensitive ? 2 : 3) + '. Sender: ' + rep + '.',
    sensitive ? 'SENSITIVE: the reason involves health, family or hardship. Be warm and brief, express care, ask for nothing, push nothing, do not mention solar savings, offers or scheduling beyond "whenever you are ready".' : '',
    '',
    'RULES:',
    '- Respectful, warm, low-pressure. Never guilt, never urgency, never "last chance". No emojis, no markdown.',
    '- Never quote a price, a savings figure or an incentive. Never promise results. Never talk down any other company.',
    '- If the reason is personal (health/family), acknowledge it kindly in one short clause without repeating details back; never make it sound like we are using it.',
    '- Follow-up 1: acknowledge and say we are here whenever ready. Follow-up 2: a light check-in with one easy reply option. Follow-up 3: a final gentle note that the door is open and they can ignore this; say we will not keep messaging.',
    '- SMS: under 300 characters, plain text, signed "- Solar Review". Do NOT add opt-out wording (it is appended automatically).',
    '- Email: subject under 60 characters, 2-3 short sentences in "body". Plain text.',
    '',
    'Respond with ONLY valid JSON: { "sms": "...", "email_subject": "...", "email_body": "..." }'
  ].filter(function (l) { return l !== ''; }).join('\n');

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    if (!resp.ok) { console.error('recapture-draft upstream', resp.status, (data.error && data.error.message) || ''); return reply({ error: 'unavailable', detail: String((data.error && data.error.message) || resp.status).slice(0, 300) }); }
    let raw = ((data.content && data.content[0] && data.content[0].text) || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const brace = raw.indexOf('{'); if (brace > 0) raw = raw.slice(brace);
    let p; try { p = JSON.parse(raw); } catch (e) { return reply({ error: 'unparseable' }); }
    const clean = (s, n) => String(s || '').replace(/\*\*/g, '').trim().slice(0, n);
    const out = { sms: clean(p.sms, 320), email_subject: clean(p.email_subject, 90), email_body: clean(p.email_body, 1200) };
    if (!out.sms || !out.email_body) return reply({ error: 'unparseable' });
    return reply(out);
  } catch (e) { console.error('recapture-draft failed:', e.message); return reply({ error: 'unavailable', detail: String(e.message || e).slice(0, 200) }); }
};
