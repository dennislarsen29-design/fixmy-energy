// Instagram Insights sync — pulls follower/reach/profile stats + per-post
// performance from the Meta Graph API into Supabase (social_metrics, social_posts).
// Powers the Team tab → Social Growth sub-tab in portal.html.
//
// Env vars required: IG_ACCESS_TOKEN (long-lived user token), SUPA_SERVICE_KEY
// Optional: IG_USER_ID (Instagram Business account ID — auto-discovered via
// /me/accounts if not set, but setting it saves one API call and avoids
// ambiguity if the token can see multiple Pages).
//
// Setup (one-time, in Meta developer console — app stays in Development Mode,
// no App Review needed because the token owner is the app admin):
//   1. IG account must be Professional (Business/Creator) linked to a FB Page
//   2. developers.facebook.com → Create App (Business type)
//   3. Graph API Explorer → token with: instagram_basic,
//      instagram_manage_insights, pages_show_list, pages_read_engagement
//   4. Exchange for a long-lived token (~60 days), set as IG_ACCESS_TOKEN
//
// Runs daily via netlify.toml schedule + on demand from the portal's
// "Sync from Instagram" button. Safe to call with no token — returns
// { configured: false } so the portal can show setup instructions.

const GRAPH = 'https://graph.facebook.com/v21.0';
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
async function fetchAccountInsight(igId, metric, extraParams, token) {
  const since = Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  try {
    const data = await graphGet('/' + igId + '/insights',
      Object.assign({ metric: metric, period: 'day', since: since, until: until }, extraParams || {}), token);
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
// fetch what we can, tolerate the rest.
async function fetchMediaInsights(mediaId, token) {
  const out = {};
  const attempts = [
    ['views,reach,saved,shares'],
    ['reach,saved'],
    ['reach']
  ];
  for (const [metrics] of attempts) {
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
        message: 'IG_ACCESS_TOKEN not set. Create a Meta developer app (Development Mode is fine), generate a long-lived token with instagram_basic + instagram_manage_insights + pages_show_list + pages_read_engagement, and add it as a Netlify env var.'
      })
    };
  }
  if (!SUPA_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };
  }

  try {
    // 1. Resolve the Instagram Business account ID
    let igId = process.env.IG_USER_ID;
    if (!igId) {
      const pages = await graphGet('/me/accounts', { fields: 'name,instagram_business_account' }, token);
      const page = (pages.data || []).find(function (p) { return p.instagram_business_account; });
      if (!page) {
        return {
          statusCode: 200, headers: CORS,
          body: JSON.stringify({ configured: false, message: 'Token is valid but no Facebook Page with a linked Instagram Business account was found. Link your IG account to a FB Page first.' })
        };
      }
      igId = page.instagram_business_account.id;
    }

    // 2. Profile snapshot
    const profile = await graphGet('/' + igId, { fields: 'username,followers_count,follows_count,media_count' }, token);

    // 3. Account insights (trailing 7 days) — each tolerated independently
    const [reach7d, profileViews7d, websiteClicks7d] = await Promise.all([
      fetchAccountInsight(igId, 'reach', null, token),
      fetchAccountInsight(igId, 'profile_views', { metric_type: 'total_value' }, token),
      fetchAccountInsight(igId, 'website_clicks', { metric_type: 'total_value' }, token)
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

    // 4. Recent media + per-post insights (last 25 posts)
    const media = await graphGet('/' + igId + '/media', {
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
    // Expired/invalid tokens are an expected operational state — surface a
    // actionable message rather than a bare 500 so the portal can show it.
    const tokenIssue = /token|OAuth|session/i.test(e.message);
    return {
      statusCode: tokenIssue ? 200 : 500,
      headers: CORS,
      body: JSON.stringify(tokenIssue
        ? { configured: false, message: 'Instagram token rejected (likely expired — long-lived tokens last ~60 days). Regenerate and update IG_ACCESS_TOKEN. Graph API said: ' + e.message }
        : { error: e.message })
    };
  }
};
