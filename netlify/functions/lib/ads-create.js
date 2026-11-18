// ads-create.js — builds a NEW Meta ad, always PAUSED, and queues a "launch" for Dennis to approve (2026-11-17).
// Flow: pick a video from the Meta library -> copy a winning ad set with only the place swapped -> create the creative
// (tracking tags + /book) -> create the ad paused -> queue launch. Nothing spends until the launch is approved.
// Uses META_ADS_TOKEN (read) for lists and META_ADS_EDIT_TOKEN (ads_management) for creation. Limits: lib/ads-limits.js.
const limits = require('./ads-limits');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const G = 'https://graph.facebook.com/v21.0/';
const PAGE_ID = '102222084816801', IG_ID = '17841401567772745';
const DEST = 'https://fixmy.energy/book';
const TAGS = 'utm_source=fb&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}';
// Meta cannot target a county, so a market is a centre point and a radius.
const MARKETS = {
  los_angeles: { label: 'Los Angeles area', lat: 34.0522, lng: -118.2437, mi: 25 },
  orange: { label: 'Orange County', lat: 33.7175, lng: -117.8311, mi: 18 },
  riverside: { label: 'Riverside area', lat: 33.9533, lng: -117.3962, mi: 25 },
  san_bernardino: { label: 'San Bernardino area', lat: 34.1083, lng: -117.2898, mi: 25 },
  san_diego: { label: 'San Diego County', lat: 32.9, lng: -117.0, mi: 30 },
  salt_lake: { label: 'Salt Lake area', lat: 40.7608, lng: -111.891, mi: 25 }
};
const sh = function () { const k = process.env.SUPA_SERVICE_KEY || ''; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; };
const acct = function () { return 'act_' + String(process.env.META_AD_ACCOUNT_ID || '2741612295961694').replace(/^act_/, ''); };
async function graph(path, token, method, body) {
  const u = G + path + (path.indexOf('?') > -1 ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
  const r = await fetch(u, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(function () { return {}; });
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
  return j;
}
async function readKey(key, d) { try { const r = await fetch(SUPA + '/pipeline_state?key=eq.' + key + '&select=value', { headers: sh() }); const j = await r.json(); let v = j && j[0] && j[0].value; if (typeof v === 'string') v = JSON.parse(v); return v == null ? d : v; } catch (e) { return d; } }
async function writeKey(key, value) { return (await fetch(SUPA + '/pipeline_state', { method: 'POST', headers: Object.assign({}, sh(), { Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ key: key, value: JSON.stringify(value), updated_at: new Date().toISOString() }) })).ok; }

async function library() {
  const t = process.env.META_ADS_TOKEN; if (!t) return { ok: false, reason: 'no_read_token' };
  const [vids, sets] = await Promise.all([
    graph(acct() + '/advideos?fields=id,title,length,picture&limit=50', t),
    graph(acct() + '/adsets?fields=id,name,effective_status,daily_budget,campaign_id&limit=100', t)
  ]);
  return { ok: true, markets: Object.keys(MARKETS).map(function (k) { return { key: k, label: MARKETS[k].label }; }),
    videos: (vids.data || []).map(function (v) { return { id: v.id, title: v.title || 'Video ' + v.id, length: v.length, picture: v.picture }; }),
    adsets: (sets.data || []).map(function (s) { return { id: s.id, name: s.name, status: s.effective_status, budget: (parseFloat(s.daily_budget) || 0) / 100 }; }) };
}

// Ad copy drafted by Claude under the standing script rules. Dennis edits before anything is created.
async function draftCopy(market, angle) {
  const key = process.env.ANTHROPIC_KEY; if (!key) return { ok: false, reason: 'no_anthropic_key' };
  const m = MARKETS[market] ? MARKETS[market].label : String(market || 'Southern California');
  const sys = 'You write short Meta ad copy for Solar Review, a solar repair, battery and inverter service. Audience: homeowners in ' + m + ' with a solar system whose installer closed, or an inverter that stopped working, or a high bill. Hard rules: never state a price, a savings amount, an incentive or rebate amount, a guarantee or a time limit; never claim a partnership with any manufacturer; never promise a result; do not say the company is local to ' + m + ' unless told; the only next step is booking a free evaluation (no obligation). Plain words, no hype, no emojis. Return 3 variants.';
  const body = { model: 'claude-haiku-4-5-20251001', max_tokens: 700, system: sys,
    tools: [{ name: 'ad_copy', description: 'Return ad copy variants', input_schema: { type: 'object', properties: { variants: { type: 'array', items: { type: 'object', properties: { primary: { type: 'string', description: 'Primary text, 2-3 short sentences' }, headline: { type: 'string', description: 'Under 40 characters' }, description: { type: 'string', description: 'Under 30 characters' } }, required: ['primary', 'headline', 'description'] } } }, required: ['variants'] } }],
    tool_choice: { type: 'tool', name: 'ad_copy' },
    messages: [{ role: 'user', content: 'Angle: ' + (angle || 'Is your solar installer still in business?') }] };
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(function () { return {}; });
  const tu = (j.content || []).find(function (c) { return c.type === 'tool_use'; });
  if (!r.ok || !tu) return { ok: false, reason: 'draft_failed' };
  const bad = /\$\s?\d|\d+\s?%|guarantee|free money|rebate of|save \d|#1|best in/i;
  const variants = (tu.input.variants || []).filter(function (v) { return !bad.test(v.primary + ' ' + v.headline + ' ' + v.description); }).slice(0, 3);
  return variants.length ? { ok: true, variants: variants } : { ok: false, reason: 'draft_rejected' };
}

function validateCopy(c) {
  const bad = /\$\s?\d|\d+\s?%|guarantee|#1|best in/i;
  if (!c || !c.primary || !c.headline) return 'Primary text and headline are required.';
  if (c.headline.length > 40) return 'Headline is over 40 characters.';
  if (bad.test([c.primary, c.headline, c.description || ''].join(' '))) return 'Ad copy cannot contain prices, percentages, guarantees or ranking claims.';
  return '';
}

async function create(b) {
  const rt = process.env.META_ADS_TOKEN, et = process.env.META_ADS_EDIT_TOKEN;
  if (!rt || !et) return { ok: false, reason: 'no_token' };
  const market = MARKETS[b.market]; if (!market) return { ok: false, reason: 'bad_market' };
  const err = validateCopy(b.copy); if (err) return { ok: false, reason: 'bad_copy', message: err };
  if (!/^\d+$/.test(String(b.video_id || '')) || !/^\d+$/.test(String(b.source_adset_id || ''))) return { ok: false, reason: 'bad_input' };
  const L = await limits.load(), startBudget = 10;
  // ceiling check: current active daily budgets + this new one must fit under the monthly ceiling / 30
  const sets = await graph(acct() + '/adsets?fields=daily_budget,effective_status&limit=200', rt);
  const cur = (sets.data || []).filter(function (s) { return s.effective_status === 'ACTIVE'; }).reduce(function (t, s) { return t + (parseFloat(s.daily_budget) || 0) / 100; }, 0);
  if (cur + startBudget > L.monthly_ceiling / 30 + 0.01) return { ok: false, reason: 'ceiling', message: 'Adding $' + startBudget + '/day would pass your $' + L.monthly_ceiling + '/month ceiling.' };
  const src = await graph(b.source_adset_id + '?fields=id,name,campaign_id,targeting,optimization_goal,billing_event,promoted_object,bid_strategy', rt);
  const vid = await graph(b.video_id + '?fields=picture,title', rt);
  if (!vid.picture) return { ok: false, reason: 'no_thumbnail', message: 'That video has no thumbnail yet. Try again in a few minutes.' };
  const stamp = new Date().toISOString().slice(0, 10);
  // 1) copy the ad set (paused) and swap only the place + budget
  const cp = await graph(b.source_adset_id + '/copies', et, 'POST', { campaign_id: src.campaign_id, deep_copy: false, status_option: 'PAUSED', rename_options: { rename_suffix: ' - ' + market.label + ' ' + stamp } });
  const newSetId = (cp.copied_adset_id || (cp.ad_object_ids && cp.ad_object_ids[0] && cp.ad_object_ids[0].copied_id)); if (!newSetId) return { ok: false, reason: 'copy_failed', message: 'Meta did not return the copied ad set.' };
  const tg = Object.assign({}, src.targeting || {}); delete tg.geo_locations;
  tg.geo_locations = { custom_locations: [{ latitude: market.lat, longitude: market.lng, radius: market.mi, distance_unit: 'mile' }], location_types: ['home', 'recent'] };
  await graph(newSetId, et, 'POST', { targeting: tg, daily_budget: startBudget * 100, status: 'PAUSED', name: 'Solar Review - ' + market.label + ' ' + stamp });
  // 2) creative: the library video, /book, tracking tags
  const cr = await graph(acct() + '/adcreatives', et, 'POST', { name: 'New ad ' + market.label + ' ' + stamp, url_tags: TAGS,
    object_story_spec: { page_id: PAGE_ID, instagram_actor_id: IG_ID, video_data: { video_id: b.video_id, image_url: vid.picture, message: b.copy.primary, title: b.copy.headline, link_description: b.copy.description || '', call_to_action: { type: 'LEARN_MORE', value: { link: DEST } } } } });
  // 3) the ad, paused
  const ad = await graph(acct() + '/ads', et, 'POST', { name: b.copy.headline + ' - ' + market.label + ' ' + stamp, adset_id: newSetId, creative: { creative_id: cr.id }, status: 'PAUSED' });
  // 4) queue the launch for approval
  const q = await readKey('ads_queue', []), items = Array.isArray(q) ? q : (q.items || []);
  const item = { id: 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: 'launch', target: newSetId, ad_id: ad.id, name: b.copy.headline + ' - ' + market.label, why: 'New ad in ' + market.label + ', starts at $' + startBudget + '/day, sends to /book with tracking tags. Created paused.', status: 'open', created_at: new Date().toISOString() };
  items.unshift(item); await writeKey('ads_queue', items.slice(0, 100));
  return { ok: true, queue_id: item.id, adset_id: newSetId, ad_id: ad.id };
}
module.exports = { library: library, draftCopy: draftCopy, create: create, MARKETS: MARKETS, validateCopy: validateCopy };
