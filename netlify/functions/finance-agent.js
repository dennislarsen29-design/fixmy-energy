// Finance Agent — the AI financial advisor. Runs nightly ~5am PT (see netlify.toml),
// after the 3:20am GHL payments sweep, so it always sees fresh books.
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY (+ VAPID keys for push).
//
// Reads the full financial picture (P&L, expense ledger, recurring charges,
// commissions, cash position), researches current tax strategy with web search,
// and writes advisor-grade recommendations to agent_reports (agent:'finance') —
// which surface in both the Agents inbox and the Finance tab's AI Advisor view.
// It recommends; it never mutates financial records.

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';
const { sendAgentNotification } = require('./lib/push');

async function supaGet(path, key) {
  const resp = await fetch(SUPA_REST + path, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  });
  if (!resp.ok) throw new Error('Supabase GET failed: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

async function supaInsert(table, row, key) {
  const resp = await fetch(SUPA_REST + '/' + table, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  });
  if (!resp.ok) throw new Error('Supabase INSERT failed: ' + resp.status + ' ' + await resp.text());
}

function normalizePriority(p) {
  const s = (p || '').toLowerCase();
  if (s === 'urgent') return 'urgent';
  if (s === 'high' || s === 'medium') return 'high';
  return 'normal';
}

async function callClaude(messages, tools, system, toolChoice) {
  const body = { model: 'claude-sonnet-5', max_tokens: 8192, system, tools, messages };
  if (toolChoice) body.tool_choice = toolChoice;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    // anthropic-beta is required for the web_search server tool (see inverter-analysis.js) —
    // without it every data-gathering call in phase 1 (which always includes web_search)
    // fails outright with a 400, so the agent never produces a report, nightly or manual.
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Claude API error: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

// ── Shared P&L math (must agree with the portal's Statements tab) ────────────
// Income  = payments(category revenue) + commissions(payee solar_review_corp, paid)
// COGS    = job_costs paid (Subcontracted Services) + rep commissions paid (Incentives - Sales)
//           + marketing_expenses (Lead Generation)
// Expense = expense_transactions grouped by account
function monthKey(d) { return String(d || '').slice(0, 7); }

async function buildBooks(key) {
  const [pays, comms, costs, expenses, marketing] = await Promise.all([
    supaGet('/payments?select=amount,paid_at,category,customer_id&limit=5000', key),
    supaGet('/commissions?select=amount,status,kind,payee,payee_name,line,sold_at,paid_at&limit=5000', key),
    supaGet('/job_costs?select=amount,status,label,paid_at,created_at,customer_id&limit=5000', key),
    supaGet('/expense_transactions?select=txn_date,description,merchant,amount,account_name,review_status&limit=10000', key).catch(() => []),
    supaGet('/marketing_expenses?select=*&limit=2000', key).catch(() => [])
  ]);
  return { pays, comms, costs, expenses, marketing };
}

function pnlSnapshot(b) {
  const months = {};
  const bump = (m, section, account, amt) => {
    if (!m || m.length !== 7) return;
    months[m] = months[m] || { income: {}, cogs: {}, expense: {} };
    const sec = months[m][section];
    sec[account] = (sec[account] || 0) + amt;
  };
  b.pays.forEach(p => { if ((p.category || 'revenue') === 'revenue') bump(monthKey(p.paid_at), 'income', 'Commission Income', parseFloat(p.amount) || 0); });
  b.comms.forEach(c => {
    const amt = parseFloat(c.amount) || 0;
    if (c.payee === 'solar_review_corp' && c.status === 'paid') bump(monthKey(c.paid_at || c.sold_at), 'income', 'Commission Income', amt);
    else if (c.kind === 'rep_commission' && c.status === 'paid') bump(monthKey(c.paid_at || c.sold_at), 'cogs', 'Incentives - Sales', amt);
    else if (c.kind === 'travel_reimbursement' && c.status === 'paid') bump(monthKey(c.paid_at || c.sold_at), 'expense', 'Travel Expense', amt);
  });
  b.costs.forEach(c => { if (c.status === 'paid') bump(monthKey(c.paid_at || c.created_at), 'cogs', 'Subcontracted Services', parseFloat(c.amount) || 0); });
  b.marketing.forEach(m => {
    const d = m.expense_date || m.date || m.created_at;
    bump(monthKey(d), 'cogs', 'Lead Generation', parseFloat(m.amount || m.cost) || 0);
  });
  b.expenses.forEach(e => bump(monthKey(e.txn_date), 'expense', e.account_name || 'Uncategorized', parseFloat(e.amount) || 0));

  const out = {};
  Object.keys(months).sort().forEach(m => {
    const v = months[m];
    const sum = o => Object.values(o).reduce((t, x) => t + x, 0);
    out[m] = {
      income: sum(v.income), cogs: sum(v.cogs), grossProfit: sum(v.income) - sum(v.cogs),
      expenses: sum(v.expense), netIncome: sum(v.income) - sum(v.cogs) - sum(v.expense),
      expenseByAccount: Object.fromEntries(Object.entries(v.expense).map(([k, x]) => [k, Math.round(x * 100) / 100]))
    };
  });
  return out;
}

const TOOLS = [
  { name: 'get_pnl_snapshot', description: 'Month-by-month P&L: income, COGS, gross profit, operating expenses (by account), net income — same math as the portal\'s Statements tab.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_expense_breakdown', description: 'Operating expenses by account with month-over-month deltas and the biggest individual transactions. Also reports how many transactions are uncategorized/needs-review.', input_schema: { type: 'object', properties: { months_back: { type: 'number', description: 'How many months to analyze (default 6)' } } } },
  { name: 'get_recurring_charges', description: 'Detects recurring same-merchant charges (subscriptions, memberships) with monthly cost — the subscription-audit list.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_commissions_summary', description: 'Commissions by payee and status: owed to reps, override income owed to Solar Review Corp, paid totals — the payroll picture.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_cash_position', description: 'Cash exposure: outstanding customer balances (invoiced minus paid), unpaid job costs, commissions owed — what is coming in vs going out.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_recent_reports', description: 'Your own finance reports from the last 7 days — check before writing to avoid repeating yesterday\'s findings.', input_schema: { type: 'object', properties: {} } },
  { name: 'write_recommendation', description: 'Save one advisor recommendation. Call once per distinct finding.', input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, specific headline — lead with the $ impact when known, e.g. "Cut $145/mo: CPA bookkeeping now duplicated by the portal"' },
        body: { type: 'string', description: 'The recommendation: what the data shows, why it matters, the exact action to take, estimated $ impact, and (for tax items) the rule/source found via web search. End tax items with: "Verify with a licensed tax professional before filing."' },
        priority: { type: 'string', description: 'urgent | high | normal' }
      },
      required: ['title', 'body']
    } }
];

async function executeTool(name, input, key, cache) {
  if (!cache.books) cache.books = await buildBooks(key);
  const b = cache.books;

  switch (name) {
    case 'get_pnl_snapshot':
      return JSON.stringify(pnlSnapshot(b));

    case 'get_expense_breakdown': {
      const monthsBack = Math.min(Math.max(parseInt(input.months_back, 10) || 6, 1), 24);
      const since = new Date(); since.setMonth(since.getMonth() - monthsBack);
      const rows = b.expenses.filter(e => new Date(e.txn_date) >= since);
      const byAccount = {}, byAccountMonth = {};
      rows.forEach(e => {
        const acct = e.account_name || 'Uncategorized', amt = parseFloat(e.amount) || 0;
        byAccount[acct] = (byAccount[acct] || 0) + amt;
        const km = acct + '|' + monthKey(e.txn_date);
        byAccountMonth[km] = (byAccountMonth[km] || 0) + amt;
      });
      const biggest = rows.slice().sort((a, c) => (parseFloat(c.amount) || 0) - (parseFloat(a.amount) || 0)).slice(0, 15)
        .map(e => ({ date: e.txn_date, description: (e.description || '').slice(0, 60), amount: e.amount, account: e.account_name }));
      const needsReview = rows.filter(e => e.review_status === 'needs_review' || !e.account_name).length;
      return JSON.stringify({ totalsByAccount: byAccount, byAccountMonth, biggestTransactions: biggest, needsReviewCount: needsReview, transactionCount: rows.length });
    }

    case 'get_recurring_charges': {
      const byMerchant = {};
      b.expenses.forEach(e => {
        const m = (e.merchant || e.description || '').toUpperCase().replace(/[0-9#*]/g, '').trim().slice(0, 24);
        if (!m) return;
        (byMerchant[m] = byMerchant[m] || []).push({ month: monthKey(e.txn_date), amount: parseFloat(e.amount) || 0 });
      });
      const recurring = [];
      Object.entries(byMerchant).forEach(([m, hits]) => {
        const months = new Set(hits.map(h => h.month));
        if (months.size >= 2) {
          const avg = hits.reduce((t, h) => t + h.amount, 0) / hits.length;
          recurring.push({ merchant: m, monthsSeen: months.size, avgCharge: Math.round(avg * 100) / 100, estAnnualCost: Math.round(avg * 12) });
        }
      });
      recurring.sort((a, c) => c.estAnnualCost - a.estAnnualCost);
      return JSON.stringify({ recurring: recurring.slice(0, 30), note: 'Known external recurring costs not on card statements may include: CPA bookkeeping $145/mo.' });
    }

    case 'get_commissions_summary': {
      const sum = rows => rows.reduce((t, x) => t + (parseFloat(x.amount) || 0), 0);
      const owedReps = b.comms.filter(c => c.status === 'sold' && c.payee !== 'solar_review_corp');
      const owedSRC = b.comms.filter(c => c.status === 'sold' && c.payee === 'solar_review_corp');
      const paid = b.comms.filter(c => c.status === 'paid');
      const byPayee = {};
      b.comms.forEach(c => {
        const p = c.payee_name || c.payee;
        byPayee[p] = byPayee[p] || { sold: 0, paid: 0 };
        byPayee[p][c.status === 'paid' ? 'paid' : 'sold'] += parseFloat(c.amount) || 0;
      });
      return JSON.stringify({ owedToReps: sum(owedReps), overrideIncomeDueToSRC: sum(owedSRC), totalPaidOut: sum(paid.filter(c => c.payee !== 'solar_review_corp')), byPayee });
    }

    case 'get_cash_position': {
      const custs = await supaGet('/customers?select=id,first_name,last_name,invoice_amount,invoice_status,sold_type&limit=3000', key);
      const paysByCust = {};
      b.pays.forEach(p => { if ((p.category || 'revenue') === 'revenue' && p.customer_id) paysByCust[p.customer_id] = (paysByCust[p.customer_id] || 0) + (parseFloat(p.amount) || 0); });
      let outstanding = 0, outstandingCount = 0;
      custs.forEach(c => {
        const target = parseFloat(c.invoice_amount) || 0;
        if (target <= 0) return;
        const bal = target - (paysByCust[c.id] || 0);
        if (bal > 0.005 && c.invoice_status !== 'paid') { outstanding += bal; outstandingCount++; }
      });
      const unpaidCosts = b.costs.filter(c => c.status === 'pending').reduce((t, c) => t + (parseFloat(c.amount) || 0), 0);
      const owedReps = b.comms.filter(c => c.status === 'sold' && c.payee !== 'solar_review_corp').reduce((t, c) => t + (parseFloat(c.amount) || 0), 0);
      return JSON.stringify({ customerBalancesOutstanding: Math.round(outstanding * 100) / 100, customersWithBalance: outstandingCount, unpaidJobCosts: unpaidCosts, commissionsOwedToReps: owedReps });
    }

    case 'get_recent_reports': {
      const since = new Date(); since.setDate(since.getDate() - 7);
      const rows = await supaGet('/agent_reports?select=title,created_at&agent=eq.finance&created_at=gte.' + since.toISOString() + '&order=created_at.desc&limit=30', key);
      return JSON.stringify(rows);
    }

    case 'write_recommendation': {
      await supaInsert('agent_reports', {
        agent: 'finance', priority: normalizePriority(input.priority),
        title: input.title, body: input.body, action_url: null
      }, key);
      return 'Saved.';
    }

    default:
      return 'Unknown tool: ' + name;
  }
}

const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };

const SYSTEM = `You are the AI Financial Advisor for Solar Review Corp — a California S-Corp (cash-basis books) doing solar diagnostics, repairs, battery retrofits, and solar sales commissions in San Diego. The owner is Dennis Larsen; he currently pays a CPA $145/month for bookkeeping this portal is designed to replace.

You run nightly. You are a PROACTIVE advisor, not a reporter: don't restate what happened — recommend what to DO next, with dollar amounts.

Your analysis, in priority order:
1. WASTE — redundant subscriptions, creeping recurring charges, expense categories growing faster than revenue. Name the merchant and the annual cost.
2. TAX STRATEGY — use web_search for CURRENT-year rules before asserting any number (S-Corp reasonable salary vs distributions, accountable plans, home office, vehicle standard-mileage vs actual, Augusta rule §280A(g), QBI §199A, CA franchise tax, quarterly estimated payments). Cite what you found. Every tax recommendation ends with: "Verify with a licensed tax professional before filing."
3. MARGIN — jobs or business lines where COGS is eating the margin; commission exposure vs cash on hand.
4. CASH — outstanding customer balances worth chasing, mismatch between money owed out (reps, subs) and money coming in.
5. BOOKS HYGIENE — uncategorized/needs-review transactions piling up; months with income but no expense data (statements not uploaded).

Rules:
- Check get_recent_reports FIRST and do not repeat a recommendation made in the last 7 days unless the numbers changed materially.
- If the books are empty or nothing material changed, write ONE brief "books are quiet" note at normal priority — never invent findings.
- Be specific: dollar amounts, merchant names, month names, exact next actions. No generic advice.
- You are not a licensed CPA or tax attorney and never present yourself as one.`;

exports.handler = async function () {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[finance-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const cache = {};
    const DATA_TOOLS = TOOLS.filter(t => t.name !== 'write_recommendation').concat([WEB_SEARCH_TOOL]);
    const WRITE_TOOL = TOOLS.find(t => t.name === 'write_recommendation');

    const messages = [{
      role: 'user',
      content: `Run tonight's financial review. Today is ${today}. Start with get_recent_reports, then gather: get_pnl_snapshot, get_expense_breakdown, get_recurring_charges, get_commissions_summary, get_cash_position. Use web_search only where a tax rule or rate needs confirming.`
    }];

    // Phase 1: data gathering (client tools + server-side web search)
    let turns = 0;
    while (turns++ < 12) {
      const response = await callClaude(messages, DATA_TOOLS, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[finance-agent] data tool:', block.name);
          const result = await executeTool(block.name, block.input, key, cache);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      if (!results.length) break; // only server-side tools ran this turn
      messages.push({ role: 'user', content: results });
    }

    // Phase 2: write recommendations — tool_choice:any guarantees at least one
    let recCount = 0;
    messages.push({ role: 'user', content: 'You have the full picture. Write your recommendations now with write_recommendation — one call per finding, most valuable first. If nothing material changed since recent reports, write the single "books are quiet" note.' });

    const wr1 = await callClaude(messages, [WRITE_TOOL], SYSTEM, { type: 'any' });
    messages.push({ role: 'assistant', content: wr1.content });
    const toolRes1 = [];
    for (const block of (wr1.content || [])) {
      if (block.type === 'tool_use') {
        recCount++;
        const r = await executeTool(block.name, block.input, key, cache);
        toolRes1.push({ type: 'tool_result', tool_use_id: block.id, content: r });
      }
    }
    if (wr1.stop_reason === 'tool_use' && toolRes1.length > 0) {
      messages.push({ role: 'user', content: toolRes1 });
      let wt = 0;
      while (wt++ < 6) {
        const wr = await callClaude(messages, [WRITE_TOOL], SYSTEM);
        messages.push({ role: 'assistant', content: wr.content });
        if (wr.stop_reason !== 'tool_use') break;
        const res2 = [];
        for (const block of (wr.content || [])) {
          if (block.type === 'tool_use') {
            recCount++;
            const r = await executeTool(block.name, block.input, key, cache);
            res2.push({ type: 'tool_result', tool_use_id: block.id, content: r });
          }
        }
        messages.push({ role: 'user', content: res2 });
      }
    }

    if (recCount > 0) await sendAgentNotification('finance', recCount);
    console.log('[finance-agent] Done. Turns:', turns, 'Recommendations:', recCount);
    return { statusCode: 200, body: 'Finance agent completed' };
  } catch (e) {
    console.error('[finance-agent] Error:', e.message);
    try {
      await supaInsert('agent_reports', {
        agent: 'finance', priority: 'urgent',
        title: 'Finance Agent Error — ' + e.message.slice(0, 60),
        body: 'Error: ' + e.message + '\n\nCheck Netlify function logs for [finance-agent].',
        action_url: null
      }, process.env.SUPA_SERVICE_KEY);
    } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
