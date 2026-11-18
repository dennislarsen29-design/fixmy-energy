// Per-ad results from Meta's Marketing API (2026-11-05, per Dennis): spend, clicks and website "Schedule"
// events for every ad in the last 30 days, so S.U.N. can show cost per booking and which creative performs.
// Needs Netlify env META_ADS_TOKEN (System User token with ads_read on the ad account). Optional META_AD_ACCOUNT_ID
// (defaults to the Solar Review ad account). Read-only; origin-allowlisted like the other internal functions.
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
exports.handler = async function (event) {
  const origin = (event.headers || {}).origin || '';
  const cors = { 'Access-Control-Allow-Origin': OK.indexOf(origin) > -1 ? origin : OK[0], 'Content-Type': 'application/json' };
  const J = (c, o) => ({ statusCode: c, headers: cors, body: JSON.stringify(o) });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (OK.indexOf(origin) < 0 && !/\.netlify\.app$/.test(origin.replace(/^https?:\/\//, ''))) return J(403, { error: 'forbidden' });
  const token = process.env.META_ADS_TOKEN;
  if (!token) return J(200, { ok: false, reason: 'not_configured' });
  const acct = String(process.env.META_AD_ACCOUNT_ID || '2741612295961694').replace(/^act_/, '');
  const q = (event.queryStringParameters || {});
  const preset = /^(last_7d|last_14d|last_30d|this_month)$/.test(q.range || '') ? q.range : 'last_30d';
  const url = 'https://graph.facebook.com/v21.0/act_' + acct + '/insights?level=ad&date_preset=' + preset +
    '&fields=ad_id,ad_name,campaign_name,spend,impressions,clicks,actions&limit=200&access_token=' + encodeURIComponent(token);
  try {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const code = j.error && j.error.code;
      return J(200, { ok: false, reason: (code === 190 || r.status === 401) ? 'auth' : (code === 10 || code === 200 || r.status === 403) ? 'permission' : 'upstream', detail: (j.error && j.error.message) || ('HTTP ' + r.status) });
    }
    const rows = (j.data || []).map(function (x) {
      // Website "Schedule" conversions arrive under several action_type names depending on how the event is reported
      const sch = (x.actions || []).filter(function (a) { return /schedule/i.test(a.action_type); })
        .reduce(function (m, a) { return Math.max(m, parseFloat(a.value) || 0); }, 0);
      return { ad_id: x.ad_id, ad_name: x.ad_name, campaign: x.campaign_name, spend: parseFloat(x.spend) || 0,
        impressions: parseInt(x.impressions, 10) || 0, clicks: parseInt(x.clicks, 10) || 0, schedules: sch };
    });
    // Tracking audit (read-only): does each ad's link carry the tags that tie a booking back to the ad?
    // Needs only ads_read. A failure here never hides the spend table.
    let audit = {};
    try {
      const au = 'https://graph.facebook.com/v21.0/act_' + acct + '/ads?fields=id,effective_status,creative{url_tags,link_url,object_story_spec,asset_feed_spec}&limit=200&access_token=' + encodeURIComponent(token);
      const ar = await fetch(au); const aj = await ar.json().catch(() => ({}));
      (aj.data || []).forEach(function (ad) {
        const c = ad.creative || {};
        const spec = c.object_story_spec || {};
        const ld = (spec.link_data && spec.link_data.link) || (spec.video_data && spec.video_data.call_to_action && spec.video_data.call_to_action.value && spec.video_data.call_to_action.value.link) || c.link_url || '';
        const feed = c.asset_feed_spec && c.asset_feed_spec.link_urls && c.asset_feed_spec.link_urls[0] && c.asset_feed_spec.link_urls[0].website_url || '';
        const dest = ld || feed || '';
        const tags = String(c.url_tags || '') + '&' + (dest.indexOf('?') > -1 ? dest.split('?')[1] : '');
        const has = function (k) { return new RegExp('(^|&)' + k + '=').test(tags); };
        audit[ad.id] = { status: ad.effective_status, dest: dest.split('?')[0], has_source: has('utm_source'), has_campaign: has('utm_campaign'), has_content: has('utm_content'), off_site: !!dest && !/^https?:\/\/(www\.)?fixmy\.energy/i.test(dest) };
      });
    } catch (e) { audit = {}; }
    rows.forEach(function (r) { r.audit = audit[r.ad_id] || null; });
    return J(200, { ok: true, range: preset, rows: rows, truncated: !!(j.paging && j.paging.next) });
  } catch (e) { return J(200, { ok: false, reason: 'network', detail: String(e.message || e) }); }
};
