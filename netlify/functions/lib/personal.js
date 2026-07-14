// Shared helpers for the Personal (Bookkeeper + Financial Coach) Netlify
// functions. Reuses lib/plaid.js's service-role Supabase + Plaid plumbing, and
// adds: personal Plaid item storage (a SEPARATE app_config key from the business
// items, so the two never mix), a service-role DELETE, the PERSONAL_ACCESS_KEY
// gate, and the fixed personal budget category list.

const base = require('./plaid');
const SUPA_REST = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';

function svcHeaders(extra) {
  const key = process.env.SUPA_SERVICE_KEY;
  return Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json' }, extra || {});
}
async function supaDelete(path) {
  const resp = await fetch(SUPA_REST + path, { method: 'DELETE', headers: svcHeaders({ Prefer: 'return=minimal' }) });
  if (!resp.ok) throw new Error('Supabase DELETE failed: ' + resp.status + ' ' + await resp.text());
}

// Personal Plaid access tokens — app_config key 'personal_plaid_items', kept
// entirely separate from the business 'plaid_items'.
async function getPersonalItems() {
  const rows = await base.supaGet('/app_config?key=eq.personal_plaid_items&select=value');
  return (rows && rows[0] && rows[0].value && rows[0].value.items) || [];
}
async function savePersonalItems(items) {
  await base.supaPost('/app_config?on_conflict=key', {
    key: 'personal_plaid_items', value: { items: items }, updated_at: new Date().toISOString()
  }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
}

// Access gate: if PERSONAL_ACCESS_KEY is set in Netlify, every personal request
// must send it as x-personal-key. If it's not set, we fall back to origin-only
// (works out of the box) but the UI nags to set it. keyRequiredButMissing lets
// the gateway tell the client to prompt for the key.
function personalGate(event) {
  const envKey = process.env.PERSONAL_ACCESS_KEY;
  if (!base.originAllowed(event)) return { ok: false, code: 403, error: 'Forbidden' };
  if (!envKey) return { ok: true, unlocked: false };   // not locked down yet
  const h = event.headers || {};
  const sent = h['x-personal-key'] || h['X-Personal-Key'] || '';
  if (sent !== envKey) return { ok: false, code: 401, error: 'personal_key_required' };
  return { ok: true, unlocked: true };
}

// Fixed personal budgeting chart of accounts — used by the AI categorizer and the UI.
const PERSONAL_CATEGORIES = [
  'Income', 'Housing', 'Utilities', 'Groceries', 'Dining', 'Transportation', 'Auto & Gas',
  'Insurance', 'Healthcare', 'Debt Payments', 'Subscriptions', 'Entertainment', 'Shopping',
  'Kids', 'Travel', 'Savings & Investments', 'Transfers', 'Fees', 'Taxes', 'Misc'
];

module.exports = Object.assign({}, base, { supaDelete, getPersonalItems, savePersonalItems, personalGate, PERSONAL_CATEGORIES, SUPA_REST });
