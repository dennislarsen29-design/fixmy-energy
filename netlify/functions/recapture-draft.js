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


// Tolerant reader: the model sometimes wraps JSON in fences/prose, puts real line breaks inside strings,
// or (rarely) drops the JSON entirely and answers in labelled lines. Try each in turn.
function parseDraft(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i > -1 && j > i) {
    const body = t.slice(i, j + 1);
    try { return JSON.parse(body); } catch (e) {}
    try { return JSON.parse(body.replace(/[\u0000-\u001f]+/g, ' ')); } catch (e) {}
  }
  const grab = function (k) { const m = t.match(new RegExp('"?' + k + '"?\\s*[:=]\\s*"?([\\s\\S]*?)"?\\s*(?:,\\s*"?(?:sms|email_subject|email_body)"?\\s*[:=]|\\}|$)', 'i')); return m ? m[1].trim() : ''; };
  const sms = grab('sms'), email_body = grab('email_body');
  return sms && email_body ? { sms: sms, email_subject: grab('email_subject'), email_body: email_body } : null;
}

const { techLineFor } = require('./lib/tech-line');
// Real facts about this lead (notes, proposal, bill read) so the message can be specific. Best-effort: any failure = no context.
async function loadContext(customerId) {
  const sk = process.env.SUPA_SERVICE_KEY, url = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
  if (!customerId || !sk) return {};
  const H = { apikey: sk, Authorization: 'Bearer ' + sk };
  const ctx = {};
  try {
    const r = await fetch(url + '/customers?id=eq.' + encodeURIComponent(customerId) + '&select=notes,monthly_bill,proposal,diagnostic_findings,lead_category,utility,system_size', { headers: H });
    const c = ((await r.json()) || [])[0] || {};
    let notes = c.notes; try { if (typeof notes === 'string') notes = JSON.parse(notes); } catch (e) {}
    if (Array.isArray(notes)) ctx.notes = notes.filter(function (n) { return n && n.text; }).slice(-8).map(function (n) { return String(n.text).replace(/\s+/g, ' ').slice(0, 220); });
    else if (typeof notes === 'string' && notes) ctx.notes = [notes.replace(/\s+/g, ' ').slice(0, 600)];
    if (c.monthly_bill) ctx.monthly_bill = c.monthly_bill;
    if (c.diagnostic_findings) ctx.findings = String(c.diagnostic_findings).replace(/\s+/g, ' ').slice(0, 500);
    const pr = c.proposal;
    if (pr && Array.isArray(pr.options)) {
      ctx.proposal_status = pr.status || '';
      ctx.options = pr.options.slice(0, 3).map(function (o) {
        return { title: o.title, price: o.price, participate_price: o.participate_price, savings: o.savings && (o.savings.moderate || o.savings), sdcp_rebate: o.sdcp_rebate };
      });
      if (pr.insight) ctx.proposal_note = String(pr.insight).replace(/\s+/g, ' ').slice(0, 400);
    }
  } catch (e) {}
  try {
    const r = await fetch(url + '/lead_evaluations?customer_id=eq.' + encodeURIComponent(customerId) + '&select=bill_analysis', { headers: H });
    const e = ((await r.json()) || [])[0];
    if (e && e.bill_analysis) { const ba = e.bill_analysis; ctx.bill = { annual_kwh: ba.annual_kwh, avg_rate_per_kwh: ba.avg_rate_per_kwh, monthly_amount_paid: ba.monthly_amount_paid, annual_amount_paid: ba.annual_amount_paid, source: ba.source }; }
  } catch (e) {}
  return ctx;
}

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

  const ctx = await loadContext(b.customerId);
  const hasCtx = !!(ctx.notes || ctx.options || ctx.bill || ctx.monthly_bill);

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
    hasCtx ? 'WHAT WE KNOW ABOUT THIS HOMEOWNER (real records; use only these facts, never invent any):\n' + JSON.stringify(ctx) : '',
    '',
    sensitive ? '' : 'GOAL: get them to act this week. Write like a confident, caring expert who has already done the homework on THEIR home, not a generic check-in.',
    'RULES:',
    sensitive ? '- SENSITIVE lead: stay warm and brief, ask for nothing, no urgency language at all.' : '- Be direct, specific and persuasive. Lead with the single most compelling real fact from the records: what their bill costs them every month they wait (monthly or annual amount paid), what the proposal we built for them would change, or what the tech found. Show the cost of waiting in their own numbers (e.g. "$X a month is $Y by the end of the year").',
    sensitive ? '' : '- Create urgency ONLY from true things: their own bill figures, the proposal we already gave them, system age/condition findings, that every month of delay is another bill at today\'s rates, utility rates having risen over time. Never invent a deadline, an expiring offer, limited slots, a rebate expiry or a price increase. Never say "last chance" unless this is follow-up 3, and then it means "we will stop messaging you".',
    '- Only quote a dollar figure that appears in the records above, attributed correctly (their bill, or the proposal we sent). Never promise a specific savings result; say "projected" or "estimated" for proposal numbers. Never mention incentives or rebates unless the proposal records include one, and then only as "included in your proposal".',
    '- Persuasive, never manipulative: no guilt, shaming, fear tactics or false claims.',
    '- Reference what was actually discussed (from the notes) in plain words so it feels personal. Never repeat sensitive personal details back, and never talk down another company.',
    '- If there are no records beyond the reason, write short and confident about the cost of waiting in general terms without inventing numbers.',
    sensitive ? '' : '- Follow-up 1: cost of waiting + their specific situation + one clear next step ("reply YES and I will hold a 2-hour window this week" / "I can call you today"). Follow-up 2: a new angle (a different fact from the records, or the objection from the notes answered head-on) + the same easy next step. Follow-up 3: honest close: the numbers one last time, then say we will stop messaging after this.',
    '- SMS: under 320 characters, plain text, ends with one clear call to action, signed "- Solar Review". Do NOT add opt-out wording (appended automatically).',
    '- Email: subject under 60 characters that names a real number or their situation (not generic), 3-5 short sentences in "body", one clear call to action. Plain text, no emojis, no markdown.',
    '',
    'Respond with ONLY valid JSON: { "sms": "...", "email_subject": "...", "email_body": "..." }'
  ].filter(function (l) { return l !== ''; }).join('\n');

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1400, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    if (!resp.ok) { console.error('recapture-draft upstream', resp.status, (data.error && data.error.message) || ''); return reply({ error: 'unavailable', detail: String((data.error && data.error.message) || resp.status).slice(0, 300) }); }
    const rawText = (data.content || []).filter(function (c) { return c && c.type === 'text'; }).map(function (c) { return c.text || ''; }).join('\n').trim();
    if (data.stop_reason === 'max_tokens') console.warn('recapture-draft truncated');
    const p = parseDraft(rawText);
    if (!p) { console.error('recapture-draft unparseable:', rawText.slice(0, 300)); return reply({ error: 'unparseable' }); }
    const clean = (s, n) => String(s || '').replace(/\*\*/g, '').trim().slice(0, n);
    const out = { sms: clean(p.sms, 320), email_subject: clean(p.email_subject, 90), email_body: clean(p.email_body, 1200) };
    if (!out.sms || !out.email_body) return reply({ error: 'unparseable' });
    // The draft is the WHOLE message: Tech contact line + opt-out footer included, so the rep sees and can edit
    // exactly what the customer receives (recapture-send only re-adds the opt-out footer if it was deleted).
    const techLine = await techLineFor(b.customerId, process.env.SUPA_SERVICE_KEY);
    out.sms = out.sms + (techLine ? '\n' + techLine : '') + '\nReply STOP to opt out.';
    out.email_body = out.email_body + (techLine ? '\n\n' + techLine : '') + '\n\nIf you would rather not hear from us, just reply and we will stop.';
    return reply(out);
  } catch (e) { console.error('recapture-draft failed:', e.message); return reply({ error: 'unavailable', detail: String(e.message || e).slice(0, 200) }); }
};
