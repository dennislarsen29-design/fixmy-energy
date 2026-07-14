// Personal finance data gateway — the ONLY path the Bookkeeper/Coach UI uses to
// read or write personal_* tables (which are RLS default-deny, so the client anon
// key can't touch them). Service-role only, gated by PERSONAL_ACCESS_KEY.
//
//   POST { action, ... }
//     snapshot            → full personal picture + computed net worth
//     upsert  {table,row} → insert/update one whitelisted personal_ row
//     delete  {table,id}  → delete one row
//     recategorize {id,category,makeRule} → set a txn category (+ optional rule)
//     budget_set {category,monthly_limit}
//     save_networth       → write today's personal_net_worth_snapshots row
//
// Net worth model (no double-counting): Assets = account balances for
// checking/savings/investment/asset; Liabilities = |credit/loan balances| +
// manual debts not linked to an account. Holdings are a detail view of investment
// accounts, never added on top.

const P = require('./lib/personal');

const WRITABLE = new Set(['personal_accounts', 'personal_transactions', 'personal_debts', 'personal_holdings', 'personal_budgets', 'personal_categorization_rules', 'personal_vision_board', 'personal_profile']);
const ASSET_TYPES = new Set(['checking', 'savings', 'investment', 'asset']);
const LIAB_TYPES = new Set(['credit', 'loan']);

function computeNetWorth(accounts, debts, holdings) {
  let assets = 0, liabilities = 0;
  const byType = {};
  accounts.forEach(a => {
    const bal = parseFloat(a.current_balance) || 0;
    if (ASSET_TYPES.has(a.type)) { assets += bal; byType[a.type] = (byType[a.type] || 0) + bal; }
    else if (LIAB_TYPES.has(a.type)) { liabilities += Math.abs(bal); byType[a.type] = (byType[a.type] || 0) + Math.abs(bal); }
  });
  (debts || []).forEach(d => { if (!d.linked_account_id) liabilities += Math.abs(parseFloat(d.balance) || 0); });
  const holdingsTotal = (holdings || []).reduce((s, h) => s + (parseFloat(h.market_value) || 0), 0);
  return { assets: r2(assets), liabilities: r2(liabilities), net_worth: r2(assets - liabilities), byType: byType, holdingsTotal: r2(holdingsTotal) };
}
function r2(n) { return Math.round((n || 0) * 100) / 100; }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return P.reply(200, {});
  if (event.httpMethod !== 'POST') return P.reply(405, { error: 'Method Not Allowed' });
  const gate = P.personalGate(event);
  if (!gate.ok) return P.reply(gate.code, { error: gate.error });
  if (!process.env.SUPA_SERVICE_KEY) return P.reply(500, { error: 'SUPA_SERVICE_KEY not set in Netlify' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch (e) { return P.reply(400, { error: 'Invalid JSON' }); }
  const action = req.action;

  try {
    if (action === 'snapshot') {
      const [accounts, txns, debts, holdings, budgets, rules, nw, profile, vision] = await Promise.all([
        P.supaGet('/personal_accounts?select=*&order=type').catch(() => []),
        P.supaGet('/personal_transactions?select=*&order=txn_date.desc&limit=' + (parseInt(req.txnLimit, 10) || 1500)).catch(() => []),
        P.supaGet('/personal_debts?select=*&order=balance.desc').catch(() => []),
        P.supaGet('/personal_holdings?select=*&order=market_value.desc').catch(() => []),
        P.supaGet('/personal_budgets?select=*').catch(() => []),
        P.supaGet('/personal_categorization_rules?select=*&limit=2000').catch(() => []),
        P.supaGet('/personal_net_worth_snapshots?select=*&order=snap_date.asc&limit=1000').catch(() => []),
        P.supaGet('/personal_profile?id=eq.default&select=*').catch(() => []),
        P.supaGet('/personal_vision_board?select=*&order=sort').catch(() => [])
      ]);
      return P.reply(200, {
        ok: true, unlocked: gate.unlocked, keyConfigured: !!process.env.PERSONAL_ACCESS_KEY, plaidConfigured: P.plaidReady(),
        categories: P.PERSONAL_CATEGORIES,
        accounts, transactions: txns, debts, holdings, budgets, rules,
        netWorthHistory: nw, profile: (profile && profile[0]) || null, visionBoard: vision || [],
        computed: computeNetWorth(accounts, debts, holdings)
      });
    }

    if (action === 'upsert') {
      if (!WRITABLE.has(req.table)) return P.reply(400, { error: 'table not writable' });
      const row = Object.assign({}, req.row);
      const onConflict = req.table === 'personal_budgets' ? '?on_conflict=category'
        : req.table === 'personal_profile' ? '?on_conflict=id' : '';
      const out = await P.supaPost('/' + req.table + onConflict, row,
        { Prefer: (onConflict ? 'resolution=merge-duplicates,' : '') + 'return=representation' });
      return P.reply(200, { ok: true, row: (out && out[0]) || null });
    }

    if (action === 'delete') {
      if (!WRITABLE.has(req.table)) return P.reply(400, { error: 'table not writable' });
      await P.supaDelete('/' + req.table + '?id=eq.' + encodeURIComponent(req.id));
      return P.reply(200, { ok: true });
    }

    if (action === 'patch') {
      if (!WRITABLE.has(req.table)) return P.reply(400, { error: 'table not writable' });
      if (!req.id || !req.patch) return P.reply(400, { error: 'id and patch required' });
      await P.supaPatch('/' + req.table + '?id=eq.' + encodeURIComponent(req.id), req.patch);
      return P.reply(200, { ok: true });
    }

    if (action === 'recategorize') {
      await P.supaPatch('/personal_transactions?id=eq.' + encodeURIComponent(req.id),
        { category: req.category, review_status: 'confirmed' });
      if (req.makeRule && req.pattern) {
        await P.supaPost('/personal_categorization_rules', { pattern: String(req.pattern).toUpperCase().slice(0, 80), category: req.category }, { Prefer: 'return=minimal' }).catch(() => {});
      }
      return P.reply(200, { ok: true });
    }

    if (action === 'budget_set') {
      await P.supaPost('/personal_budgets?on_conflict=category',
        { category: req.category, monthly_limit: parseFloat(req.monthly_limit) || 0 },
        { Prefer: 'resolution=merge-duplicates,return=minimal' });
      return P.reply(200, { ok: true });
    }

    if (action === 'save_networth') {
      const [accounts, debts, holdings] = await Promise.all([
        P.supaGet('/personal_accounts?select=*').catch(() => []),
        P.supaGet('/personal_debts?select=*').catch(() => []),
        P.supaGet('/personal_holdings?select=*').catch(() => [])
      ]);
      const c = computeNetWorth(accounts, debts, holdings);
      const today = new Date().toISOString().slice(0, 10);
      await P.supaPost('/personal_net_worth_snapshots?on_conflict=snap_date', {
        snap_date: today, total_assets: c.assets, total_liabilities: c.liabilities, net_worth: c.net_worth, breakdown: c.byType
      }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
      return P.reply(200, { ok: true, computed: c });
    }

    if (action === 'disconnect_item') {
      if (!req.item_id) return P.reply(400, { error: 'item_id required' });
      const items = await P.getPersonalItems();
      const item = items.find(i => i.item_id === req.item_id);
      if (item) { try { await P.plaid('/item/remove', { access_token: item.access_token }); } catch (e) { /* revoke best-effort */ } }
      await P.savePersonalItems(items.filter(i => i.item_id !== req.item_id));
      await P.supaDelete('/personal_accounts?plaid_item_id=eq.' + encodeURIComponent(req.item_id));
      return P.reply(200, { ok: true });
    }

    if (action === 'coach_reports') {
      const rows = await P.supaGet('/personal_coach_reports?select=*&order=created_at.desc&limit=60').catch(function(){ return []; });
      return P.reply(200, { ok: true, reports: rows || [] });
    }
    if (action === 'mark_report_reviewed') {
      await P.supaPatch('/personal_coach_reports?id=eq.' + encodeURIComponent(req.id), { reviewed: true });
      return P.reply(200, { ok: true });
    }

    return P.reply(400, { error: 'unknown action' });
  } catch (e) {
    return P.reply(500, { error: e.message });
  }
};
