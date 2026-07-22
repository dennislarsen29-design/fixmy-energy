// Shared Quoya photo-categorization helpers — used by quoya-sync.js (manual,
// per-lead, synchronous) and quoya-sync-background.js (nightly full sweep).
//
// Why this exists: uploadPhotos()/handleUpload() in portal.html used to call
// Claude vision synchronously for every photo DURING upload, which made
// multi-photo uploads slow and let one flaky AI call fail the whole batch.
// Uploads now save instantly with quoya_status='pending'; this module does
// the actual categorization afterward, server-side, against the Storage URL
// already saved on the row (no re-upload of image bytes needed).
//
// Env vars: SUPA_SERVICE_KEY, ANTHROPIC_KEY.

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

const PHOTO_CATEGORIES = [
  'MSP Step Back Photo',
  'MSP Sticker Photo',
  'Panel Placard',
  'Battery Placement Wall Photo',
  'Sub Panel',
  'Sub Panel Sticker Photo',
  'Inverter Photo',
  'Solar Array',
  'Roof Photo',
  'Utility Bill',
  'Front of House',
  'Attic',
  'Additional Photos'
];

function supaHeaders(extra) {
  const key = process.env.SUPA_SERVICE_KEY;
  return Object.assign({
    apikey: key, Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json', Accept: 'application/json'
  }, extra || {});
}

async function supaGet(path) {
  const resp = await fetch(SUPA_REST + path, { headers: supaHeaders() });
  if (!resp.ok) throw new Error('Supabase GET failed: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

async function supaPatch(path, body) {
  const resp = await fetch(SUPA_REST + path, {
    method: 'PATCH', headers: supaHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Supabase PATCH failed: ' + resp.status + ' ' + await resp.text());
}

// Photos are eligible if pending (never processed) or failed with attempts < 3
// (transient errors — dead image URL, brief Anthropic hiccup — get retried a
// few times before we give up and stop spending tokens on them).
async function fetchPending(jobId, limit) {
  const base = '/job_photos?select=id,url,label,expected_label,quoya_attempts'
    + '&or=(quoya_status.eq.pending,and(quoya_status.eq.failed,quoya_attempts.lt.3))'
    + '&order=id.asc&limit=' + limit;

  if (!jobId) return supaGet(base);

  // Scoping to one lead: a photo can be filed under job_id or customer_id, and
  // PostgREST can't cleanly nest a second `or` alongside the status filter above,
  // so fetch both matches and merge — trivial cost for one lead's photo count.
  const j = encodeURIComponent(String(jobId));
  const [byJob, byCust] = await Promise.all([
    supaGet(base + '&job_id=eq.' + j),
    supaGet(base + '&customer_id=eq.' + j)
  ]);
  const seen = new Set();
  const merged = [];
  byJob.concat(byCust).forEach(function (p) {
    if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
  });
  return merged.slice(0, limit);
}

function buildPrompt(expectedLabel) {
  const base = [
    'You are Quoya, a solar field assessment AI for Solar Review in Southern California.',
    'Assess this field photo and respond with ONLY a valid JSON object — no extra text.',
    '',
    'Categories: ' + PHOTO_CATEGORIES.join(', '),
    ''
  ];
  if (expectedLabel) {
    base.push(
      'Expected category: ' + expectedLabel,
      '',
      'Respond with this exact JSON structure:',
      '{',
      '  "label": "<exact category name from list>",',
      '  "flag": "<good|needs_retake|wrong_category>",',
      '  "note": "<one sentence reason if flag is not good, else empty string>"',
      '}',
      '',
      'flag = good: photo is clear, correctly categorized, required info visible',
      'flag = needs_retake: correct subject but blurry/dark/partial/too far/info not readable',
      'flag = wrong_category: subject does not match expected category'
    );
  } else {
    base.push(
      'Respond with this exact JSON structure:',
      '{',
      '  "label": "<exact category name from list>",',
      '  "flag": "<good|needs_retake>",',
      '  "note": "<one sentence reason if needs_retake, else empty string>"',
      '}',
      '',
      'flag = good: photo is clear, subject identifiable, required info visible',
      'flag = needs_retake: blurry, too dark, too far away, partially cut off, or key info not readable'
    );
  }
  return base.join('\n');
}

async function categorizeOne(photo, anthropicKey) {
  const imgResp = await fetch(photo.url);
  if (!imgResp.ok) throw new Error('image fetch failed: HTTP ' + imgResp.status);
  const mediaType = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const buf = Buffer.from(await imgResp.arrayBuffer());
  const base64 = buf.toString('base64');

  const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: buildPrompt(photo.expected_label) }
        ]
      }]
    })
  });
  const data = await aiResp.json();
  if (!aiResp.ok) throw new Error('Anthropic API error: ' + (data.error && data.error.message || aiResp.status));

  const text = (data.content && data.content[0] && data.content[0].text) || '';
  let raw = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const brace = raw.indexOf('{');
  if (brace > 0) raw = raw.slice(brace);
  let parsed = {};
  try { parsed = JSON.parse(raw); } catch (e) { /* fall through to defaults below */ }

  const label = PHOTO_CATEGORIES.find(function (c) {
    return c.toLowerCase() === String(parsed.label || '').toLowerCase();
  }) || photo.expected_label || 'Additional Photos';
  const validFlags = photo.expected_label ? ['good', 'needs_retake', 'wrong_category'] : ['good', 'needs_retake'];
  const flag = validFlags.indexOf(parsed.flag) >= 0 ? parsed.flag : 'good';
  return { label: label, flag: flag, note: parsed.note || '' };
}

async function markDone(photo, result) {
  await supaPatch('/job_photos?id=eq.' + photo.id, {
    label: result.label,
    quality_flag: result.flag,
    quality_note: result.note,
    quoya_status: 'done',
    quoya_synced_at: new Date().toISOString()
  });
}

async function markFailed(photo) {
  const attempts = (photo.quoya_attempts || 0) + 1;
  await supaPatch('/job_photos?id=eq.' + photo.id, {
    quoya_attempts: attempts,
    quoya_status: attempts >= 3 ? 'skipped' : 'failed'
  });
}

// Runs the categorize-and-save loop over up to `limit` eligible photos.
// jobId null = sweep everything (nightly); jobId set = scope to one lead (manual button).
async function runSync({ anthropicKey, jobId, limit, delayMs }) {
  const photos = await fetchPending(jobId, limit);
  const results = [];
  for (let i = 0; i < photos.length; i++) {
    if (i > 0 && delayMs) await new Promise(function (r) { setTimeout(r, delayMs); });
    const p = photos[i];
    try {
      const result = await categorizeOne(p, anthropicKey);
      await markDone(p, result);
      results.push({ id: p.id, ok: true, label: result.label, flag: result.flag });
    } catch (e) {
      await markFailed(p);
      results.push({ id: p.id, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = { runSync, PHOTO_CATEGORIES };
