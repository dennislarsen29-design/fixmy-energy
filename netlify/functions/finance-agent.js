// Finance Agent — the AI financial advisor. Runs WEEKLY, Mondays ~5am PT (see netlify.toml; was nightly
// until 2026-11-23 — Dennis: "send one every week, it hasn't been very helpful yet"). Files ONE weekly brief:
// last 7 days vs the 7 before, then the top 3–5 actions with dollar amounts.
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
  // Retry transient gateway errors (502/503/504/429) — a single Supabase hiccup used to
  // fail the whole nightly run and file an "urgent" error report.
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const resp = await fetch(SUPA_REST + path, {
      headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
    });
    if (resp.ok) return resp.json();
    lastErr = new Error('Supabase GET failed: ' + resp.status + ' ' + await resp.text());
    if ([429, 502, 503, 504].indexOf(resp.status) === -1) throw lastErr;
    await new Promise(r => setTimeout(r, 1500 * Math.pow(2, attempt)));
  }
  throw lastErr;
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
// Dennis (tech4) is the owner. His commission is auto-marked paid when it is locked in and lands in the SAME
// bank account as Solar Review's share, so it is a ledger entry, NOT a cash payout. The portal's P&L still
// books it to COGS 'Incentives - Sales', so we report it separately and show an adjusted margin.
const OWNER_PAYEE = 'tech4';

async function buildBooks(key) {
  // Two small batches instead of five parallel heavy reads — the big parallel burst is what
  // tripped Supabase's gateway (504). supaGet also retries transient gateway errors.
  const [pays, comms, costs] = await Promise.all([
    supaGet('/payments?select=amount,paid_at,category,customer_id&limit=5000', key),
    supaGet('/commissions?select=amount,status,kind,payee,payee_name,line,note,customer_id,sold_at,paid_at&limit=5000', key),
    supaGet('/job_costs?select=amount,status,label,paid_at,created_at,customer_id&limit=5000', key)
  ]);
  const expenses = await supaGet('/expense_transactions?select=txn_date,description,merchant,amount,account_name,review_status&limit=10000', key).catch(() => []);
  const marketing = await supaGet('/marketing_expenses?select=*&limit=2000', key).catch(() => []);
  return { pays, comms, costs, expenses, marketing };
}

function pnlSnapshot(b) {
  const months = {};
  const isOwnerEquity = n => /distribution|shareholder|owner.?(draw|contribution)/i.test(n || '');
  const bump = (m, section, account, amt) => {
    if (!m || m.length !== 7) return;
    months[m] = months[m] || { income: {}, cogs: {}, expense: {} };
    const sec = months[m][section];
    sec[account] = (sec[account] || 0) + amt;
  };
  b.pays.forEach(p => { if ((p.category || 'revenue') === 'revenue') bump(monthKey(p.paid_at), 'income', 'Commission Income', parseFloat(p.amount) || 0); });
  const ownerAuto = {};
  b.comms.forEach(c => {
    const amt = parseFloat(c.amount) || 0;
    const mk = monthKey(c.paid_at || c.sold_at);
    if (c.payee === 'solar_review_corp' && c.status === 'paid') bump(mk, 'income', 'Commission Income', amt);
    // Match the portal exactly: rep AND setter commissions are 'Incentives - Sales' (setters were missing here before).
    else if ((c.kind === 'rep_commission' || c.kind === 'setter_commission') && c.status === 'paid') {
      bump(mk, 'cogs', 'Incentives - Sales', amt);
      if (c.payee === OWNER_PAYEE && mk) ownerAuto[mk] = (ownerAuto[mk] || 0) + amt;
    }
    else if (c.kind === 'travel_reimbursement' && c.status === 'paid') bump(mk, 'expense', 'Travel Expense', amt);
  });
  b.costs.forEach(c => { if (c.status === 'paid') bump(monthKey(c.paid_at || c.created_at), 'cogs', 'Subcontracted Services', parseFloat(c.amount) || 0); });
  b.marketing.forEach(m => {
    const d = m.expense_date || m.date || m.created_at;
    bump(monthKey(d), 'cogs', 'Lead Generation', parseFloat(m.amount || m.cost) || 0);
  });
  // Shareholder Distributions is EQUITY, not an expense (the portal keeps it off the P&L too). Its sign matters:
  // positive = money taken OUT by the owner, negative = money put IN (reverse transfers / contributions).
  // Summing absolute values once reported $23.9k "taken" when the net was $12.2k put in.
  b.expenses.forEach(e => {
    const amt = parseFloat(e.amount) || 0;
    if (isOwnerEquity(e.account_name)) {
      const mk = monthKey(e.txn_date); if (!mk || mk.length !== 7) return;
      months[mk] = months[mk] || { income: {}, cogs: {}, expense: {} };
      months[mk].owner = months[mk].owner || { out: 0, in: 0 };
      if (amt >= 0) months[mk].owner.out += amt; else months[mk].owner.in += -amt;
      return;
    }
    bump(monthKey(e.txn_date), 'expense', e.account_name || 'Uncategorized', amt);
  });

  const out = {};
  Object.keys(months).sort().forEach(m => {
    const v = months[m];
    const sum = o => Object.values(o).reduce((t, x) => t + x, 0);
    out[m] = {
      income: sum(v.income), cogs: sum(v.cogs), grossProfit: sum(v.income) - sum(v.cogs),
      expenses: sum(v.expense), netIncome: sum(v.income) - sum(v.cogs) - sum(v.expense),
      expenseByAccount: Object.fromEntries(Object.entries(v.expense).map(([k, x]) => [k, Math.round(x * 100) / 100])),
      cogsByAccount: Object.fromEntries(Object.entries(v.cogs).map(([k, x]) => [k, Math.round(x * 100) / 100]))
    };
    const oa = Math.round((ownerAuto[m] || 0) * 100) / 100;
    if (oa) {
      out[m].ownerAutoPaidCommission = oa;
      out[m].adjustedNote = 'cogs/grossProfit/netIncome above INCLUDE $' + oa + ' of the owner\'s auto-paid commission (a ledger entry, not cash out). Adjusted for it: cogs ' + Math.round((out[m].cogs - oa) * 100) / 100 + ', netIncome ' + Math.round((out[m].netIncome + oa) * 100) / 100 + '.';
      out[m].cogsExcludingOwnerAutoPaid = Math.round((out[m].cogs - oa) * 100) / 100;
      out[m].netIncomeExcludingOwnerAutoPaid = Math.round((out[m].netIncome + oa) * 100) / 100;
    }
    if (v.owner) {
      const o = Math.round(v.owner.out * 100) / 100, i = Math.round(v.owner.in * 100) / 100;
      out[m].ownerEquity = { takenOut: o, putIn: i, net: Math.round((o - i) * 100) / 100,
        direction: o > i ? 'owner took out more than put in' : (i > o ? 'owner put in more than took out (net contribution)' : 'even') };
    }
  });
  return out;
}

const TOOLS = [
  { name: 'get_pnl_snapshot', description: 'Month-by-month P&L: income, COGS, gross profit, operating expenses (by account), net income — same math as the portal\'s Statements tab.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_expense_breakdown', description: 'Operating expenses by account with month-over-month deltas and the biggest individual transactions. Also reports how many transactions are uncategorized/needs-review.', input_schema: { type: 'object', properties: { months_back: { type: 'number', description: 'How many months to analyze (default 6)' } } } },
  { name: 'get_recurring_charges', description: 'Detects recurring same-merchant charges (subscriptions, memberships) with monthly cost — the subscription-audit list.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_commissions_summary', description: 'Commissions by payee and status: owed to reps, override income owed to Solar Review Corp, paid totals — the payroll picture.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_cash_position', description: 'Cash exposure: outstanding customer balances (invoiced minus paid), unpaid job costs, commissions owed — what is coming in vs going out.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_week_summary', description: 'This week vs last week: revenue collected, override income received, rep/setter pay, paid job costs, operating expenses (with the biggest new charges), owner money out/in, new commissions locked, and transactions still needing review. Start here.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_recent_reports', description: 'Your own finance briefs from the last 4 weeks — check before writing so you never repeat last week\'s advice.', input_schema: { type: 'object', properties: {} } },
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
      return JSON.stringify({
        notes: [
          'Income here = customer payments + override rows RECEIVED by Solar Review Corp. Rep/setter pay is booked to COGS when marked paid. Because the gross commission a partner (Axia/Cosmic) pays is not all booked as income, a month with many rep payouts and few received overrides shows a big negative margin that is TIMING/BOOKING, not job losses.',
          'The owner\'s own commission is auto-marked paid when locked in and lands in the same bank account — see ownerAutoPaidCommission and the *ExcludingOwnerAutoPaid fields; judge margin on those, and say which basis you are quoting.',
          'Nothing in this system "closes" a month. Never say books are closed/finalized; a month is just complete or not.'
        ],
        months: pnlSnapshot(b)
      });

    case 'get_expense_breakdown': {
      const monthsBack = Math.min(Math.max(parseInt(input.months_back, 10) || 6, 1), 24);
      const since = new Date(); since.setMonth(since.getMonth() - monthsBack);
      const rows = b.expenses.filter(e => new Date(e.txn_date) >= since && !/distribution|shareholder|owner.?(draw|contribution)/i.test(e.account_name || ''));
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
      const allNeeds = b.expenses.filter(e => e.review_status === 'needs_review' || !e.account_name);
      const ownerLike = /1065|larsen,\s*dennis|dennis larsen|chase/i;
      const likelyOwnerTransfers = allNeeds.filter(e => ownerLike.test(e.description || '')).map(e => ({ date: e.txn_date, description: (e.description || '').slice(0, 60), amount: e.amount }));
      const uncategorizedByMonth = {};
      b.expenses.filter(e => !e.account_name || e.account_name === 'Uncategorized').forEach(e => { const m = monthKey(e.txn_date); uncategorizedByMonth[m] = (uncategorizedByMonth[m] || 0) + (parseFloat(e.amount) || 0); });
      return JSON.stringify({ totalsByAccount: byAccount, byAccountMonth, biggestTransactions: biggest, needsReviewCountInWindow: needsReview, needsReviewCountAllTime: allNeeds.length, uncategorizedAmountByMonth: uncategorizedByMonth, likelyOwnerTransfersInQueue: likelyOwnerTransfers, transactionCount: rows.length, note: 'An Uncategorized amount only distorts the month it is dated in (not later months). Transfers to the owner\'s personal Chase (****1065) or "Larsen,Dennis" are owner distributions (equity, off the P&L) — recommend coding them as Shareholder Distributions, not as an expense problem.' });
    }

    case 'get_recurring_charges': {
      const byMerchant = {};
      b.expenses.forEach(e => {
        const m = (e.merchant || e.description || '').toUpperCase().replace(/[0-9#*]/g, '').trim().slice(0, 24);
        if (!m) return;
        (byMerchant[m] = byMerchant[m] || []).push({ month: monthKey(e.txn_date), amount: parseFloat(e.amount) || 0 });
      });
      const recurring = [], irregular = [];
      Object.entries(byMerchant).forEach(([m, hits]) => {
        const months = new Set(hits.map(h => h.month));
        if (months.size < 2) return;
        const amts = hits.map(h => h.amount);
        const avg = amts.reduce((t, x) => t + x, 0) / amts.length;
        const sd = Math.sqrt(amts.reduce((t, x) => t + Math.pow(x - avg, 2), 0) / amts.length);
        // A true subscription repeats at a near-identical amount. Wildly varying amounts are
        // pay-as-you-go purchases (e.g. skip-trace credits) — never annualize those.
        if (months.size >= 3 && avg > 0 && sd / avg < 0.25) {
          recurring.push({ merchant: m, monthsSeen: months.size, avgCharge: Math.round(avg * 100) / 100, estAnnualCost: Math.round(avg * 12) });
        } else {
          irregular.push({ merchant: m, charges: hits.length, total: Math.round(amts.reduce((t, x) => t + x, 0) * 100) / 100, note: 'irregular amounts — purchases, not a subscription; do NOT annualize' });
        }
      });
      recurring.sort((a, c) => c.estAnnualCost - a.estAnnualCost);
      return JSON.stringify({ recurring: recurring.slice(0, 30), irregularPurchases: irregular.slice(0, 15), note: 'Known vendors: "IN *ARTISTS BUSINESS MANAGEMENT GROUP" (Carlsbad) is the company bookkeeper/CPA (Accounting) — expected, not waste, not personal. TRACERFY.COM is skip-trace credit purchases bought as needed — not a subscription. CPA bookkeeping may also appear off-card.' });
    }

    case 'get_commissions_summary': {
      const sum = rows => rows.reduce((t, x) => t + (parseFloat(x.amount) || 0), 0);
      const r2 = n => Math.round(n * 100) / 100;
      const owedReps = b.comms.filter(c => c.status === 'sold' && c.payee !== 'solar_review_corp');
      const owedSRC = b.comms.filter(c => c.status === 'sold' && c.payee === 'solar_review_corp');
      const paid = b.comms.filter(c => c.status === 'paid');
      const byPayee = {};
      b.comms.forEach(c => {
        const p = c.payee_name || c.payee;
        byPayee[p] = byPayee[p] || { sold: 0, paid: 0 };
        byPayee[p][c.status === 'paid' ? 'paid' : 'sold'] += parseFloat(c.amount) || 0;
      });
      // Which unreceived override rows are actually DUE? Look at each job's real state.
      const ids = [...new Set(owedSRC.map(c => c.customer_id).filter(Boolean))];
      let cust = {};
      if (ids.length) {
        const rows = await supaGet('/customers?select=id,first_name,last_name,sold_type,step,solar_status,install_completed_at,ns_pto_at&id=in.(' + ids.join(',') + ')&limit=500', key).catch(() => []);
        rows.forEach(r => { cust[r.id] = r; });
      }
      const dueNow = [], notYet = [];
      owedSRC.forEach(c => {
        const j = cust[c.customer_id] || {};
        const nm = ((j.first_name || '') + ' ' + (j.last_name || '')).trim() || 'unknown job';
        const amt = parseFloat(c.amount) || 0;
        let due = false, why = '';
        if (c.note === 'cosmic_sale') { due = true; why = 'Cosmic 50% at sale — Cosmic pays on request'; }
        else if (c.note === 'cosmic_done') { due = (j.step || 0) >= 9; why = due ? 'job installed — Cosmic 50% at completion is payable' : 'waiting on job completion'; }
        else if (c.note === 'dc_bonus') { due = !!j.ns_pto_at; why = due ? 'PTO granted' : 'Domestic Content bonus waits for PTO'; }
        else if (j.sold_type === 'new_solar') { due = !!j.install_completed_at; why = due ? 'install completed — Axia Payment 1 payable' : 'waiting on install completion'; }
        else { why = 'state unclear'; }
        (due ? dueNow : notYet).push({ job: nm, amount: r2(amt), why });
      });
      return JSON.stringify({ owedToReps: r2(sum(owedReps)), overrideIncomeLockedTotal: r2(sum(owedSRC)), overrideIncomeDueNow: r2(dueNow.reduce((t, x) => t + x.amount, 0)), overrideIncomeNotYetDue: r2(notYet.reduce((t, x) => t + x.amount, 0)), dueNowJobs: dueNow, notYetDueJobs: notYet, caveat: 'overrideIncomeLockedTotal is NOT all collectable — only overrideIncomeDueNow is. Tell Dennis to collect only the due-now jobs. owedToReps includes the owner (auto-paid, not cash) and rows on not-yet-installed jobs, which are not payable yet.', totalPaidOut: r2(sum(paid.filter(c => c.payee !== 'solar_review_corp'))), byPayee });
    }

    case 'get_cash_position': {
      const custs = await supaGet('/customers?select=id,first_name,last_name,invoice_amount,invoice_status,sold_type,step,disposition_exit&limit=3000', key);
      const byId = {}; custs.forEach(c => { byId[c.id] = c; });
      const paysByCust = {};
      b.pays.forEach(p => { if ((p.category || 'revenue') === 'revenue' && p.customer_id) paysByCust[p.customer_id] = (paysByCust[p.customer_id] || 0) + (parseFloat(p.amount) || 0); });
      let outstanding = 0, outstandingCount = 0;
      custs.forEach(c => {
        const target = parseFloat(c.invoice_amount) || 0;
        if (target <= 0) return;
        const bal = target - (paysByCust[c.id] || 0);
        if (bal > 0.005 && c.invoice_status !== 'paid') { outstanding += bal; outstandingCount++; }
      });
      // Unpaid job costs: separate real payables from accruals and suspect lines.
      let real = 0, accrued = 0; const suspect = [];
      b.costs.filter(c => c.status === 'pending').forEach(c => {
        const amt = parseFloat(c.amount) || 0, j = byId[c.customer_id] || {};
        const nm = ((j.first_name || '') + ' ' + (j.last_name || '')).trim() || 'unknown';
        if (j.sold_type === 'battery_retrofit' && amt > 2000) suspect.push({ job: nm, amount: amt, label: c.label, why: 'battery retrofits are collected directly by Cosmic — Solar Review should carry no job cost, so this is probably a stale/wrong line' });
        else if (/test/i.test(nm)) suspect.push({ job: nm, amount: amt, why: 'looks like a test record' });
        else if (j.disposition_exit || j.step === 7) suspect.push({ job: nm, amount: amt, why: 'lead was set aside / not sold — confirm the visit happened before paying' });
        else if ((j.step || 0) <= 3) accrued += amt;
        else real += amt;
      });
      const owedReps = b.comms.filter(c => c.status === 'sold' && c.payee !== 'solar_review_corp' && c.payee !== OWNER_PAYEE).reduce((t, c) => t + (parseFloat(c.amount) || 0), 0);
      return JSON.stringify({ customerBalancesOutstanding: Math.round(outstanding * 100) / 100, customersWithBalance: outstandingCount, unpaidJobCostsConfirmed: real, unpaidJobCostsAccruedVisitNotDone: accrued, suspectJobCostLines: suspect, commissionsOwedToTeamNonOwner: Math.round(owedReps * 100) / 100, caveat: 'Do NOT add suspect lines to "owed out". Do NOT compare owed-out to only customer invoices — also use get_commissions_summary overrideIncomeDueNow for money coming in. Locked rep commissions on not-yet-installed jobs are not payable yet; the owner\'s own commission is auto-paid, never a cash obligation.' });
    }

    case 'get_recent_reports': {
      const since = new Date(); since.setDate(since.getDate() - 28);
      const rows = await supaGet('/agent_reports?select=title,priority,body,created_at&agent=eq.finance&created_at=gte.' + since.toISOString() + '&order=created_at.desc&limit=40', key);
      return JSON.stringify(rows.map(r => ({ date: r.created_at, priority: r.priority, title: r.title, said: String(r.body || '').slice(0, 600) })));
    }

    case 'get_week_summary': {
      // Two 7-day windows ending now. Same booking rules as pnlSnapshot (owner equity off the P&L, owner's
      // auto-paid commission reported separately because it is a ledger entry, not cash out).
      const now = Date.now(), D = 86400000;
      const win = t => { const x = new Date(t).getTime(); if (isNaN(x)) return null; if (x > now) return null; if (x >= now - 7 * D) return 'thisWeek'; if (x >= now - 14 * D) return 'lastWeek'; return null; };
      const blank = () => ({ revenueCollected: 0, overrideIncomeReceived: 0, teamPayPaid: 0, ownerAutoPaidCommission: 0, jobCostsPaid: 0, operatingExpenses: 0, ownerTakenOut: 0, ownerPutIn: 0, newCommissionsLocked: 0, newCommissionRows: 0, expenseByAccount: {}, biggestCharges: [] });
      const w = { thisWeek: blank(), lastWeek: blank() };
      const r2 = n => Math.round(n * 100) / 100;
      const isEq = n => /distribution|shareholder|owner.?(draw|contribution)/i.test(n || '');
      b.pays.forEach(p => { const k = win(p.paid_at); if (k && (p.category || 'revenue') === 'revenue') w[k].revenueCollected += parseFloat(p.amount) || 0; });
      b.comms.forEach(c => {
        const amt = parseFloat(c.amount) || 0;
        const kp = c.status === 'paid' ? win(c.paid_at) : null;
        if (kp && c.payee === 'solar_review_corp') w[kp].overrideIncomeReceived += amt;
        else if (kp && (c.kind === 'rep_commission' || c.kind === 'setter_commission')) { if (c.payee === OWNER_PAYEE) w[kp].ownerAutoPaidCommission += amt; else w[kp].teamPayPaid += amt; }
        const ks = win(c.sold_at); if (ks) { w[ks].newCommissionsLocked += amt; w[ks].newCommissionRows++; }
      });
      b.costs.forEach(c => { const k = c.status === 'paid' ? win(c.paid_at) : null; if (k) w[k].jobCostsPaid += parseFloat(c.amount) || 0; });
      b.expenses.forEach(e => {
        const k = win(e.txn_date); if (!k) return; const amt = parseFloat(e.amount) || 0;
        if (isEq(e.account_name)) { if (amt >= 0) w[k].ownerTakenOut += amt; else w[k].ownerPutIn += -amt; return; }
        w[k].operatingExpenses += amt; const a = e.account_name || 'Uncategorized'; w[k].expenseByAccount[a] = (w[k].expenseByAccount[a] || 0) + amt;
        w[k].biggestCharges.push({ date: e.txn_date, merchant: e.merchant || e.description, amount: r2(amt), account: e.account_name || 'Uncategorized' });
      });
      Object.keys(w).forEach(k => {
        const o = w[k];
        ['revenueCollected', 'overrideIncomeReceived', 'teamPayPaid', 'ownerAutoPaidCommission', 'jobCostsPaid', 'operatingExpenses', 'ownerTakenOut', 'ownerPutIn', 'newCommissionsLocked'].forEach(f => { o[f] = r2(o[f]); });
        o.moneyIn = r2(o.revenueCollected + o.overrideIncomeReceived);
        o.moneyOutExcludingOwner = r2(o.teamPayPaid + o.jobCostsPaid + o.operatingExpenses);
        o.netCashLikeExcludingOwner = r2(o.moneyIn - o.moneyOutExcludingOwner);
        o.expenseByAccount = Object.fromEntries(Object.entries(o.expenseByAccount).map(([a, x]) => [a, r2(x)]).sort((x, y) => y[1] - x[1]));
        o.biggestCharges = o.biggestCharges.sort((x, y) => y.amount - x.amount).slice(0, 6);
      });
      const needsReview = b.expenses.filter(e => e.review_status === 'needs_review').length;
      const lastTxn = b.expenses.map(e => e.txn_date).filter(Boolean).sort().pop() || null;
      return JSON.stringify({ windows: 'thisWeek = last 7 days ending today; lastWeek = the 7 days before that', thisWeek: w.thisWeek, lastWeek: w.lastWeek, needsReviewCountAllTime: needsReview, newestBankTransactionDate: lastTxn, caveat: 'ownerAutoPaidCommission is a ledger entry, not cash out. If newestBankTransactionDate is more than ~3 days old, the bank sync is behind and this week\'s expenses are incomplete — say so instead of calling spending down.' });
    }

    case 'write_recommendation': {
      // Buffered (2026-11-23, per Dennis): all of a run's recommendations are filed as ONE weekly brief at the end.
      if (cache) { cache.recs = cache.recs || []; cache.recs.push({ priority: normalizePriority(input.priority), title: String(input.title || ''), body: String(input.body || '') }); return 'Saved.'; }
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

You run ONCE A WEEK (Monday morning) and file ONE weekly brief. Dennis found the old nightly reports unhelpful: too many, repetitive, and full of things he could not act on. This brief must be worth reading in two minutes.

Shape of the brief (write_recommendation calls, most valuable first, 3 to 5 total):
- FIRST call, always: title "This week in numbers", priority normal. Body = 3 to 5 short lines from get_week_summary comparing this week to last week: money in, money out (excluding the owner's auto-paid commission), new commissions locked, and the one number that moved most and why (name the merchant, customer or account). Say plainly if the bank sync is behind.
- Then 2 to 4 ACTIONS. Each one: title starts with a verb; body says what to do, the dollar amount at stake, who does it, and by when (a date this week or next). Only include an action if it is worth at least ~$100 or prevents a real problem.
- If nothing is worth acting on, write only the numbers block and add one line saying no action is needed this week.

Your analysis, in priority order:
1. WASTE — redundant subscriptions, creeping recurring charges, expense categories growing faster than revenue. Name the merchant and the annual cost.
2. TAX STRATEGY — use web_search for CURRENT-year rules before asserting any number (S-Corp reasonable salary vs distributions, accountable plans, home office, vehicle standard-mileage vs actual, Augusta rule §280A(g), QBI §199A, CA franchise tax, quarterly estimated payments). Cite what you found. Every tax recommendation ends with: "Verify with a licensed tax professional before filing."
3. MARGIN — jobs or business lines where COGS is eating the margin; commission exposure vs cash on hand.
4. CASH — outstanding customer balances worth chasing, mismatch between money owed out (reps, subs) and money coming in.
5. BOOKS HYGIENE — uncategorized/needs-review transactions piling up; months with income but no expense data (statements not uploaded).

Rules:
- Check get_recent_reports FIRST. Do NOT repeat an action from the last 4 weeks unless the dollar amount changed by more than ~10% or the situation changed; if you do repeat, say what changed. Never write a countdown/deadline nag more than once. Never more than 5 write_recommendation calls.
- Skip anything Dennis cannot act on this week, generic tax tips, and anything that needs more data you do not have. Tax ideas only when the books show a concrete trigger (e.g. a quarterly estimate is due within 3 weeks, net taken out with no salary), and only after web_search confirms the current rule.
- RECONCILE BEFORE YOU FLAG. Never ask Dennis to "confirm whether it's timing or real losses" — work it out yourself with the tools (get_pnl_snapshot cogsByAccount, ownerAutoPaidCommission, get_commissions_summary due-now vs not-yet-due) and state what the numbers show.
- The owner's (Dennis's) commission is auto-marked paid and lands in the same bank account — it is a ledger entry, not cash out. When you quote a margin, state whether it includes it, and prefer the *ExcludingOwnerAutoPaid figures. Do not call it a cash payout or compute payroll tax on it as if cash moved.
- Never say books are "closed" or "finalized" and never invent a close deadline — this system has no close step. A bucket of uncategorized transactions only affects the month it is dated in.
- Money coming in: only overrideIncomeDueNow is collectable. Never tell Dennis to "collect" the full locked override total, and never describe the cash gap using unpaidJobCostsAccruedVisitNotDone or suspectJobCostLines — those are not obligations. Quote customerBalancesOutstanding, unpaidJobCostsConfirmed, overrideIncomeDueNow and commissionsOwedToTeamNonOwner.
- Transfers to the owner's personal Chase (****1065) or to "Larsen,Dennis" are owner distributions (equity), not uncategorized expenses — recommend coding them as Shareholder Distributions.
- Quote counts exactly as the tools return them (needsReviewCountAllTime vs InWindow); never round or guess.
- If the books are empty or nothing material changed, write only the numbers block plus "no action needed this week" — never invent findings.
- Owner money: each month's "ownerEquity" shows takenOut, putIn and net. Judge distributions by the NET over the period, never the sum of monthly sizes. Owner transfers in from personal accounts are not income and not expenses; they reduce net distributions, and a net contribution means no distribution-vs-salary issue from those months. Flag a distribution-without-salary concern only when the cumulative net taken out is positive, and quote that net.
- Be specific: dollar amounts, merchant names, month names, exact next actions. No generic advice.
- You are not a licensed CPA or tax attorney and never present yourself as one.`;

exports.handler = async function () {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[finance-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    try { if (key) await supaInsert('agent_reports', { agent: 'finance', priority: 'urgent', title: 'Finance Agent Error — ANTHROPIC_KEY is not set in Netlify', body: 'The weekly finance advisor could not run because ANTHROPIC_KEY is missing.', action_url: null }, key); } catch (e) {}
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const cache = {};
    const DATA_TOOLS = TOOLS.filter(t => t.name !== 'write_recommendation').concat([WEB_SEARCH_TOOL]);
    const WRITE_TOOL = TOOLS.find(t => t.name === 'write_recommendation');

    const _fb = await require('./lib/agent-replies').loadFeedback('finance', key);
    const messages = [{
      role: 'user',
      content: _fb.text + `Run this week's financial review. Today is ${today}. Start with get_recent_reports and get_week_summary, then gather what you need from: get_pnl_snapshot, get_expense_breakdown, get_recurring_charges, get_commissions_summary, get_cash_position. Use web_search only where a tax rule or rate needs confirming.`
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
    messages.push({ role: 'user', content: 'You have the full picture. Write the weekly brief now with write_recommendation: first "This week in numbers", then 2 to 4 actions (verb title, dollar amount, who, by when), most valuable first. 5 calls maximum. If nothing needs action, write only the numbers block and say no action is needed this week.' });

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

    const recs = (cache && cache.recs) || [];
    if (recs.length) {
      const rank = { urgent: 0, high: 1, normal: 2 };
      // Keep the "This week in numbers" block first; rank the actions behind it.
      const nIdx = recs.findIndex(r => /in numbers/i.test(r.title));
      const numbers = nIdx > -1 ? recs.splice(nIdx, 1) : [];
      recs.sort((a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2));
      recs.unshift.apply(recs, numbers);
      const topPriority = recs.map(r => r.priority).sort((a, b) => (rank[a] ?? 2) - (rank[b] ?? 2))[0] || 'normal';
      const dayLabel = 'week of ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
      recs.splice(5);
      await supaInsert('agent_reports', {
        agent: 'finance', priority: topPriority,
        title: 'Weekly finance brief, ' + dayLabel + (recs.length > 1 ? ' — ' + (recs.length - (/in numbers/i.test(recs[0].title) ? 1 : 0)) + ' action(s)' : ' — no action needed'),
        body: recs.map((r, i) => (i + 1) + '. ' + r.title + (r.priority !== 'normal' ? ' [' + r.priority + ']' : '') + '\n' + r.body).join('\n\n'),
        action_url: null
      }, key);
    }
    if (recCount > 0) await sendAgentNotification('finance', 1);
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
