// Instagram Insights sync — pulls follower/reach/profile stats + per-post
// performance from the Instagram Graph API into Supabase (social_metrics, social_posts).
// Powers the Team tab → Social Growth sub-tab in portal.html.
//
// Uses the "Instagram API with Instagram Login" product (graph.instagram.com).
// The token is an Instagram User access token scoped to the account directly —
// no Facebook Page hop, no /me/accounts lookup.
//
// Env vars required: IG_ACCESS_TOKEN (long-lived IG user token), SUPA_SERVICE_KEY
// Optional: IG_USER_ID (numeric IG user id — informational only; /me works from
//   the token alone, so this is not needed but is stored for reference).
//
// Setup (one-time, in Meta developer console — app stays in Development Mode,
// no App Review needed because the token owner is the app admin):
//   1. IG account = Professional (Business/Creator), added to a business portfolio
//   2. developers.facebook.com → Create App → use case
//      "Manage messaging & content on Instagram"
//   3. App Dashboard → Instagram → API setup with Instagram business login →
//      Generate token for the account you own (one click) → it's already long-lived
//      (~60 days). Ensure the token includes instagram_business_manage_insights.
//   4. Set that token as IG_ACCESS_TOKEN in Netlify.
//
// Runs daily via netlify.toml schedule + on demand from the portal's
// "Sync from Instagram" button. Safe to call with no token — returns
// { configured: false } so the portal can show setup instructions.

const GRAPH = 'https://graph.instagram.com/v21.0';
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function graphGet(path, params, token) {
  const qs = new URLSearchParams(Object.assign({}, params, { access_token: token }));
  const resp = await fetch(GRAPH + path + '?' + qs.toString());
  const data = await resp.json();
  if (!resp.ok || data.error) {
    const msg = (data.error && data.error.message) || ('HTTP ' + resp.status);
    const err = new Error(msg);
    err.graph = true;
    throw err;
  }
  return data;
}

async function supaUpsert(table, rows, onConflict, key) {
  const resp = await fetch(SUPA_REST + '/' + table + '?on_conflict=' + onConflict, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!resp.ok) throw new Error('Supabase upsert ' + table + ' failed: ' + resp.status + ' ' + await resp.text());
}

// Account-level insight totals over the trailing 7 days. Each metric is fetched
// independently because Meta rejects the whole call if any one metric is
// unsupported for the account — partial data beats no data.
async function fetchAccountInsight(metric, token) {
  const since = Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  try {
    const data = await graphGet('/me/insights',
      { metric: metric, period: 'day', metric_type: 'total_value', since: since, until: until }, token);
    const series = (data.data && data.data[0]) || {};
    if (series.total_value && typeof series.total_value.value === 'number') return series.total_value.value;
    if (Array.isArray(series.values)) {
      return series.values.reduce(function (sum, v) { return sum + (Number(v.value) || 0); }, 0);
    }
    return null;
  } catch (e) {
    console.warn('Account insight "' + metric + '" unavailable:', e.message);
    return null;
  }
}

// Per-media insights. Metric availability varies by media type and API version;
// fetch what we can, tolerate the rest. likes/comments come from the media node
// itself, so here we only chase views/reach/saved/shares.
async function fetchMediaInsights(mediaId, token) {
  const out = {};
  const attempts = [
    'views,reach,saved,shares',
    'reach,saved',
    'reach'
  ];
  for (const metrics of attempts) {
    try {
      const data = await graphGet('/' + mediaId + '/insights', { metric: metrics }, token);
      (data.data || []).forEach(function (m) {
        const v = m.values && m.values[0] && m.values[0].value;
        if (typeof v === 'number') {
          if (m.name === 'saved') out.saves = v;
          else out[m.name] = v;
        }
      });
      return out;
    } catch (e) { /* try the next, smaller metric set */ }
  }
  return out;
}

exports.handler = async function (event) {
  if (event && event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const token = process.env.IG_ACCESS_TOKEN;
  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;

  if (!token) {
    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        configured: false,
        message: 'IG_ACCESS_TOKEN not set. In your Meta app: Instagram → API setup with Instagram business login → generate a token for your account (include instagram_business_manage_insights), then add it as a Netlify env var.'
      })
    };
  }
  if (!SUPA_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };
  }

  try {
    // 1. Profile snapshot — /me resolves from the Instagram user token directly
    const profile = await graphGet('/me', { fields: 'user_id,username,followers_count,follows_count,media_count' }, token);

    // 2. Account insights (trailing 7 days) — each tolerated independently
    const [reach7d, profileViews7d, websiteClicks7d] = await Promise.all([
      fetchAccountInsight('reach', token),
      fetchAccountInsight('profile_views', token),
      fetchAccountInsight('website_clicks', token)
    ]);

    const today = new Date().toISOString().slice(0, 10);
    await supaUpsert('social_metrics', [{
      captured_on: today,
      platform: 'instagram',
      followers: profile.followers_count != null ? profile.followers_count : null,
      following: profile.follows_count != null ? profile.follows_count : null,
      media_count: profile.media_count != null ? profile.media_count : null,
      reach_7d: reach7d,
      profile_views_7d: profileViews7d,
      website_clicks_7d: websiteClicks7d,
      source: 'api'
    }], 'captured_on,platform', SUPA_SERVICE_KEY);

    // 3. Recent media + per-post insights (last 25 posts)
    const media = await graphGet('/me/media', {
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
      limit: 25
    }, token);

    const postRows = [];
    for (const m of (media.data || [])) {
      const ins = await fetchMediaInsights(m.id, token);
      postRows.push({
        platform: 'instagram',
        media_id: m.id,
        media_type: m.media_product_type || m.media_type || null,
        permalink: m.permalink || null,
        caption: m.caption ? String(m.caption).slice(0, 500) : null,
        posted_at: m.timestamp || null,
        views: ins.views != null ? ins.views : null,
        reach: ins.reach != null ? ins.reach : null,
        likes: m.like_count != null ? m.like_count : null,
        comments: m.comments_count != null ? m.comments_count : null,
        saves: ins.saves != null ? ins.saves : null,
        shares: ins.shares != null ? ins.shares : null,
        last_synced_at: new Date().toISOString()
      });
    }
    if (postRows.length) await supaUpsert('social_posts', postRows, 'media_id', SUPA_SERVICE_KEY);

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        configured: true,
        username: profile.username,
        followers: profile.followers_count,
        reach_7d: reach7d,
        profile_views_7d: profileViews7d,
        posts_synced: postRows.length
      })
    };
  } catch (e) {
    console.error('ig-insights error:', e.message);
    // Expired/invalid tokens are an expected operational state — surface an
    // actionable message rather than a bare 500 so the portal can show it.
    const tokenIssue = /token|OAuth|session|expired/i.test(e.message);
    return {
      statusCode: tokenIssue ? 200 : 500,
      headers: CORS,
      body: JSON.stringify(tokenIssue
        ? { configured: false, message: 'Instagram token rejected (likely expired — tokens last ~60 days). In your Meta app, regenerate the Instagram token and update IG_ACCESS_TOKEN. Instagram API said: ' + e.message }
        : { error: e.message })
    };
  }
};
