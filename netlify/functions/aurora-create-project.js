// aurora-create-project.js — true one-click Aurora hand-off.
//
// Aurora's own "New project" page has no URL parameter to prefill the address — that field
// is a live autocomplete Aurora's frontend controls, not something a query string can drive.
// The only real way to skip the manual paste is Aurora's authenticated Create Project API,
// which actually creates the project server-side and returns an id to deep-link straight
// into it. That needs an API token + tenant_id from Aurora → Settings → API Settings, which
// only an admin on the Aurora account can generate — set as AURORA_API_TOKEN /
// AURORA_TENANT_ID in Netlify. Until those are set this function just says so; the portal
// falls back to the old copy-address-then-open-Aurora flow, so nothing breaks either way.
//
// POST { address, first_name, last_name, email, customer_id }
// -> { ok:true, projectId, url } or { ok:false, code, detail }

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

exports.handler = async function (event) {
  const CORS = corsFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const TOKEN = process.env.AURORA_API_TOKEN;
  const TENANT_ID = process.env.AURORA_TENANT_ID;
  const ENV = (process.env.AURORA_ENV || 'production').toLowerCase();
  const isSandbox = ENV === 'sandbox';

  // Not configured yet — a clean, expected state, not an error. The portal falls back to
  // the old copy-to-clipboard flow on this, silently, for every rep.
  if (!TOKEN || !TENANT_ID) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, code: 'not_configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, code: 'bad_json' }) }; }

  const address = (body.address || '').trim();
  if (!address) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, code: 'no_address' }) };

  const firstName = (body.first_name || '').trim();
  const lastName = (body.last_name || '').trim();
  const fullName = (firstName + ' ' + lastName).trim();

  const apiBase = isSandbox ? 'https://api-sandbox.aurorasolar.com' : 'https://api.aurorasolar.com';

  const projectBody = {
    project: {
      location: { property_address: address },
      name: fullName || address
    }
  };
  if (firstName) projectBody.project.customer_first_name = firstName;
  if (lastName) projectBody.project.customer_last_name = lastName;
  if (body.email) projectBody.project.customer_email = body.email;
  if (body.customer_id) projectBody.project.external_provider_id = String(body.customer_id);

  let resp, data;
  try {
    resp = await fetch(apiBase + '/tenants/' + encodeURIComponent(TENANT_ID) + '/projects', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(projectBody)
    });
    const text = await resp.text();
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  } catch (e) {
    console.error('[aurora-create-project] network error:', e.message);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, code: 'network', detail: e.message }) };
  }

  if (!resp.ok) {
    console.error('[aurora-create-project] Aurora API ' + resp.status + ':', JSON.stringify(data));
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, code: 'http_' + resp.status, detail: data }) };
  }

  // The exact response shape wasn't verifiable from this dev sandbox (api.aurorasolar.com is
  // blocked by its network policy) — defensively check every field name Aurora's docs and
  // partner tutorials reference, and log the raw body once so the first live call can
  // confirm which one it actually is.
  const projectId = data.id || data.project_id
    || (data.project && data.project.id)
    || (data.data && data.data.id);

  if (!projectId) {
    console.error('[aurora-create-project] 2xx but no recognizable project id in response:', JSON.stringify(data));
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, code: 'no_project_id', detail: data }) };
  }

  const url = (isSandbox ? 'https://v2-sandbox.aurorasolar.com' : 'https://v2.aurorasolar.com')
    + '/projects/' + encodeURIComponent(projectId);

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, projectId, url }) };
};
