// eval-analysis-background.js — Quoya's read on a guided Solar Evaluation.
//
// Background function (Netlify allows up to 15 min) replacing the old synchronous
// eval-analysis.js, retired 2026-08-19. That version hit Netlify's 26s synchronous cap
// mid-run on a slow vision+web-search pass — "Analysis didn't run — Quoya took too long"
// reported from the field. The actual analysis logic is unchanged (see
// lib/eval-analysis-core.js); the only difference is where the result goes: this writes
// to the lead_evaluations row instead of returning it in the HTTP response, and the
// portal.html wizard polls that row instead of waiting on one fetch.
//
// POST { evalId, photos:[{url,label}], hardware:{brand,model,serial,platform}, utility,
//        notes, answers:{}, catalog:[{option_key,title,service_type,default_price}],
//        lead:{address,system_size,install_year,original_installer,monthly_bill} }
//
// Always returns 202 quickly once the row is confirmed writable — the real work and the
// real result happen after the response, landing in lead_evaluations.
const { runEvalAnalysis } = require('./lib/eval-analysis-core');

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
// lead_evaluations carries fully-open anon RLS (same trust model as lead_activity /
// coaching_reports), so the anon key works as a fallback if the service key isn't set —
// this function should never be the reason a rep's analysis silently never lands.
const SUPA_KEY = SUPA_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPA_KEY;

const ALLOWED_ORIGINS = [
  'https://fixmy.energy', 'https://www.fixmy.energy', 'http://localhost:8888'
];
function corsFor(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

async function patchEval(evalId, patch) {
  if (!SUPA_KEY) return;
  try {
    await fetch(`${SUPA_URL}/rest/v1/lead_evaluations?id=eq.${evalId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(Object.assign({ updated_at: new Date().toISOString() }, patch))
    });
  } catch (e) {
    console.error('[eval-analysis-background] patch failed:', e.message);
  }
}

exports.handler = async function (event) {
  const CORS = corsFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const evalId = body.evalId;
  if (!evalId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'evalId required' }) };

  if (!ANTHROPIC_KEY) {
    await patchEval(evalId, { status: 'failed', error: 'ANTHROPIC_KEY not set' });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, skipped: 'no key' }) };
  }

  // Netlify treats this as a background invocation purely by the `-background` filename
  // suffix — it does not wait for the handler to return before considering the client's
  // request served, so awaiting the full analysis here is what gives it the 15-minute
  // budget instead of the 26s synchronous cap.
  const { out, error } = await runEvalAnalysis(ANTHROPIC_KEY, body);

  if (error) {
    await patchEval(evalId, { status: 'failed', error: `${error.message}${error.detail ? ' — ' + error.detail : ''}` });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false }) };
  }

  await patchEval(evalId, {
    analysis: out.confident ? out : null,
    questions: out.confident ? null : (out.questions || []),
    status: out.confident ? 'ready' : 'needs_input',
    analyzed_at: new Date().toISOString(),
    error: null
  });

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
};
