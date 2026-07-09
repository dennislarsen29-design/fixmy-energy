// Plaid → expense_transactions nightly sync (scheduled 11:30 UTC ≈ 4:30am PT,
// see netlify.toml — 30 min before finance-agent so the AI advisor sees fresh books).
//
//   GET  ?status=1   → sanitized connection status for the portal (no tokens)
//   POST / scheduled → run the sync for every connected item
//
// Dedupe, three layers:
//   1. per-item start_date cutoff (set at connect time = day after newest CSV txn)
//   2. dedupe_hash unique column — re-syncs and Plaid retries land exactly once
//   3. cross-source guard — skip any Plaid txn whose (date, amount) already exists
//      from a CSV/PDF/manual import, so statement uploads never double-book
// Categorization mirrors the portal's CSV import: categorization_rules first,
// then one Claude batch call for unknowns (confidence < 0.7 ⇒ review queue).

const { plaid, plaidReady, supaGet, supaPost, getPlaidItems, savePlaidItems, txnHash, normMerchant, reply, originAllowed } = require('./lib/plaid');

const SKIP_PFC = new Set(['TRANSFER_IN', 'LOAN_PAYMENTS']);
function isIssuerPayment(desc) {
  return /(AUTOPAY|ONLINE PAYMENT|PAYMENT RECEIVED|PAYMENT[\s-]*THANK YOU|MOBILE PAYMENT|ACH PAYMENT RECEIVED)/i.test(desc);
}

async function loadRules() {
  try {
    return await supaGet('/categorization_rules?select=id,pattern,account_name,priority,hit_count&order=priority.desc&limit=2000');
  } catch (e) { return []; }
}
function applyRules(rules, desc) {
  const D = String(desc || '').toUpperCase();
  let best = null;
  for (const r of rules) {
    if (D.indexOf(String(r.pattern).toUpperCase()) < 0) continue;
    if (!best || (r.priority || 0) > (best.priority || 0) ||
        ((r.priority || 0) === (best.priority || 0) && String(r.pattern).length > String(best.pattern).length)) best = r;
  }
  return best;
}

async function aiCategorize(txns) {
  // Same tool contract as finance-extract.js mode 'categorize'
  if (!process.env.ANTHROPIC_KEY || !txns.length) return [];
  let accounts = [];
  try {
    const coa = await supaGet('/coa_accounts?select=name,type,parent&active=eq.true&order=sort');
    const parents = new Set(coa.map(a => a.parent).filter(Boolean));
    accounts = coa.filter(a => (a.type === 'expense' || a.type === 'cogs') && !parents.has(a.name)).map(a => a.name);
  } catch (e) { return []; }
  if (!accounts.length) return [];
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 8192,
      system: 'You are a bookkeeper for Solar Review Corp, a San Diego S-Corp doing solar diagnostics, repairs, and battery retrofits (field sales business: heavy vehicle/fuel/meals/advertising spend). Categorize each transaction into exactly one account from the chart of accounts, name VERBATIM. Prefer the most specific sub-account. Set confidence below 0.7 when the merchant is ambiguous.',
      tools: [{ name: 'return_categories', description: 'Return one account assignment per transaction.', input_schema: { type: 'object', properties: { assignments: { type: 'array', items: { type: 'object', properties: { index: { type: 'number' }, account: { type: 'string' }, confidence: { type: 'number' } }, required: ['index', 'account', 'confidence'] } } }, required: ['assignments'] } }],
      tool_choice: { type: 'tool', name: 'return_categories' },
      messages: [{ role: 'user', content: 'Chart of accounts:\n' + accounts.join('\n') + '\n\nTransactions (index: description | amount):\n' + txns.slice(0, 300).map((t, i) => i + ': ' + t.description + ' | ' + t.amount).join('\n') }]
    })
  });
  if (!resp.ok) { console.warn('[plaid-sync] AI categorize failed:', resp.status); return []; }
  const data = await resp.json();
  const block = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'return_categories');
  const valid = new Set(accounts);
  return ((block && block.input && block.input.assignments) || []).filter(a => Number.isInteger(a.index) && valid.has(a.account));
}

async function syncItem(item, rules) {
  let cursor = item.cursor || null;
  let added = [], removedIds = [], hasMore = true, guard = 0;
  while (hasMore && guard++ < 20) {
    const page = await plaid('/transactions/sync', {
      access_token: item.access_token, cursor: cursor, count: 500,
      options: { include_original_description: true }
    });
    added = added.concat(page.added || [], page.modified || []);
    (page.removed || []).forEach(r => removedIds.push(r.transaction_id));
    cursor = page.next_cursor;
    hasMore = page.has_more;
  }

  // Map + filter
  const txns = [];
  for (const t of added) {
    if (t.pending) continue;                                   // book only settled txns
    const desc = (t.merchant_name ? t.merchant_name + ' — ' : '') + (t.original_description || t.name || '');
    const pfc = (t.personal_finance_category && t.personal_finance_category.primary) || '';
    const amount = Math.round((parseFloat(t.amount) || 0) * 100) / 100;  // Plaid: positive = money out
    if (!t.date || !amount) continue;
    if (item.start_date && t.date < item.start_date) continue; // CSV history owns everything before the cutoff
    if (SKIP_PFC.has(pfc) || isIssuerPayment(desc)) continue;  // card payments/transfers are not expenses
    txns.push({ date: t.date, description: desc.replace(/\s+/g, ' ').trim().slice(0, 300), amount: amount, plaid_id: t.transaction_id });
  }

  // Cross-source guard: (date|amount) pairs already imported from CSV/PDF/manual
  let crossSkipped = 0;
  if (txns.length) {
    const minDate = txns.reduce((m, t) => t.date < m ? t.date : m, txns[0].date);
    try {
      const existing = await supaGet('/expense_transactions?select=txn_date,amount&source=neq.plaid&txn_date=gte.' + minDate + '&limit=10000');
      const seen = new Set(existing.map(e => e.txn_date + '|' + (Math.round((parseFloat(e.amount) || 0) * 100) / 100)));
      for (let i = txns.length - 1; i >= 0; i--) {
        if (seen.has(txns[i].date + '|' + txns[i].amount)) { txns.splice(i, 1); crossSkipped++; }
      }
    } catch (e) { /* guard is best-effort */ }
  }

  // Categorize: rules → AI batch for the rest
  const pendingIdx = [];
  txns.forEach((t, i) => {
    const rule = applyRules(rules, t.description);
    t.account = rule ? rule.account_name : null;
    t.review = rule ? 'auto' : 'needs_review';
    if (!rule) pendingIdx.push(i);
  });
  if (pendingIdx.length) {
    try {
      const assignments = await aiCategorize(pendingIdx.map(i => ({ description: txns[i].description, amount: txns[i].amount })));
      assignments.forEach(a => {
        const i = pendingIdx[a.index];
        if (i === undefined) return;
        txns[i].account = a.account;
        txns[i].review = a.confidence >= 0.7 ? 'auto' : 'needs_review';
      });
    } catch (e) { console.warn('[plaid-sync] AI pass skipped:', e.message); }
  }

  // Insert (idempotent on dedupe_hash)
  const rows = txns.map(t => ({
    txn_date: t.date, description: t.description, merchant: normMerchant(t.description),
    amount: t.amount, account_name: t.account, source: 'plaid', statement_id: null,
    dedupe_hash: txnHash(t, 'plaid'), review_status: t.review, note: 'plaid:' + t.plaid_id
  }));
  const seenHash = {};
  const unique = rows.filter(r => { if (seenHash[r.dedupe_hash]) return false; seenHash[r.dedupe_hash] = 1; return true; });
  let inserted = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const out = await supaPost('/expense_transactions?on_conflict=dedupe_hash&select=id', unique.slice(i, i + 200),
      { Prefer: 'resolution=ignore-duplicates,return=representation' });
    inserted += (out || []).length;
  }

  // Plaid-removed txns (reversals) — drop the matching plaid rows
  if (removedIds.length) {
    try {
      const chunk = removedIds.slice(0, 100).map(id => '"plaid:' + id + '"').join(',');
      await fetch('https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1/expense_transactions?source=eq.plaid&note=in.(' + encodeURIComponent(chunk) + ')', {
        method: 'DELETE',
        headers: { apikey: process.env.SUPA_SERVICE_KEY, Authorization: 'Bearer ' + process.env.SUPA_SERVICE_KEY }
      });
    } catch (e) { console.warn('[plaid-sync] removed-cleanup skipped:', e.message); }
  }

  // Audit row
  try {
    await supaPost('/statement_uploads', {
      filename: item.institution + ' (Plaid)', kind: 'plaid', format: 'api',
      txn_count: added.length, imported_count: inserted, duplicate_count: (unique.length - inserted) + crossSkipped
    }, { Prefer: 'return=minimal' });
  } catch (e) {}

  item.cursor = cursor;
  item.last_synced = new Date().toISOString();
  item.last_added = inserted;
  item.last_dupes = (unique.length - inserted) + crossSkipped;
  item.last_error = null;
  console.log('[plaid-sync]', item.institution, '→', inserted, 'new,', item.last_dupes, 'dupes skipped,', removedIds.length, 'removed');
  return inserted;
}

exports.handler = async function (event) {
  event = event || {};
  if (event.httpMethod === 'OPTIONS') return reply(200, {});

  // Status for the portal (no secrets)
  if (event.httpMethod === 'GET' && (event.queryStringParameters || {}).status) {
    if (!originAllowed(event)) return reply(403, { error: 'Forbidden' });
    if (!process.env.SUPA_SERVICE_KEY) return reply(200, { configured: false, items: [] });
    try {
      const items = await getPlaidItems();
      return reply(200, {
        configured: plaidReady(), env: process.env.PLAID_ENV || 'sandbox',
        items: items.map(i => ({ institution: i.institution, kind: i.kind, start_date: i.start_date, last_synced: i.last_synced, last_added: i.last_added, last_dupes: i.last_dupes, last_error: i.last_error }))
      });
    } catch (e) { return reply(200, { configured: plaidReady(), items: [], error: e.message }); }
  }

  // Sync run — scheduled invocation or portal "Sync Now"
  if (!plaidReady() || !process.env.SUPA_SERVICE_KEY) {
    console.log('[plaid-sync] env vars not set — skipping');
    return reply(200, { ok: false, error: 'PLAID_CLIENT_ID / PLAID_SECRET / SUPA_SERVICE_KEY not set' });
  }
  try {
    const items = await getPlaidItems();
    if (!items.length) return reply(200, { ok: true, message: 'No accounts connected yet' });
    const rules = await loadRules();
    let total = 0;
    for (const item of items) {
      try { total += await syncItem(item, rules); }
      catch (e) {
        item.last_error = e.message;
        console.error('[plaid-sync]', item.institution, 'failed:', e.message);
      }
    }
    await savePlaidItems(items);
    return reply(200, { ok: true, imported: total, accounts: items.length });
  } catch (e) {
    console.error('[plaid-sync] fatal:', e.message);
    return reply(200, { ok: false, error: e.message });
  }
};
