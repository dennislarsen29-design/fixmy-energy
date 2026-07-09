// Shared Plaid + Supabase helpers for the statement auto-sync functions.
// Zero npm deps — raw fetch against the Plaid REST API, service-role Supabase.
// Env vars: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox|production), SUPA_SERVICE_KEY.

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

const PLAID_HOSTS = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com'
};

function plaidReady() {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

async function plaid(path, body) {
  const host = PLAID_HOSTS[(process.env.PLAID_ENV || 'sandbox').toLowerCase()] || PLAID_HOSTS.sandbox;
  const resp = await fetch(host + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET
    }, body))
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msg = (data && (data.error_message || data.error_code)) || ('Plaid error ' + resp.status);
    const err = new Error(msg);
    err.plaid = data;
    throw err;
  }
  return data;
}

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

async function supaPost(path, body, extraHeaders) {
  const resp = await fetch(SUPA_REST + path, {
    method: 'POST', headers: supaHeaders(extraHeaders), body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Supabase POST failed: ' + resp.status + ' ' + await resp.text());
  const text = await resp.text();
  try { return JSON.parse(text); } catch (e) { return null; }
}

// app_config plaid_items shape:
// { items: [{ item_id, access_token, institution, kind (amex|bank), start_date,
//             cursor, last_synced, last_added, last_dupes, last_error }] }
async function getPlaidItems() {
  const rows = await supaGet('/app_config?key=eq.plaid_items&select=value');
  return (rows && rows[0] && rows[0].value && rows[0].value.items) || [];
}

async function savePlaidItems(items) {
  await supaPost('/app_config?on_conflict=key', {
    key: 'plaid_items', value: { items: items }, updated_at: new Date().toISOString()
  }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
}

// Same hash the portal's CSV importer uses (portal.html finHashStr/finTxnHash),
// with kind 'plaid' — keeps Plaid re-syncs idempotent on the same unique column.
function hashStr(s) {
  let h = 5381, i = s.length;
  while (i) h = ((h * 33) ^ s.charCodeAt(--i)) >>> 0;
  return h.toString(36) + '_' + s.length;
}
function txnHash(t, kind) {
  const desc = String(t.description || '').toUpperCase().replace(/\s+/g, ' ').trim();
  return hashStr(t.date + '|' + (Math.round((parseFloat(t.amount) || 0) * 100) / 100) + '|' + desc + '|' + kind);
}
function normMerchant(desc) {
  return String(desc || '').toUpperCase().replace(/[0-9#*]{3,}/g, '').replace(/\s+/g, ' ').trim().slice(0, 48);
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const reply = (status, body) => ({ statusCode: status, headers: cors, body: JSON.stringify(body) });

const ALLOWED_ORIGIN_HOSTS = new Set(['fixmy.energy', 'www.fixmy.energy']);
function originAllowed(event) {
  const h = event.headers || {};
  const src = h.origin || h.Origin || h.referer || h.Referer || '';
  if (!src) return false;
  try {
    const host = new URL(src).hostname.toLowerCase();
    return ALLOWED_ORIGIN_HOSTS.has(host) || host.endsWith('.netlify.app');
  } catch (e) { return false; }
}

module.exports = { plaid, plaidReady, supaGet, supaPost, getPlaidItems, savePlaidItems, txnHash, normMerchant, cors, reply, originAllowed };
