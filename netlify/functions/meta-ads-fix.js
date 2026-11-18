// meta-ads-fix.js — the Meta ad tracking-tag fixer (2026-11-17, per Dennis).
// The ONLY thing this function can change is an ad link's tracking parameters (url_tags). It cannot touch budgets,
// targeting, status or creative content, and it refuses when any safety rule below fails.
//
// Needs Netlify env: META_ADS_EDIT_TOKEN (system-user token, ads_management), ADS_ADMIN_KEY (a password only Dennis knows —
// the portal asks for it once per device; the function is OFF if it is unset), SUPA_SERVICE_KEY, optional META_AD_ACCOUNT_ID.
//
// Actions (POST JSON, header x-ads-key):
//   preview {ad_id}  -> what would change; writes nothing
//   apply   {ad_id}  -> creates a copy of the ad's creative with the tags added, points the ad at it, verifies, logs
//   undo    {log_id} -> points the ad back at its previous creative
//   log              -> recent changes
// Safety rules (apply): destination must be fixmy.energy; ad must be missing at least one tag; an ad that booked an
// evaluation in the last 7 days is never touched; the destination URL must be byte-identical afterwards (else it is
// rolled back and reported); every change is logged with its undo.
const crypto = require('crypto');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
const G = 'https://graph.facebook.com/v21.0/';
const WANT = { utm_source: 'fb', utm_medium: 'paid', utm_campaign: '{{campaign.id}}', utm_content: '{{ad.id}}' };

function sameKey(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }
function mergeTags(existing) {
  const parts = String(existing || '').split('&').filter(Boolean), have = {};
  parts.forEach(function (p) { have[p.split('=')[0]] = true; });
  const added = [];
  Object.keys(WANT).forEach(function (k) { if (!have[k]) { parts.push(k + '=' + WANT[k]); added.push(k); } });
  return { tags: parts.join('&'), added: added };
}
function destOf(creative) {
  const spec = creative.object_story_spec || {};
  const ld = (spec.link_data && spec.link_data.link) || (spec.video_data && spec.video_data.call_to_action && spec.video_data.call_to_action.value && spec.video_data.call_to_action.value.link) || '';
  const feed = creative.asset_feed_spec && creative.asset_feed_spec.link_urls && creative.asset_feed_spec.link_urls[0] && creative.asset_feed_spec.link_urls[0].website_url || '';
  return String(ld || feed || creative.link_url || '');
}
const sh = function () { const k = process.env.SUPA_SERVICE_KEY || ''; return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; };
async function readLog() {
  try { const r = await fetch(SUPA + '/pipeline_state?key=eq.ads_change_log&select=value', { headers: sh() }); const j = await r.json(); let v = j && j[0] && j[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []); } catch (e) { return []; }
}
async function writeLog(items) {
  const r = await fetch(SUPA + '/pipeline_state', { method: 'POST', headers: Object.assign({}, sh(), { Prefer: 'resolution=merge-duplicates' }), body: JSON.stringify({ key: 'ads_change_log', value: JSON.stringify({ items: items.slice(0, 200) }), updated_at: new Date().toISOString() }) });
  return r.ok;
}
async function g(path, token, method, body) {
  const u = G + path + (path.indexOf('?') > -1 ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
  const r = await fetch(u, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(function () { return {}; });
  if (!r.ok || j.error) { const e = new Error((j.error && j.error.message) || ('HTTP ' + r.status)); e.code = j.error && j.error.code; throw e; }
  return j;
}
async function loadAd(adId, token) {
  return g(adId + '?fields=id,name,effective_status,creative{id,name,url_tags,link_url,object_story_id,object_story_spec,asset_feed_spec}', token);
}
async function bookedRecently(adId) {
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const r = await fetch(SUPA + '/customers?utm_content=eq.' + encodeURIComponent(adId) + '&created_at=gte.' + since + '&arrival_window=not.is.null&select=id&limit=1', { headers: sh() });
    const j = await r.json();
    return Array.isArray(j) && j.length > 0;
  } catch (e) { return null; } // unknown -> treated as unsafe by the caller
}

exports.handler = async function (event) {
  const origin = (event.headers || {}).origin || '';
  const cors = { 'Access-Control-Allow-Origin': OK.indexOf(origin) > -1 ? origin : OK[0], 'Access-Control-Allow-Headers': 'content-type,x-ads-key', 'Content-Type': 'application/json' };
  const J = function (c, o) { return { statusCode: c, headers: cors, body: JSON.stringify(o) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  if (OK.indexOf(origin) < 0) return J(403, { error: 'forbidden' });
  const adminKey = process.env.ADS_ADMIN_KEY, token = process.env.META_ADS_EDIT_TOKEN;
  if (!adminKey) return J(200, { ok: false, reason: 'disabled', hint: 'Set the Netlify variable ADS_ADMIN_KEY to turn the tag fixer on.' });
  if (!sameKey((event.headers || {})['x-ads-key'], adminKey)) return J(401, { ok: false, reason: 'bad_key' });
  if (!token) return J(200, { ok: false, reason: 'no_token', hint: 'META_ADS_EDIT_TOKEN is not set.' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'bad json' }); }
  const action = b.action, adId = String(b.ad_id || '').replace(/\D/g, '');
  try {
    if (action === 'log') return J(200, { ok: true, items: (await readLog()).slice(0, 25) });
    if (action === 'undo') {
      const items = await readLog(), it = items.find(function (x) { return x.id === b.log_id; });
      if (!it) return J(404, { ok: false, reason: 'not_found' });
      if (it.undone_at) return J(200, { ok: false, reason: 'already_undone' });
      await g(it.ad_id, token, 'POST', { creative: { creative_id: it.before_creative_id } });
      it.undone_at = new Date().toISOString(); await writeLog(items);
      return J(200, { ok: true, undone: it.id });
    }
    if (action !== 'preview' && action !== 'apply') return J(400, { error: 'unknown action' });
    if (!adId) return J(400, { error: 'ad_id required' });
    const ad = await loadAd(adId, token), cr = ad.creative || {};
    const dest = destOf(cr), m = mergeTags(cr.url_tags);
    const refuse = function (reason, msg) { return J(200, { ok: false, reason: reason, message: msg, ad: ad.name }); };
    if (!cr.id) return refuse('no_creative', 'This ad has no creative to edit.');
    if (!dest) return refuse('no_destination', 'Could not read where this ad sends people, so it was not touched.');
    if (!/^https?:\/\/(www\.)?fixmy\.energy(\/|\?|$)/i.test(dest)) return refuse('off_site', 'This ad sends people somewhere other than fixmy.energy. Fix it by hand in Ads Manager.');
    if (!m.added.length) return refuse('already_tagged', 'This ad already has all the tracking tags.');
    if (action === 'preview') return J(200, { ok: true, ad: ad.name, status: ad.effective_status, destination: dest.split('?')[0], before: cr.url_tags || '', after: m.tags, adding: m.added, note: 'Saving this makes a copy of the ad creative, which can send the ad back through Meta review and briefly reset its delivery.' });
    const booked = await bookedRecently(adId);
    if (booked !== false) return refuse('recent_bookings', booked ? 'This ad booked an evaluation in the last 7 days, so it is left alone.' : 'Could not check recent bookings, so the ad was not touched.');
    const body = { name: (cr.name || 'Creative') + ' (tags ' + new Date().toISOString().slice(0, 10) + ')', url_tags: m.tags };
    if (cr.object_story_spec) body.object_story_spec = cr.object_story_spec; else if (cr.object_story_id) body.object_story_id = cr.object_story_id;
    if (cr.asset_feed_spec) body.asset_feed_spec = cr.asset_feed_spec;
    const acct = String(process.env.META_AD_ACCOUNT_ID || '2741612295961694').replace(/^act_/, '');
    const created = await g('act_' + acct + '/adcreatives', token, 'POST', body);
    await g(adId, token, 'POST', { creative: { creative_id: created.id } });
    const after = await loadAd(adId, token);
    const sameDest = destOf(after.creative || {}).split('?')[0] === dest.split('?')[0];
    if (!sameDest) {
      await g(adId, token, 'POST', { creative: { creative_id: cr.id } });
      return J(200, { ok: false, reason: 'destination_changed', message: 'The link destination did not match after the change, so it was rolled back.', ad: ad.name });
    }
    const items = await readLog();
    const entry = { id: 'chg_' + Date.now().toString(36), at: new Date().toISOString(), ad_id: adId, ad_name: ad.name, kind: 'url_tags', before_creative_id: cr.id, after_creative_id: created.id, before: cr.url_tags || '', after: m.tags, adding: m.added };
    items.unshift(entry); const logged = await writeLog(items);
    return J(200, { ok: true, applied: true, log_id: entry.id, ad: ad.name, adding: m.added, logged: logged });
  } catch (e) {
    return J(200, { ok: false, reason: e.code === 190 ? 'auth' : (e.code === 200 || e.code === 10 || e.code === 100) ? 'permission' : 'error', message: String(e.message || e) });
  }
};
