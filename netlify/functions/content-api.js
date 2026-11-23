// Content engine — portal API (Agents -> Content). Origin-allowlisted like the other internal functions.
// actions: list | update | approve | unapprove | reject | publish_now | accounts | save_accounts | nextdoor_done
const C = require('./lib/content');
const P = require('./content-publish');
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
const EDITABLE = ['draft', 'approved', 'partial', 'failed'];

exports.handler = async function (event) {
  const origin = (event.headers || {}).origin || '';
  const cors = { 'Access-Control-Allow-Origin': OK.indexOf(origin) > -1 ? origin : OK[0], 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const J = (c, o) => ({ statusCode: c, headers: cors, body: JSON.stringify(o) });
  if (OK.indexOf(origin) < 0 && !/\.netlify\.app$/.test(origin.replace(/^https?:\/\//, ''))) return J(403, { error: 'forbidden' });
  const key = process.env.SUPA_SERVICE_KEY; if (!key) return J(500, { error: 'no_key' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'bad_json' }); }
  const id = String(b.id || '').replace(/[^0-9a-f-]/gi, '');
  const one = async () => (await C.sbGet('/content_posts?id=eq.' + id + '&limit=1', key))[0];
  try {
    if (b.action === 'list') {
      const since = new Date(Date.now() - 45 * 86400000).toISOString();
      const rows = await C.sbGet('/content_posts?or=(created_at.gte.' + since + ',status.in.(draft,approved,publishing))&order=scheduled_for.asc&limit=120', key);
      const cfg = (await C.stateGet('content_channels', key)) || {};
      return J(200, { ok: true, rows, channels: cfg, setup: { github: !!process.env.GITHUB_TOKEN, ghl: !!process.env.GHL_API_KEY, email: !!process.env.RESEND_API_KEY } });
    }

    if (b.action === 'update') {
      const r = await one(); if (!r) return J(404, { error: 'not_found' });
      if (EDITABLE.indexOf(r.status) < 0) return J(409, { error: 'locked', status: r.status });
      const f = b.fields || {}, u = { updated_at: new Date().toISOString() };
      ['title', 'meta_description', 'topic'].forEach(k => { if (f[k] !== undefined) u[k] = String(f[k]).slice(0, 300); });
      if (f.body !== undefined) u.body = r.kind === 'blog' ? C.sanitizeArticle(f.body) : String(f.body).slice(0, 5000);
      if (f.slug !== undefined) { const s = C.slugify(f.slug); if (!s) return J(400, { error: 'bad_slug' }); u.slug = s; }
      if (f.channels !== undefined && typeof f.channels === 'object') {
        const ch = Object.assign({}, r.channels || {});
        Object.keys(f.channels).forEach(k => { if (['gbp', 'facebook', 'instagram', 'nextdoor', 'eyebrow', 'lede'].indexOf(k) > -1) ch[k] = String(f.channels[k] || '').slice(0, 3000); });
        u.channels = ch;
      }
      if (f.image_url !== undefined) {
        const url = String(f.image_url || '').trim();
        if (url && !/^https:\/\/[^\s"'<>]+$/i.test(url)) return J(400, { error: 'bad_image_url' });
        u.image_url = url || null; u.image_source = url ? String(f.image_source || 'custom').slice(0, 20) : null;
      }
      if (f.scheduled_for !== undefined) { const d = new Date(f.scheduled_for); if (isNaN(d)) return J(400, { error: 'bad_date' }); u.scheduled_for = d.toISOString(); }
      const upd = await C.sbPatch('/content_posts?id=eq.' + id + '&status=in.(' + EDITABLE.join(',') + ')', u, key);
      return J(200, { ok: true, row: upd[0] });
    }

    if (b.action === 'approve' || b.action === 'publish_now') {
      const r = await one(); if (!r) return J(404, { error: 'not_found' });
      if (EDITABLE.indexOf(r.status) < 0) return J(409, { error: 'locked', status: r.status });
      if (r.kind === 'blog' && !process.env.GITHUB_TOKEN) return J(400, { error: 'GITHUB_TOKEN is not set in Netlify, so the blog cannot be published.' });
      const by = String(b.by || 'admin').slice(0, 60);
      const u = { status: 'approved', updated_at: new Date().toISOString() };
      if (r.status === 'draft') { u.approved_at = new Date().toISOString(); u.approved_by = by; }
      await C.sbPatch('/content_posts?id=eq.' + id + '&status=in.(' + EDITABLE.join(',') + ')', u, key);
      if (b.action === 'publish_now') {
        const out = await P.claimAndPublish(id, key, true);
        return J(200, { ok: true, row: out || await one() });
      }
      return J(200, { ok: true, row: await one() });
    }

    if (b.action === 'unapprove' || b.action === 'reject') {
      const st = b.action === 'reject' ? 'rejected' : 'draft';
      const upd = await C.sbPatch('/content_posts?id=eq.' + id + '&status=in.(draft,approved,failed)', { status: st, updated_at: new Date().toISOString() }, key);
      if (!upd.length) return J(409, { error: 'locked' });
      return J(200, { ok: true, row: upd[0] });
    }

    if (b.action === 'nextdoor_done') {
      const r = await one(); if (!r) return J(404, { error: 'not_found' });
      const res = Object.assign({}, r.results || {}); res.nextdoor = { status: 'published', detail: 'posted by hand', at: new Date().toISOString() };
      const upd = await C.sbPatch('/content_posts?id=eq.' + id, { results: res }, key);
      return J(200, { ok: true, row: upd[0] });
    }

    if (b.action === 'accounts') {
      let accounts = [], err = '';
      try { accounts = await C.ghlAccounts(); } catch (e) { err = e.message; }
      return J(200, { ok: true, accounts, error: err, saved: (await C.stateGet('content_channels', key)) || {} });
    }

    if (b.action === 'save_accounts') {
      const a = b.accounts || {}, clean = {};
      ['gbp', 'facebook', 'instagram'].forEach(k => { clean[k] = (Array.isArray(a[k]) ? a[k] : []).map(x => String(x).replace(/[^\w-]/g, '')).filter(Boolean).slice(0, 5); });
      const cfg = { accounts: clean, userId: String(b.userId || '').replace(/[^\w-]/g, '') || null, saved_at: new Date().toISOString() };
      if (!(await C.stateSet('content_channels', cfg, key))) return J(500, { error: 'save_failed' });
      return J(200, { ok: true, saved: cfg });
    }

    return J(400, { error: 'unknown_action' });
  } catch (e) {
    const setup = /content_posts|relation|schema cache/i.test(e.message || '');
    return J(setup ? 503 : 500, { error: setup ? 'setup' : e.message });
  }
};
