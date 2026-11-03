// ONE-TIME storage slimmer. Shrinks oversized job photos IN PLACE (same path, so every link keeps working).
//   GET /.netlify/functions/photo-compress-background?k=<secret>&limit=3          -> real run on the first 3 (check them by eye)
//   GET /.netlify/functions/photo-compress-background?k=<secret>                  -> the rest (re-run until "remaining" is 0)
// Background function (15 min). Output goes to pipeline_state key 'photo_compress_report' (the URL itself returns 202).
// Secret: app_config.photo_compress_key (service-role only). Tiers: canceled / set-aside / archived customers get the
// harder shrink (1200px); everything else 2000px. Files under 700 KB, PDFs, HEIC and non-images are left alone.
const crypto = require('crypto');
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const BUCKET = 'job_photos';
const MIN_BYTES = 700000;
const BUDGET_MS = 12.5 * 60 * 1000;
const out = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o || {}) });
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); }
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const sharp = (deps && deps.sharp) || require('sharp');
  const SK = process.env.SUPA_SERVICE_KEY;
  if (!SK) return out(500, { error: 'not configured' });
  const H = { apikey: SK, Authorization: 'Bearer ' + SK };
  const JH = Object.assign({ 'Content-Type': 'application/json' }, H);
  const q = event.queryStringParameters || {};

  let want = '';
  try { const r = await doFetch(SUPA_URL + '/rest/v1/app_config?key=eq.photo_compress_key&select=value', { headers: H }); const j = await r.json(); want = j && j[0] && j[0].value; } catch (e) {}
  if (!want || !safeEqual(q.k, want)) return out(401, { error: 'unauthorized' });

  const started = Date.now();
  const limit = Math.max(0, parseInt(q.limit, 10) || 0);
  const rep = { started_at: new Date(started).toISOString(), checked: 0, shrunk: 0, skipped_small: 0, skipped_type: 0, skipped_no_gain: 0, failed: [], bytes_before: 0, bytes_after: 0, samples: [], done: false };
  const save = async () => { try { await doFetch(SUPA_URL + '/rest/v1/pipeline_state?on_conflict=key', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates' }, JH), body: JSON.stringify({ key: 'photo_compress_report', value: JSON.stringify(rep), updated_at: new Date().toISOString() }) }); } catch (e) {} };

  // which customers are canceled / set aside / archived -> harder shrink
  const hard = new Set();
  try {
    const r = await doFetch(SUPA_URL + '/rest/v1/customers?select=id&or=(disposition_exit.not.is.null,archived.eq.true,step.eq.7,solar_status.in.(ns_eval_canceled,ns_welcome_dead,ns_call_dead))&limit=5000', { headers: H });
    (await r.json()).forEach(c => hard.add(String(c.id)));
  } catch (e) {}

  // every photo row (paths are what storage knows)
  let rows = [];
  for (let off = 0; ; off += 1000) {
    const r = await doFetch(SUPA_URL + '/rest/v1/job_photos?select=path,customer_id,job_id&path=not.is.null&order=id.asc&limit=1000&offset=' + off, { headers: H });
    const part = await r.json();
    if (!Array.isArray(part) || !part.length) break;
    rows = rows.concat(part);
    if (part.length < 1000) break;
  }
  const seen = new Set();
  rows = rows.filter(r => r.path && !seen.has(r.path) && seen.add(r.path));

  const work = async (row) => {
    const path = row.path, isHard = hard.has(String(row.customer_id)) || hard.has(String(row.job_id));
    rep.checked++;
    if (!/\.(jpe?g|png|webp)$/i.test(path) && /\.[a-z0-9]{2,5}$/i.test(path)) { rep.skipped_type++; return null; }
    try {
      const d = await doFetch(SUPA_URL + '/storage/v1/object/' + BUCKET + '/' + encPath(path), { headers: H });
      if (!d.ok) { rep.failed.push({ path, why: 'download ' + d.status }); return null; }
      const ct = d.headers.get('content-type') || '';
      if (!/^image\/(jpeg|png|webp)/i.test(ct)) { rep.skipped_type++; return null; }
      const buf = Buffer.from(await d.arrayBuffer());
      if (buf.length < MIN_BYTES) { rep.skipped_small++; return null; }
      const max = isHard ? 1200 : 2000, qual = isHard ? 75 : 85;
      const img = await sharp(buf, { failOn: 'none' }).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: qual, mozjpeg: true }).toBuffer();
      if (img.length > buf.length * 0.9) { rep.skipped_no_gain++; return null; }
      const up = await doFetch(SUPA_URL + '/storage/v1/object/' + BUCKET + '/' + encPath(path), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': 'max-age=3600' }, H), body: img });
      if (!up.ok) { rep.failed.push({ path, why: 'upload ' + up.status }); return null; }
      rep.shrunk++; rep.bytes_before += buf.length; rep.bytes_after += img.length;
      if (rep.samples.length < 5) rep.samples.push({ path, before_kb: Math.round(buf.length / 1024), after_kb: Math.round(img.length / 1024), tier: isHard ? 'canceled' : 'normal' });
      return true;
    } catch (e) { rep.failed.push({ path, why: String(e && e.message || e).slice(0, 120) }); return null; }
  };

  // run 3 at a time; stop at the time budget or the limit
  let i = 0;
  const lanes = [0, 1, 2].map(async () => {
    while (i < rows.length && Date.now() - started < BUDGET_MS && (!limit || rep.shrunk + rep.failed.length < limit)) {
      const row = rows[i++]; await work(row);
      if (rep.checked % 20 === 0) await save();
    }
  });
  await Promise.all(lanes);
  rep.remaining = Math.max(0, rows.length - i);
  rep.done = rep.remaining === 0 && !limit;
  rep.finished_at = new Date().toISOString();
  rep.saved_mb = Math.round((rep.bytes_before - rep.bytes_after) / 1048576);
  await save();
  return out(202, { ok: true });
};
