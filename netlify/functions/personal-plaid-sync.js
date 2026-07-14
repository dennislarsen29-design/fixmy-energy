// Personal Plaid sync → personal_transactions + personal_holdings + account
// balances. Scheduled nightly (netlify.toml) and callable from the Bookkeeper's
// "Sync Now". Service-role only, gated by PERSONAL_ACCESS_KEY.
//
//   GET  ?status=1   → sanitized status for the UI (no tokens)
//   POST / scheduled → sync every connected personal item
//
// Unlike the business sync there is no commission/deposit-review split: personal
// money-in is just income, money-out is expense, PFC transfers are flagged. All
// auto-categorized into the fixed personal budget categories (rules → AI), so
// day-to-day input is near zero. dedupe_hash keeps re-syncs idempotent.

const P = require('./lib/personal');

function isTransfer(pfc) { return pfc === 'TRANSFER_IN' || pfc === 'TRANSFER_OUT'; }

async function loadRules() {
  try { return await P.supaGet('/personal_categorization_rules?select=id,pattern,category,hit_count&limit=2000'); }
  catch (e) { return []; }
}
function applyRule(rules, desc) {
  const D = String(desc || '').toUpperCase();
  let best = null;
  for (const r of rules) {
    if (D.indexOf(String(r.pattern).toUpperCase()) < 0) continue;
    if (!best || String(r.pattern).length > String(best.pattern).length) best = r;
  }
  return best;
}

async function aiCategorize(txns) {
  if (!process.env.ANTHROPIC_KEY || !txns.length) return [];
  const cats = P.PERSONAL_CATEGORIES;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 4096,
      system: 'You categorize a household\'s personal bank/card transactions into exactly one budget category from the provided list, name VERBATIM. Set confidence below 0.7 when the merchant is ambiguous.',
      tools: [{ name: 'return_categories', description: 'One category per transaction.', input_schema: { type: 'object', properties: { assignments: { type: 'array', items: { type: 'object', properties: { index: { type: 'number' }, category: { type: 'string' }, confidence: { type: 'number' } }, required: ['index', 'category', 'confidence'] } } }, required: ['assignments'] } }],
      tool_choice: { type: 'tool', name: 'return_categories' },
      messages: [{ role: 'user', content: 'Categories:\n' + cats.join('\n') + '\n\nTransactions (index: description | amount):\n' + txns.slice(0, 300).map((t, i) => i + ': ' + t.description + ' | ' + t.amount).join('\n') }]
    })
  });
  if (!resp.ok) { console.warn('[personal-sync] AI categorize failed:', resp.status); return []; }
  const data = await resp.json();
  const block = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'return_categories');
  const valid = new Set(cats);
  return ((block && block.input && block.input.assignments) || []).filter(a => Number.isInteger(a.index) && valid.has(a.category));
}

async function syncItem(item, rules) {
  // account map: plaid_account_id → { id, type }
  const acctRows = await P.supaGet('/personal_accounts?select=id,plaid_account_id,type&plaid_item_id=eq.' + encodeURIComponent(item.item_id)).catch(() => []);
  const acctByPlaid = {};
  (acctRows || []).forEach(a => { acctByPlaid[a.plaid_account_id] = a; });

  // ── 1. Transactions ────────────────────────────────────────────────────────
  let cursor = item.cursor || null, added = [], removedIds = [], hasMore = true, guard = 0;
  while (hasMore && guard++ < 20) {
    const page = await P.plaid('/transactions/sync', { access_token: item.access_token, cursor: cursor, count: 500, options: { include_original_description: true } });
    added = added.concat(page.added || [], page.modified || []);
    (page.removed || []).forEach(r => removedIds.push(r.transaction_id));
    cursor = page.next_cursor; hasMore = page.has_more;
  }

  const txns = [];
  for (const t of added) {
    if (t.pending) continue;
    if (t.date && item.start_date && t.date < item.start_date) continue;
    const amount = Math.round((parseFloat(t.amount) || 0) * 100) / 100;  // Plaid: + = money out, - = money in
    if (!t.date || !amount) continue;
    const desc = ((t.merchant_name ? t.merchant_name + ' — ' : '') + (t.original_description || t.name || '')).replace(/\s+/g, ' ').trim().slice(0, 300);
    const pfc = (t.personal_finance_category && t.personal_finance_category.primary) || '';
    const flow = isTransfer(pfc) ? 'transfer' : (amount < 0 ? 'income' : 'expense');
    txns.push({ date: t.date, description: desc, amount: Math.abs(amount), flow: flow, plaid_id: t.transaction_id,
      account_id: (acctByPlaid[t.account_id] && acctByPlaid[t.account_id].id) || null });
  }

  // Categorize: transfers → 'Transfers'; income → 'Income'; expenses → rules → AI
  const pending = [];
  txns.forEach((t, i) => {
    if (t.flow === 'transfer') { t.category = 'Transfers'; t.review = 'auto'; return; }
    if (t.flow === 'income') { t.category = 'Income'; t.review = 'auto'; return; }
    const rule = applyRule(rules, t.description);
    if (rule) { t.category = rule.category; t.review = 'auto'; }
    else { t.category = null; t.review = 'needs_review'; pending.push(i); }
  });
  if (pending.length) {
    try {
      const asg = await aiCategorize(pending.map(i => ({ description: txns[i].description, amount: txns[i].amount })));
      asg.forEach(a => { const i = pending[a.index]; if (i === undefined) return; txns[i].category = a.category; txns[i].review = a.confidence >= 0.7 ? 'auto' : 'needs_review'; });
    } catch (e) { console.warn('[personal-sync] AI pass skipped:', e.message); }
  }

  const rows = txns.map(t => ({
    txn_date: t.date, description: t.description, merchant: P.normMerchant(t.description),
    amount: t.amount, flow: t.flow, category: t.category, account_id: t.account_id,
    dedupe_hash: P.txnHash(t, 'personal_plaid'), review_status: t.review, source: 'plaid', note: 'plaid:' + t.plaid_id
  }));
  const seen = {}; const unique = rows.filter(r => { if (seen[r.dedupe_hash]) return false; seen[r.dedupe_hash] = 1; return true; });
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const out = await P.supaPost('/personal_transactions?on_conflict=dedupe_hash&select=id', unique.slice(i, i + 200), { Prefer: 'resolution=ignore-duplicates,return=representation' });
    inserted += (out || []).length;
  }
  if (removedIds.length) {
    try {
      const chunk = removedIds.slice(0, 100).map(id => '"plaid:' + id + '"').join(',');
      await P.supaDelete('/personal_transactions?source=eq.plaid&note=in.(' + encodeURIComponent(chunk) + ')');
    } catch (e) { /* best effort */ }
  }

  // ── 2. Balances → personal_accounts (+ debt rows for credit/loan) ────────────
  try {
    const bal = await P.plaid('/accounts/balance/get', { access_token: item.access_token });
    for (const a of (bal.accounts || [])) {
      const row = acctByPlaid[a.account_id]; if (!row) continue;
      const cur = (a.balances && (a.balances.current != null ? a.balances.current : a.balances.available)) || 0;
      const bump = (row.type === 'credit' || row.type === 'loan') ? Math.abs(cur) : cur;
      await P.supaPatch('/personal_accounts?id=eq.' + row.id, { current_balance: bump, as_of: new Date().toISOString() });
      if (row.type === 'credit' || row.type === 'loan') {
        const sub = String(a.subtype || '').toLowerCase();
        const debtType = row.type === 'credit' ? 'credit_card' : (sub === 'mortgage' ? 'mortgage' : sub === 'student' ? 'student' : 'auto');
        const existing = await P.supaGet('/personal_debts?select=id&linked_account_id=eq.' + row.id).catch(() => []);
        const debtRow = { name: (a.name || item.institution) + (a.mask ? ' ••' + a.mask : ''), type: debtType, balance: Math.abs(cur), institution: item.institution, linked_account_id: row.id };
        if (existing && existing[0]) await P.supaPatch('/personal_debts?id=eq.' + existing[0].id, { balance: Math.abs(cur) });
        else await P.supaPost('/personal_debts', debtRow, { Prefer: 'return=minimal' });
      }
    }
  } catch (e) { console.warn('[personal-sync] balance skip:', e.message); }

  // ── 2b. Liabilities (real APR / minimum payment) — only if this item has the
  // product attached (Rocket-Mortgage-style loan servicers, or a bank reconnected
  // after PLAID_LIABILITIES_ENABLED went live). Never overwrites a manual edit
  // with a null when the item doesn't support Liabilities — just skips silently.
  try {
    const liab = await P.plaid('/liabilities/get', { access_token: item.access_token });
    const terms = {};
    ((liab.liabilities && liab.liabilities.credit) || []).forEach(c => {
      const apr = (c.aprs || []).find(x => x.apr_type === 'purchase_apr') || (c.aprs || [])[0];
      terms[c.account_id] = { apr: apr ? apr.apr_percentage : null, min_payment: c.minimum_payment_amount != null ? c.minimum_payment_amount : null };
    });
    ((liab.liabilities && liab.liabilities.mortgage) || []).forEach(m => {
      terms[m.account_id] = { apr: (m.interest_rate && m.interest_rate.percentage) != null ? m.interest_rate.percentage : null, min_payment: m.next_monthly_payment != null ? m.next_monthly_payment : null };
    });
    ((liab.liabilities && liab.liabilities.student) || []).forEach(s => {
      terms[s.account_id] = { apr: s.interest_rate_percentage != null ? s.interest_rate_percentage : null, min_payment: s.minimum_payment_amount != null ? s.minimum_payment_amount : null };
    });
    for (const accId in terms) {
      const row = acctByPlaid[accId]; if (!row) continue;
      const existing = await P.supaGet('/personal_debts?select=id&linked_account_id=eq.' + row.id).catch(() => []);
      if (existing && existing[0]) await P.supaPatch('/personal_debts?id=eq.' + existing[0].id, { apr: terms[accId].apr, min_payment: terms[accId].min_payment });
    }
  } catch (e) { /* item's access token doesn't have Liabilities attached — fine, balance-only */ }

  // ── 3. Investment holdings (Schwab etc.) → personal_holdings ─────────────────
  let holdingsCount = 0;
  try {
    const inv = await P.plaid('/investments/holdings/get', { access_token: item.access_token });
    const secById = {}; (inv.securities || []).forEach(s => { secById[s.security_id] = s; });
    const invAcctIds = new Set((acctRows || []).filter(a => a.type === 'investment').map(a => a.id));
    // snapshot: clear this item's plaid holdings, re-insert fresh
    if (invAcctIds.size) {
      const idList = Array.from(invAcctIds).map(id => '"' + id + '"').join(',');
      await P.supaDelete('/personal_holdings?source=eq.plaid&account_id=in.(' + encodeURIComponent(idList) + ')').catch(() => {});
    }
    const hRows = [];
    for (const h of (inv.holdings || [])) {
      const acct = acctByPlaid[h.account_id]; if (!acct) continue;
      const sec = secById[h.security_id] || {};
      const price = h.institution_price != null ? h.institution_price : sec.close_price;
      const mv = h.institution_value != null ? h.institution_value : (parseFloat(h.quantity) || 0) * (parseFloat(price) || 0);
      hRows.push({ account_id: acct.id, symbol: sec.ticker_symbol || null, name: sec.name || sec.ticker_symbol || 'Holding',
        quantity: h.quantity, cost_basis: h.cost_basis, current_price: price, market_value: Math.round((mv || 0) * 100) / 100,
        asset_class: sec.type || 'other', as_of: new Date().toISOString(), source: 'plaid' });
    }
    if (hRows.length) { await P.supaPost('/personal_holdings', hRows, { Prefer: 'return=minimal' }); holdingsCount = hRows.length; }
  } catch (e) { /* item may have no investment accounts — fine */ }

  item.cursor = cursor; item.last_synced = new Date().toISOString(); item.last_added = inserted; item.last_error = null;
  console.log('[personal-sync]', item.institution, '→', inserted, 'txns,', holdingsCount, 'holdings');
  return { txns: inserted, holdings: holdingsCount };
}

exports.handler = async function (event) {
  event = event || {};
  if (event.httpMethod === 'OPTIONS') return P.reply(200, {});

  if (event.httpMethod === 'GET' && (event.queryStringParameters || {}).status) {
    const gate = P.personalGate(event);
    if (!gate.ok) return P.reply(gate.code, { error: gate.error });
    if (!process.env.SUPA_SERVICE_KEY) return P.reply(200, { configured: false, items: [] });
    try {
      const items = await P.getPersonalItems();
      return P.reply(200, { configured: P.plaidReady(), env: process.env.PLAID_ENV || 'sandbox',
        items: items.map(i => ({ institution: i.institution, last_synced: i.last_synced, last_added: i.last_added, last_error: i.last_error })) });
    } catch (e) { return P.reply(200, { configured: P.plaidReady(), items: [], error: e.message }); }
  }

  // Scheduled runs have no origin header; only gate interactive (POST-with-origin) calls.
  const isScheduled = !(event.headers && (event.headers.origin || event.headers.referer));
  if (!isScheduled) { const gate = P.personalGate(event); if (!gate.ok) return P.reply(gate.code, { error: gate.error }); }
  if (!P.plaidReady() || !process.env.SUPA_SERVICE_KEY) return P.reply(200, { ok: false, error: 'Plaid/Supabase env vars not set' });

  const qs = event.queryStringParameters || {};
  let resync = qs.resync === '1' || qs.resync === 'true';
  if (!resync && event.body) { try { resync = !!JSON.parse(event.body).resync; } catch (e) {} }

  try {
    const items = await P.getPersonalItems();
    if (!items.length) return P.reply(200, { ok: true, message: 'No personal accounts connected yet' });
    if (resync) items.forEach(i => { i.cursor = null; });
    const rules = await loadRules();
    let totalTxns = 0, totalHoldings = 0;
    for (const item of items) {
      try { const r = await syncItem(item, rules); totalTxns += r.txns; totalHoldings += r.holdings; }
      catch (e) { item.last_error = e.message; console.error('[personal-sync]', item.institution, 'failed:', e.message); }
    }
    await P.savePersonalItems(items);
    // refresh today's net-worth snapshot after balances updated
    try {
      const [accounts, debts, holdings] = await Promise.all([
        P.supaGet('/personal_accounts?select=*'), P.supaGet('/personal_debts?select=*'), P.supaGet('/personal_holdings?select=*')]);
      let assets = 0, liabilities = 0;
      accounts.forEach(a => { const b = parseFloat(a.current_balance) || 0; if (['checking', 'savings', 'investment', 'asset'].includes(a.type)) assets += b; else if (['credit', 'loan'].includes(a.type)) liabilities += Math.abs(b); });
      debts.forEach(d => { if (!d.linked_account_id) liabilities += Math.abs(parseFloat(d.balance) || 0); });
      await P.supaPost('/personal_net_worth_snapshots?on_conflict=snap_date', { snap_date: new Date().toISOString().slice(0, 10), total_assets: Math.round(assets * 100) / 100, total_liabilities: Math.round(liabilities * 100) / 100, net_worth: Math.round((assets - liabilities) * 100) / 100 }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    } catch (e) {}
    return P.reply(200, { ok: true, imported: totalTxns, holdings: totalHoldings, accounts: items.length,
      message: 'Imported ' + totalTxns + ' transactions' + (totalHoldings ? ' and ' + totalHoldings + ' holdings' : '') + '.' });
  } catch (e) {
    console.error('[personal-sync] fatal:', e.message);
    return P.reply(200, { ok: false, error: e.message });
  }
};
