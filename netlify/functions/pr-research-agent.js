// PR research agent — finds legitimate editorial opportunities for Solar Review and queues them for review.
// Weekly (see netlify.toml, via pr-research-agent-background.js for the 15-min budget); also manual from the
// Agents tab ("Run research now" -> run-agent-background?agent=pr).
//
// What it does: uses web_search to find real news / local / solar-trade / business outlets and the PUBLIC
// editorial contact each one lists, plus a timely story angle for each. Every contact email is only kept if
// our own fetch finds that exact address on the public page the agent cites — an unverifiable email is dropped,
// never guessed. New rows land in pr_targets as status 'new' for Dennis to review. NOTHING is ever emailed.
//
// Hard rules in the prompt: no paid/sponsored links, link directories, guest-post farms, PBNs or pay-to-play.
// Env: ANTHROPIC_KEY, SUPA_SERVICE_KEY.
const { fetchText } = require('./lib/pr-fetch');
let feedback = { loadFeedback: async function () { return { text: '', ids: [] }; } };
try { feedback = require('./lib/agent-replies'); } catch (e) {}

const SUPA_REST = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const MAX_PER_RUN = 8;
const TYPES = ['news', 'local', 'trade', 'business', 'podcast', 'association', 'source_platform', 'other'];
const FREE_MAIL = /(^|\.)(gmail|yahoo|hotmail|outlook|aol|icloud|proton|protonmail|live|msn)\./i;

function sb(key, extra) { return Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {}); }
async function supaGet(path, key) {
  const r = await fetch(SUPA_REST + path, { headers: sb(key) });
  if (!r.ok) throw new Error('Supabase GET ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function supaInsert(table, row, key) {
  const r = await fetch(SUPA_REST + '/' + table, { method: 'POST', headers: sb(key, { Prefer: 'return=minimal' }), body: JSON.stringify(row) });
  if (!r.ok) throw new Error('Supabase INSERT ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

function bareDomain(s) {
  try { return new URL(/^https?:/i.test(s) ? s : 'https://' + s).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
}
function rootOf(d) { const p = d.split('.'); return p.slice(-2).join('.'); }

// True only if the address appears on the cited public page and plausibly belongs to the outlet.
async function verifyEmail(email, sourceUrl, domain) {
  if (!email || !sourceUrl) return false;
  const e = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  const ed = e.split('@')[1];
  if (FREE_MAIL.test(ed)) return false;
  if (rootOf(ed) !== rootOf(domain)) return false;
  const page = await fetchText(sourceUrl, 8000);
  if (!page.ok) return false;
  const t = page.text.toLowerCase();
  return t.indexOf(e) > -1 || t.indexOf(e.replace('@', '&#64;')) > -1 || t.indexOf(e.replace('@', '%40')) > -1;
}

const ADD_TARGET = {
  name: 'add_target',
  description: 'Queue one outlet (and its public editorial contact, if you found one) for Dennis to review. Only call this for an outlet you actually found and read via search. Max ' + MAX_PER_RUN + ' per run.',
  input_schema: {
    type: 'object',
    properties: {
      outlet: { type: 'string', description: 'Outlet name, e.g. "Voice of San Diego"' },
      url: { type: 'string', description: 'Outlet homepage, or the specific section / page that fits' },
      outlet_type: { type: 'string', enum: TYPES },
      region: { type: 'string', description: 'e.g. "San Diego", "Southern California", "National solar trade"' },
      why: { type: 'string', description: 'Why this outlet fits Solar Review — cite what you saw (a recent article on this topic, their beat, audience).' },
      angle: { type: 'string', description: 'The timely story angle to pitch them (one or two sentences). Must connect to something current.' },
      authority_note: { type: 'string', description: 'What shows real editorial standards (bylines, masthead, corrections policy, established brand). Do NOT invent traffic or ranking numbers.' },
      contact_name: { type: 'string', description: 'Reporter/editor who covers this beat, only if their name is published' },
      contact_role: { type: 'string' },
      contact_email: { type: 'string', description: 'ONLY an address printed on a public page (newsroom/tips/editorial/author page). Never guess or pattern-build an address. Omit if none.' },
      contact_source_url: { type: 'string', description: 'The exact public page where that name/email is listed' },
      contact_form_url: { type: 'string', description: 'Public tip / contact-us form, if there is no email' },
      priority: { type: 'integer', description: '1 = best fit and most credible, 5 = marginal' }
    },
    required: ['outlet', 'url', 'outlet_type', 'why', 'angle', 'priority']
  }
};
const WRITE_REPORT = {
  name: 'write_report',
  description: 'Final step: file the weekly PR summary for Dennis.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body: { type: 'string', description: 'Markdown: what you found, the top 3 outlets to pitch first and why, 3-5 timely story angles worth watching this week, and anything you could not verify.' }
    },
    required: ['title', 'body']
  }
};
const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 12 };

const SYSTEM = `You are the digital PR researcher for Solar Review (domain fixmy.energy; internal name FixMy.Energy), a San Diego solar service company.

WHAT WE DO: independent solar diagnostics, repair, monitoring and battery retrofits for homeowners — especially systems left without support when their installer closed (SunPower, Titan Solar, Sunnova and Freedom Forever are among the 24 closed installers we cover). We also sell new solar through a partner, but the editorial story is homeowner help and honest technical expertise, not sales. Service area: Southern California, led by San Diego.

PAGES WORTH A LINK (all real): /defunct-solar-installers (hub of 24 closed installers), /blog/sunpower-out-of-business, /blog/sunnova-bankruptcy, /blog/freedom-forever-bankruptcy, /blog/solaredge-inverter-error-codes, /blog/sdge-electric-rates-2026, /blog/battery-storage-sgip-rebate, /blog/sunrun-vivint-evening-bills-battery, /southern-california-solar-repair.

YOUR JOB: find REAL outlets that could plausibly publish a story, quote, or resource mention featuring our expertise — local San Diego / Southern California news and business press, home & consumer reporters, solar and clean-energy trade publications, energy-policy and consumer-protection outlets, and legitimate "source request" platforms (Qwoted, Featured, Help a B2B Writer, Connectively and similar, type source_platform). Use web_search to confirm each outlet exists, covers this beat, and recently published relevant work. Lean on what you read, not on memory.

LEGITIMACY RULES (hard):
- Editorial coverage and earned links only. NEVER propose paid placements, sponsored posts, "write for us" guest-post farms, link directories, PBNs, link exchanges, or any outlet that sells links.
- Skip outlets with no visible editorial standards (no bylines, thin or AI-spun content, mostly ads).
- Contacts: only a name/email printed on a PUBLIC page. Never guess an address or build one from a pattern (first.last@). Give the exact page URL where it is listed. If no public email exists, give the public contact/tip form URL instead. An email we cannot find on your cited page is thrown away.
- Do not invent statistics, traffic numbers, domain-authority scores, awards or relationships. If you did not see it, do not state it.
- Angles must be TIMELY and tied to a real current hook (installer bankruptcies and what homeowners should do, SDG&E rate changes, net-billing and battery economics, inverter failures, consumer-protection concerns, wildfire/outage season, new state rules). Offer expertise or a useful homeowner resource, not an ad.
- Skip anything already in the "already queued" list or marked passed/declined.
- Quality over quantity: at most ${MAX_PER_RUN} outlets this run, best first. Fewer is fine.

PROCESS: search broadly first, then queue the best with add_target (one call each), then call write_report once. Never email anyone; you only research.`;

function callClaude(messages) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 8192, system: SYSTEM, tools: [WEB_SEARCH, ADD_TARGET, WRITE_REPORT], messages: messages })
  }).then(async function (r) {
    if (!r.ok) throw new Error('Claude API error: ' + r.status + ' ' + (await r.text()).slice(0, 300));
    return r.json();
  });
}

exports.handler = async function () {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    return { statusCode: 200, body: 'Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY' };
  }
  let added = 0, reportFiled = false;
  try {
    const existing = await supaGet('/pr_targets?select=outlet,domain,contact_email,status&limit=1000', key).catch(function () { return null; });
    if (existing === null) {
      await supaInsert('agent_reports', { agent: 'pr', priority: 'urgent', title: 'PR tables are missing',
        body: 'The pr_targets table does not exist yet. Run supabase/migrations/20261122_pr_outreach.sql in the Supabase SQL editor, then run the PR research again.', action_url: null }, key).catch(function () {});
      return { statusCode: 200, body: 'pr_targets missing' };
    }
    const seen = new Set(existing.map(function (x) { return x.domain + '|' + (x.contact_email || '').toLowerCase(); }));
    const blocked = new Set(existing.filter(function (x) { return x.status === 'passed' || x.status === 'declined'; }).map(function (x) { return x.domain; }));
    const queuedList = existing.map(function (x) { return x.outlet + ' (' + x.domain + ', ' + x.status + ')'; }).join('; ') || 'none yet';
    const fb = await feedback.loadFeedback('pr', key);

    const first = fb.text + 'Today is ' + new Date().toISOString().slice(0, 10) + '. Find this week\'s best editorial opportunities.\n\nALREADY QUEUED OR HANDLED (do not repeat): ' + queuedList + '\n\nFocus first on San Diego and Southern California local/business/consumer press, then California and national solar trade publications and source-request platforms. Search, queue the best, then file the report.';
    const messages = [{ role: 'user', content: first }];

    for (let turn = 0; turn < 18; turn++) {
      const resp = await callClaude(messages);
      messages.push({ role: 'assistant', content: resp.content });
      const results = [];
      for (const b of resp.content) {
        if (b.type !== 'tool_use') continue;
        if (b.name === 'add_target') {
          results.push({ type: 'tool_result', tool_use_id: b.id, content: await addTarget(b.input || {}, key, seen, blocked, function () { return added; }, function () { added++; }) });
        } else if (b.name === 'write_report') {
          const i = b.input || {};
          await supaInsert('agent_reports', { agent: 'pr', priority: 'normal', title: String(i.title || 'Weekly PR research').slice(0, 200), body: String(i.body || ''), action_url: '/portal' }, key);
          reportFiled = true;
          results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Report filed.' });
        }
      }
      if (reportFiled) break;
      if (!results.length) { if (resp.stop_reason === 'pause_turn') continue; break; }
      messages.push({ role: 'user', content: results });
    }
    if (!reportFiled) {
      await supaInsert('agent_reports', { agent: 'pr', priority: 'normal', title: 'Weekly PR research: ' + added + ' outlet(s) queued',
        body: added + ' new outlet(s) were added to PR & Backlinks for your review. The run ended before a written summary was produced.', action_url: '/portal' }, key).catch(function () {});
    }
    return { statusCode: 200, body: 'PR research done — ' + added + ' queued' };
  } catch (e) {
    console.error('[pr-research-agent]', e.message);
    try { await supaInsert('agent_reports', { agent: 'pr', priority: 'urgent', title: 'PR Research Error — ' + e.message.slice(0, 60), body: 'Error: ' + e.message + '\n\nCheck Netlify function logs for [pr-research-agent].', action_url: null }, key); } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};

async function addTarget(i, key, seen, blocked, getAdded, bump) {
  if (getAdded() >= MAX_PER_RUN) return 'Limit reached for this run. Call write_report now.';
  const domain = bareDomain(i.url || '');
  if (!i.outlet || !domain) return 'Rejected: needs an outlet name and a valid url.';
  if (TYPES.indexOf(i.outlet_type) < 0) return 'Rejected: outlet_type must be one of ' + TYPES.join(', ');
  if (blocked.has(domain)) return 'Skipped: ' + domain + ' was already passed on or declined.';
  let email = (i.contact_email || '').trim().toLowerCase() || null;
  let verified = false;
  let note = '';
  if (email) {
    verified = await verifyEmail(email, i.contact_source_url, domain);
    if (!verified) { note = ' Contact email could not be found on the page you cited, so it was dropped (never guessed).'; email = null; }
  }
  const k = domain + '|' + (email || '');
  if (seen.has(k)) return 'Skipped: already queued (' + domain + ').';
  seen.add(k);
  await supaInsert('pr_targets', {
    outlet: String(i.outlet).slice(0, 160), domain: domain, outlet_type: i.outlet_type, region: i.region || null, url: i.url || null,
    why: i.why || null, angle: i.angle || null, authority_note: i.authority_note || null,
    contact_name: i.contact_name || null, contact_role: i.contact_role || null, contact_email: email,
    contact_source_url: i.contact_source_url || null, contact_verified: verified, contact_form_url: i.contact_form_url || null,
    priority: Math.min(5, Math.max(1, parseInt(i.priority, 10) || 3)), status: 'new', source: 'ai'
  }, key);
  bump();
  return 'Queued ' + i.outlet + (verified ? ' with a verified public contact.' : '.') + note;
}
