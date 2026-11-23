// Content engine — publisher (2026-11-23, per Dennis). Scheduled every 30 min.
// Publishes content_posts rows that Dennis APPROVED and whose scheduled_for has passed. Never touches a draft.
//   blog  -> one commit to main (new page + blog.html card + sitemap + netlify.toml rewrite + llms.txt)
//   short -> GHL Social Planner, one post per channel with that channel's own text; Nextdoor = "copy ready"
//            (no posting API) and its text is emailed to Dennis.
// Per-channel results land in content_posts.results; status = published | partial | failed.
// A claim (status approved -> publishing) prevents two runs posting the same item twice.
// Env: SUPA_SERVICE_KEY, GITHUB_TOKEN (blog), GHL_API_KEY (social), RESEND_API_KEY (Nextdoor email).
const C = require('./lib/content');

async function emailNextdoor(row) {
  if (!process.env.RESEND_API_KEY) return 'no email key';
  const to = process.env.AGENT_REPORT_EMAIL || 'dennislarsen29@gmail.com';
  const text = String((row.channels || {}).nextdoor || '');
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px;"><p style="color:#555;">Paste this into Nextdoor (Business page → Post). ' + (row.image_url ? 'Photo: <a href="' + C.esc(row.image_url) + '">download</a>' : '') + '</p><div style="white-space:pre-wrap;border:1px solid #ddd;border-radius:10px;padding:14px;">' + C.esc(text) + '</div></div>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Solar Review <info@fixmy.energy>', to: [to], subject: 'Nextdoor post ready: ' + (row.title || row.topic || ''), html })
  });
  return r.ok ? 'emailed' : 'email HTTP ' + r.status;
}

async function publishOne(row, key) {
  const results = Object.assign({}, row.results || {});
  const now = new Date().toISOString();
  const set = (ch, status, detail) => { results[ch] = { status, detail: String(detail || '').slice(0, 300), at: now }; };
  if (row.kind === 'blog') {
    try {
      const ch = row.channels || {};
      const out = await C.publishBlog({ title: row.title, slug: row.slug, meta_description: row.meta_description, body: row.body, faq: row.faq, eyebrow: ch.eyebrow, lede: ch.lede, related: ch.related, image_url: row.image_url, approved_by: row.approved_by });
      set('blog', 'published', out.url + ' · commit ' + out.sha.slice(0, 7));
    } catch (e) { set('blog', 'failed', e.message); }
  } else {
    const cfg = (await C.stateGet('content_channels', key)) || {};
    const pick = cfg.accounts || {};
    for (const ch of ['gbp', 'facebook', 'instagram']) {
      if (results[ch] && results[ch].status === 'published') continue;           // a retry never double-posts a channel
      const text = String((row.channels || {})[ch] || '').trim();
      const ids = (pick[ch] || []).filter(Boolean);
      if (!text) { set(ch, 'skipped', 'no text'); continue; }
      if (!ids.length) { set(ch, 'skipped', 'no ' + ch + ' account picked in Agents → Content → Channels'); continue; }
      if (ch === 'instagram' && !row.image_url) { set(ch, 'skipped', 'Instagram needs a photo'); continue; }
      if (!process.env.GHL_API_KEY) { set(ch, 'failed', 'GHL_API_KEY not set'); continue; }
      try { await C.ghlPost(ids, text, row.image_url, cfg.userId || process.env.GHL_GBP_USER_ID); set(ch, 'published', 'via GHL Social Planner'); }
      catch (e) { set(ch, 'failed', e.message); }
    }
    if (!(results.nextdoor && results.nextdoor.status === 'copy_ready') && String((row.channels || {}).nextdoor || '').trim()) {
      let mail = ''; try { mail = await emailNextdoor(row); } catch (e) { mail = e.message; }
      set('nextdoor', 'copy_ready', 'paste it into Nextdoor (' + mail + ')');
    }
  }
  const st = Object.keys(results).map(k => results[k].status);
  const ok = st.filter(s => s === 'published' || s === 'copy_ready').length;
  const bad = st.filter(s => s === 'failed').length;
  const status = !ok ? 'failed' : (bad ? 'partial' : 'published');
  const err = Object.keys(results).filter(k => results[k].status === 'failed').map(k => k + ': ' + results[k].detail).join(' | ') || null;
  const upd = await C.sbPatch('/content_posts?id=eq.' + row.id, { results, status, error: err, published_at: ok ? now : null, updated_at: now }, key);
  return upd[0] || Object.assign({}, row, { results, status, error: err });
}

// Claim, then publish. Returns the updated row, or null if someone else already claimed it.
async function claimAndPublish(id, key, ignoreSchedule) {
  const cond = '/content_posts?id=eq.' + id + '&status=in.(approved,partial,failed)' + (ignoreSchedule ? '' : '&scheduled_for=lte.' + encodeURIComponent(new Date().toISOString()));
  const claimed = await C.sbPatch(cond, { status: 'publishing', updated_at: new Date().toISOString() }, key);
  if (!claimed.length) return null;
  try { return await publishOne(claimed[0], key); }
  catch (e) { await C.sbPatch('/content_posts?id=eq.' + id, { status: 'failed', error: e.message.slice(0, 300) }, key).catch(() => {}); throw e; }
}

exports.publishOne = publishOne;
exports.claimAndPublish = claimAndPublish;
exports.handler = async function () {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!key) return { statusCode: 200, body: 'no key' };
  try {
    // A row stuck in 'publishing' for 20+ min (killed run) goes back to approved so it retries.
    const stale = new Date(Date.now() - 20 * 60000).toISOString();
    await C.sbPatch('/content_posts?status=eq.publishing&updated_at=lt.' + encodeURIComponent(stale), { status: 'approved' }, key).catch(() => {});
    const due = await C.sbGet('/content_posts?status=eq.approved&scheduled_for=lte.' + encodeURIComponent(new Date().toISOString()) + '&order=scheduled_for.asc&limit=5&select=id', key);
    const done = [];
    for (const d of due) { try { const r = await claimAndPublish(d.id, key, false); if (r) done.push(r.id + ':' + r.status); } catch (e) { done.push(d.id + ':error ' + e.message); } }
    return { statusCode: 200, body: 'published ' + done.length + (done.length ? ' — ' + done.join(', ') : '') };
  } catch (e) {
    console.error('[content-publish]', e.message);
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
