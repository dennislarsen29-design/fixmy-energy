// Exchanges a personal Plaid public_token, stores the access_token under the
// SEPARATE personal_plaid_items app_config key (never mixed with business), and
// seeds personal_accounts rows from the item's accounts so balances show up
// immediately. Service-role only, gated by PERSONAL_ACCESS_KEY.
//
// POST { public_token, institution } → { ok, institution, accounts }

const P = require('./lib/personal');

// Plaid account type/subtype → our personal_accounts.type
function mapType(a) {
  const t = (a.type || '').toLowerCase(), s = (a.subtype || '').toLowerCase();
  if (t === 'depository') return s === 'savings' ? 'savings' : 'checking';
  if (t === 'credit') return 'credit';
  if (t === 'loan') return 'loan';
  if (t === 'investment' || t === 'brokerage') return 'investment';
  return 'other';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return P.reply(200, {});
  if (event.httpMethod !== 'POST') return P.reply(405, { error: 'Method Not Allowed' });
  const gate = P.personalGate(event);
  if (!gate.ok) return P.reply(gate.code, { error: gate.error });
  if (!P.plaidReady() || !process.env.SUPA_SERVICE_KEY) return P.reply(500, { error: 'Plaid/Supabase env vars not set in Netlify yet' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch (e) { return P.reply(400, { error: 'Invalid JSON' }); }
  if (!req.public_token) return P.reply(400, { error: 'public_token required' });

  try {
    const ex = await P.plaid('/item/public_token/exchange', { public_token: req.public_token });
    const institution = String(req.institution || 'Unknown institution').slice(0, 80);

    // Pull accounts + balances now so the UI has something immediately.
    let plaidAccounts = [];
    try {
      const acc = await P.plaid('/accounts/get', { access_token: ex.access_token });
      plaidAccounts = acc.accounts || [];
    } catch (e) { /* balances still come on first sync */ }

    // Seed / upsert personal_accounts (match on plaid_account_id).
    const existingRows = await P.supaGet('/personal_accounts?select=id,plaid_account_id&plaid_item_id=eq.' + encodeURIComponent(ex.item_id)).catch(() => []);
    const seenIds = new Set((existingRows || []).map(r => r.plaid_account_id));
    const seeded = [];
    for (const a of plaidAccounts) {
      if (seenIds.has(a.account_id)) continue;
      const type = mapType(a);
      const bal = (a.balances && (a.balances.current != null ? a.balances.current : a.balances.available)) || 0;
      seeded.push({
        name: (a.name || a.official_name || institution) + (a.mask ? ' ••' + a.mask : ''),
        type: type, institution: institution, plaid_item_id: ex.item_id, plaid_account_id: a.account_id,
        current_balance: type === 'credit' || type === 'loan' ? Math.abs(bal) : bal, as_of: new Date().toISOString()
      });
    }
    if (seeded.length) await P.supaPost('/personal_accounts', seeded, { Prefer: 'return=minimal' });

    const depSince = new Date(); depSince.setUTCDate(depSince.getUTCDate() - 180);
    const items = await P.getPersonalItems();
    const idx = items.findIndex(i => i.item_id === ex.item_id);
    const entry = {
      item_id: ex.item_id, access_token: ex.access_token, institution: institution,
      cursor: null, start_date: depSince.toISOString().slice(0, 10),
      last_synced: null, last_added: 0, last_error: null, connected_at: new Date().toISOString()
    };
    if (idx >= 0) items[idx] = Object.assign(items[idx], entry); else items.push(entry);
    await P.savePersonalItems(items);

    return P.reply(200, { ok: true, institution: institution, accounts: seeded.length });
  } catch (e) {
    return P.reply(500, { error: e.message });
  }
};
