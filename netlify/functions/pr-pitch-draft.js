// Drafts a personalized media pitch for one pr_targets row. Draft only — nothing is sent.
// POST { id, angle? }  (origin-allowlisted like the other internal functions)
// Loads the row server-side (the client never supplies facts), asks Claude for subject + body through a
// forced tool, strips any fixmy.energy link that is not on the approved page list, saves the draft to the
// row and returns it. Env: ANTHROPIC_KEY, SUPA_SERVICE_KEY.
const SUPA_REST = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const PAGES = ['/defunct-solar-installers', '/blog/sunpower-out-of-business', '/blog/sunnova-bankruptcy', '/blog/freedom-forever-bankruptcy',
  '/blog/solaredge-inverter-error-codes', '/blog/sdge-electric-rates-2026', '/blog/battery-storage-sgip-rebate',
  '/blog/sunrun-vivint-evening-bills-battery', '/southern-california-solar-repair'];

const HOSTS = new Set(['fixmy.energy', 'www.fixmy.energy']);
function originAllowed(event) {
  const h = event.headers || {};
  const src = h.origin || h.Origin || h.referer || h.Referer || '';
  if (!src) return false;
  try { const host = new URL(src).hostname.toLowerCase(); return HOSTS.has(host) || host.endsWith('.netlify.app'); } catch (e) { return false; }
}
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
function out(code, obj) { return { statusCode: code, headers: cors, body: JSON.stringify(obj) }; }

const SYSTEM = `You write short, honest media pitches for Dennis Larsen, owner of Solar Review (fixmy.energy), a San Diego solar service company: independent diagnostics, repair, monitoring and battery retrofits, especially for homeowners whose installer has closed. Phone (619) 777-6527.

RULES:
- 110 to 150 words in the body. Plain text, no markdown, no bullet lists longer than 3 lines, no emojis, no attachments.
- Open with one specific, true reason you are writing to THIS outlet or person, using only what is in the "Why this outlet" and "Contact" fields you were given. Never claim you read a specific article unless the fields name it.
- One timely hook (the angle), then what Dennis can offer: a plain-language explanation of what homeowners should check, an interview, or a field-based view. Offer expertise and usefulness, not a sales pitch.
- Do NOT invent statistics, customer counts, quotes, awards, press history or relationships. Use only the facts in the brief. If a number is not in the brief, leave it out.
- Never mention backlinks, SEO, "dofollow", link exchanges or ask for a link. If a resource fits, mention ONE of our pages naturally as a resource they are welcome to look at, using only a path from the approved list.
- End with a low-pressure close and offer to drop it if it is not relevant. Sign: Dennis Larsen, Solar Review, (619) 777-6527, fixmy.energy.
- For outlets of type source_platform, write a short expert profile/answer template (80-120 words) instead of a cold pitch, in the same honest style.
- Subject: under 70 characters, specific, no clickbait, no ALL CAPS.`;

const TOOL = {
  name: 'write_pitch',
  description: 'Return the pitch.',
  input_schema: {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      body: { type: 'string' },
      link_page: { type: 'string', description: 'The ONE approved page path mentioned in the body, or empty string' },
      alt_subjects: { type: 'array', items: { type: 'string' }, description: 'Two alternative subject lines' }
    },
    required: ['subject', 'body']
  }
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method Not Allowed' });
  if (!originAllowed(event)) return out(403, { error: 'Forbidden' });
  const akey = process.env.ANTHROPIC_KEY, skey = process.env.SUPA_SERVICE_KEY;
  if (!akey || !skey) return out(500, { error: 'Server keys not set' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'Bad JSON' }); }
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return out(400, { error: 'Bad id' });

  const sh = { apikey: skey, Authorization: 'Bearer ' + skey, 'Content-Type': 'application/json' };
  const rr = await fetch(SUPA_REST + '/pr_targets?id=eq.' + id + '&select=*&limit=1', { headers: sh });
  const rows = rr.ok ? await rr.json() : [];
  const t = rows[0];
  if (!t) return out(404, { error: 'Outlet not found' });
  const angle = String(body.angle || t.angle || '').slice(0, 600);

  const brief = [
    'Outlet: ' + t.outlet + ' (' + (t.outlet_type || 'other') + ', ' + (t.region || 'region not given') + ')',
    'Why this outlet: ' + (t.why || 'not given'),
    'Contact: ' + (t.contact_name ? t.contact_name + (t.contact_role ? ', ' + t.contact_role : '') : 'no named contact — address the editorial desk'),
    'Story angle to pitch: ' + (angle || 'not given — choose a sensible one from installer closures and homeowner support'),
    'Approved pages you may mention (pick at most one, https://fixmy.energy + path): ' + PAGES.join(', ')
  ].join('\n');

  let resp;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': akey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1200, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'tool', name: 'write_pitch' },
        messages: [{ role: 'user', content: brief }] })
    });
    if (!r.ok) return out(502, { error: 'Draft service unavailable', detail: (await r.text()).slice(0, 200) });
    resp = await r.json();
  } catch (e) { return out(502, { error: 'Draft service unavailable' }); }

  const tu = (resp.content || []).find(function (b) { return b.type === 'tool_use'; });
  if (!tu) return out(502, { error: 'No draft returned' });
  let subject = String(tu.input.subject || '').trim().slice(0, 120);
  let text = String(tu.input.body || '').trim();
  // Any fixmy.energy link must be on the approved list; otherwise remove it rather than send an unknown URL.
  text = text.replace(/https?:\/\/(?:www\.)?fixmy\.energy(\/[^\s)>,"']*)?/gi, function (m, p) {
    const path = (p || '').replace(/[.]+$/, '');
    return (path === '' || PAGES.indexOf(path) > -1) ? m : 'https://fixmy.energy';
  });
  if (!subject || !text) return out(502, { error: 'Empty draft' });

  await fetch(SUPA_REST + '/pr_targets?id=eq.' + id, { method: 'PATCH', headers: sh,
    body: JSON.stringify({ pitch_subject: subject, pitch_body: text, updated_at: new Date().toISOString() }) }).catch(function () {});
  return out(200, { subject: subject, body: text, alt_subjects: (tu.input.alt_subjects || []).slice(0, 2), link_page: tu.input.link_page || '' });
};
