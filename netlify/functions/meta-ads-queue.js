// meta-ads-queue.js — API for the ad approval queue (S.U.N. Meta panel). Same password rule as the tag fixer (ADS_ADMIN_KEY).
const crypto = require('crypto');
const q = require('./lib/ads-queue');
const create = require('./lib/ads-create');
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
const sameKey = function (a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };
exports.handler = async function (event) {
  const origin = (event.headers || {}).origin || '';
  const cors = { 'Access-Control-Allow-Origin': OK.indexOf(origin) > -1 ? origin : OK[0], 'Access-Control-Allow-Headers': 'content-type,x-ads-key', 'Content-Type': 'application/json' };
  const J = function (c, o) { return { statusCode: c, headers: cors, body: JSON.stringify(o) }; };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });
  if (OK.indexOf(origin) < 0) return J(403, { error: 'forbidden' });
  if (!process.env.ADS_ADMIN_KEY) return J(200, { ok: false, reason: 'disabled' });
  if (!sameKey((event.headers || {})['x-ads-key'], process.env.ADS_ADMIN_KEY)) return J(401, { ok: false, reason: 'bad_key' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'bad json' }); }
  try {
    if (b.action === 'library') return J(200, await create.library());
    if (b.action === 'draft_copy') return J(200, await create.draftCopy(String(b.market || ''), String(b.angle || '')));
    if (b.action === 'create') return J(200, await create.create(b));
    if (b.action === 'list') return J(200, await q.list());
    if (b.action === 'scan') { const s = await q.scan(); return J(200, Object.assign({}, s, s.ok ? await q.list() : {})); }
    if (b.action === 'approve') return J(200, await q.execute(String(b.id || '')));
    if (b.action === 'dismiss') return J(200, await q.dismiss(String(b.id || '')));
    if (b.action === 'undo') return J(200, await q.undo(String(b.log_id || '')));
    return J(400, { error: 'unknown action' });
  } catch (e) { return J(200, { ok: false, reason: 'error', message: String(e.message || e) }); }
};
