// Google Business Profile post agent — scheduled twice a week (see netlify.toml).
// Writes ONE local-SEO post per run. Always files the finished text in agent_reports
// (agent 'gbp', so the daily digest email carries it). If GHL Social Planner has the Business
// Profile connected, set GHL_GBP_ACCOUNT_ID (+ GHL_GBP_USER_ID) and it also publishes it.
// Never invents statistics, reviews, prices or incentive amounts.
const SUPA_REST = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const GHL_BASE = 'https://services.leadconnectorhq.com';

const TOPICS = [
  'What a free solar evaluation includes and how long it takes (about an hour, homeowner present)',
  'Why a solar system with high evening bills may benefit from a battery (4-9 pm peak rates, solar peaks at noon)',
  'Signs your solar inverter may need attention (error lights, zero production, app showing offline)',
  'What to do if your original solar installer went out of business and nobody services your system',
  'How a battery gives backup power during a San Diego County outage and why solar alone shuts off',
  'Why solar production dips and what a diagnostic checks (inverter, optimizers, wiring, shading)',
  'How San Diego Community Power customers may qualify for battery programs (say "may qualify", never amounts)',
  'A quick monitoring tip: how to check your system is producing every week in the Enphase or SolarEdge app',
  'Seasonal tip for Southern California homeowners with solar (heat, marine layer, fire season outages)',
  'Meet the team: local techs who diagnose and repair any brand of solar system'
];

async function supaInsert(row) {
  const k = process.env.SUPA_SERVICE_KEY;
  const r = await fetch(SUPA_REST + '/agent_reports', {
    method: 'POST',
    headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  });
  if (!r.ok) throw new Error('agent_reports insert ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

async function recentTitles() {
  const k = process.env.SUPA_SERVICE_KEY;
  try {
    const r = await fetch(SUPA_REST + '/agent_reports?agent=eq.gbp&select=title&order=created_at.desc&limit=8', { headers: { apikey: k, Authorization: 'Bearer ' + k } });
    return r.ok ? (await r.json()).map(x => x.title) : [];
  } catch (e) { return []; }
}

async function generate(topic, today) {
  const system = 'You write Google Business Profile posts for Solar Review, a local San Diego County solar diagnostics, repair and battery company. Plain, friendly, specific. 700-1200 characters, no hashtags, no emojis except at most one. Never state prices, savings figures, incentive dollar amounts, review counts or guarantees. Say incentives "may" apply. Do not claim affiliation with any manufacturer or installer. End with a one-line call to action to book a free evaluation or call (619) 777-6527. Return only the post text.';
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 900, system, messages: [{ role: 'user', content: 'Today is ' + today + '. Topic: ' + topic }] })
  });
  if (!resp.ok) throw new Error('Claude ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
  const j = await resp.json();
  return ((j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')).trim();
}

async function publishViaGhl(text) {
  const acct = process.env.GHL_GBP_ACCOUNT_ID, loc = process.env.GHL_LOCATION_ID || 'gXWwbOVymY0iRfj7c1It';
  if (!acct || !process.env.GHL_API_KEY) return 'not published (set GHL_GBP_ACCOUNT_ID to auto-post)';
  try {
    const body = { accountIds: [acct], summary: text, type: 'post', status: 'published' };
    if (process.env.GHL_GBP_USER_ID) body.userId = process.env.GHL_GBP_USER_ID;
    const r = await fetch(GHL_BASE + '/social-media-posting/' + loc + '/posts', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.GHL_API_KEY, Version: '2021-07-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const t = await r.text();
    return r.ok ? 'published via GHL Social Planner' : 'GHL publish failed HTTP ' + r.status + ': ' + t.slice(0, 200);
  } catch (e) { return 'GHL publish error: ' + e.message; }
}

exports.handler = async function () {
  if (!process.env.ANTHROPIC_KEY || !process.env.SUPA_SERVICE_KEY) {
    console.error('[gbp-post-agent] missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing env' };
  }
  try {
    const now = new Date();
    const today = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const used = await recentTitles();
    // Rotate by day-of-year so consecutive runs differ; skip a topic used in the last 8 posts.
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    let topic = TOPICS[doy % TOPICS.length];
    for (let i = 0; i < TOPICS.length; i++) {
      const cand = TOPICS[(doy + i) % TOPICS.length];
      if (!used.some(u => u && u.indexOf(cand.slice(0, 30)) > -1)) { topic = cand; break; }
    }
    const text = await generate(topic, today);
    if (!text || text.length < 200) throw new Error('post text too short');
    const status = await publishViaGhl(text);
    await supaInsert({
      agent: 'gbp', priority: 'normal',
      title: 'Google Business post — ' + topic.slice(0, 60),
      body: text + '\n\n—\nStatus: ' + status + '\nLink to use: https://fixmy.energy/?utm_source=gbp&utm_medium=organic\nPhoto: a real job-site or inverter photo (not a stock image).',
      action_url: 'https://business.google.com/'
    });
    return { statusCode: 200, body: 'ok: ' + status };
  } catch (e) {
    console.error('[gbp-post-agent]', e.message);
    try { await supaInsert({ agent: 'gbp', priority: 'urgent', title: 'GBP post agent error — ' + e.message.slice(0, 60), body: 'Error: ' + e.message, action_url: null }); } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
