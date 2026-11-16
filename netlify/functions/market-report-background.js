// Market opportunity report — free replacement for paid keyword/competitor tools.
// POST/GET /.netlify/functions/market-report-background?city=Austin&state=TX[&service=solar%20repair]
// Optional: POST body {keywordCsv:"..."} = a Google Keyword Planner export pasted in (free in Google Ads).
// Uses Claude + web_search to read who ranks, what their pages contain, local demand signals and
// competitors, then files the result in agent_reports (agent='seo') so it shows in the Agent Inbox + S.U.N.
// Background function (15-min budget). Env: ANTHROPIC_KEY, SUPA_SERVICE_KEY.
const SUPA_REST = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const ORIGINS = ['https://fixmy.energy', 'https://www.fixmy.energy'];

async function supa(path, opts) {
  const k = process.env.SUPA_SERVICE_KEY;
  const r = await fetch(SUPA_REST + path, Object.assign({}, opts, { headers: Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, (opts || {}).headers) }));
  if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r;
}

const SYSTEM = `You are the market analyst for Solar Review, a San Diego based company that does solar diagnostics, repair, battery retrofits and (via a partner) new solar. You are judging whether to build local web pages and ads for ONE city.
Use web_search to gather REAL evidence. Never invent search volumes, rankings or competitor facts. If you cannot find something, say "not found".
Research, in this order:
1. Who ranks now for searches like "solar repair <city>", "solar panels not working <city>", "solar installer went out of business <city>", "add battery to solar <city>": list the top organic competitors, what type each is (installer, repair specialist, directory, utility), and what their page covers.
2. Local conditions that change the pitch: the electric utility and its net metering / export credit rules, any local battery or storage incentives, and common local solar failure causes (heat, hail, wildfire smoke, snow, etc.). Only state rules you found a source for; give the source.
3. Defunct or struggling solar installers that sold in this area (orphaned systems = our best lead source).
4. Demand signals: population/home count, solar adoption level, anything showing search demand. If keyword data was supplied, use it and say what it shows.
Then write the report with exactly these sections:
VERDICT (one of: Build now / Build small test / Wait) with a 2-sentence reason.
WHAT RANKS TODAY (table: competitor, type, strength, weakness).
OUR ANGLE (3 bullets: what we can say that they do not).
PAGES TO BUILD (list with proposed title tag under 60 characters, H1, and 4 FAQ questions per page).
LOCAL FACTS TO CITE (each with its source URL).
GAPS (what you could not verify, so a person must check it).
Be plain and specific. No guarantees, no invented prices.`;

exports.handler = async function (event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (origin && ORIGINS.indexOf(origin) < 0) return { statusCode: 403, body: 'forbidden' };
  const q = event.queryStringParameters || {};
  let body = {}; try { body = event.body ? JSON.parse(event.body) : {}; } catch (e) {}
  const city = String(q.city || body.city || '').trim().slice(0, 60);
  const state = String(q.state || body.state || '').trim().toUpperCase().slice(0, 2);
  const service = String(q.service || body.service || 'solar repair and battery retrofit').trim().slice(0, 80);
  const csv = String(body.keywordCsv || '').slice(0, 20000);
  if (!city || !/^[A-Z]{2}$/.test(state)) return { statusCode: 400, body: 'city and 2-letter state required' };
  if (!process.env.ANTHROPIC_KEY || !process.env.SUPA_SERVICE_KEY) return { statusCode: 500, body: 'missing env' };
  try {
    // Our own Search Console history for this place, if any (new markets will be empty — that itself is a finding).
    let own = 'No Search Console rows mention this city yet.';
    try {
      const r = await (await supa('/seo_queries?key=ilike.*' + encodeURIComponent(city) + '*&select=key,clicks,impressions,position&order=impressions.desc&limit=15')).json();
      if (r.length) own = 'Our Search Console queries mentioning ' + city + ':\n' + r.map(x => `${x.key} — ${x.impressions} impr, ${x.clicks} clicks, pos ${Number(x.position).toFixed(1)}`).join('\n');
    } catch (e) {}
    const user = `City: ${city}, ${state}\nService focus: ${service}\n\n${own}\n\n` + (csv ? 'Keyword Planner export supplied by the owner:\n' + csv : 'No keyword export supplied.');
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 6000, system: SYSTEM, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 }], messages: [{ role: 'user', content: user }] })
    });
    if (!resp.ok) throw new Error('Claude ' + resp.status + ' ' + (await resp.text()).slice(0, 300));
    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) throw new Error('Empty report');
    await supa('/agent_reports', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ agent: 'seo', priority: 'normal', title: `Market report: ${city}, ${state}`, body: text, action_url: null }) });
    return { statusCode: 200, body: 'report filed' };
  } catch (e) {
    try { await supa('/agent_reports', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ agent: 'seo', priority: 'normal', title: `Market report failed: ${city}, ${state}`, body: String(e.message).slice(0, 500) }) }); } catch (e2) {}
    return { statusCode: 200, body: 'error: ' + e.message };
  }
};
