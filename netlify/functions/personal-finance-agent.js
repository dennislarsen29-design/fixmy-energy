// Personal Financial Coach — Dennis's private AI financial advisor. Runs nightly
// (netlify.toml) after the personal Plaid sync, and on demand via
// run-agent-background?agent=personal_coach. Reads ONLY the personal_* tables
// (never the business books), researches current strategy/tax with web search,
// and writes advisor-grade recommendations to personal_coach_reports (a
// service-role-only table, NOT the anon-readable business agent_reports inbox) —
// surfaced in the Coach view.
//
// It recommends and pressure-tests; it NEVER executes trades or mutates any
// account, and it is not a licensed advisor. Investment/tax items carry a
// "verify with a licensed professional" disclaimer.

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';
let sendAgentNotification = async () => {};
try { ({ sendAgentNotification } = require('./lib/push')); } catch (e) {}

async function supaGet(path, key) {
  const resp = await fetch(SUPA_REST + path, { headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' } });
  if (!resp.ok) throw new Error('Supabase GET failed: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}
async function supaInsert(table, row, key) {
  const resp = await fetch(SUPA_REST + '/' + table, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!resp.ok) throw new Error('Supabase INSERT failed: ' + resp.status + ' ' + await resp.text());
}
function normalizePriority(p) { const s = (p || '').toLowerCase(); if (s === 'urgent') return 'urgent'; if (s === 'high' || s === 'medium') return 'high'; return 'normal'; }
function monthKey(d) { return String(d || '').slice(0, 7); }

async function callClaude(messages, tools, system, toolChoice) {
  const body = { model: 'claude-sonnet-5', max_tokens: 8192, system, tools, messages };
  if (toolChoice) body.tool_choice = toolChoice;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    // web_search server tool requires the anthropic-beta header (see finance-agent.js).
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Claude API error: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

async function buildBooks(key) {
  const [accounts, txns, debts, holdings, nw, profile] = await Promise.all([
    supaGet('/personal_accounts?select=*&limit=500', key).catch(() => []),
    supaGet('/personal_transactions?select=txn_date,amount,flow,category,merchant,description&order=txn_date.desc&limit=4000', key).catch(() => []),
    supaGet('/personal_debts?select=*&limit=200', key).catch(() => []),
    supaGet('/personal_holdings?select=*&limit=1000', key).catch(() => []),
    supaGet('/personal_net_worth_snapshots?select=*&order=snap_date.asc&limit=1000', key).catch(() => []),
    supaGet('/personal_profile?id=eq.default&select=*', key).catch(() => [])
  ]);
  return { accounts, txns, debts, holdings, nw, profile: (profile && profile[0]) || {} };
}

const ASSET_TYPES = new Set(['checking', 'savings', 'investment', 'asset']);
const LIAB_TYPES = new Set(['credit', 'loan']);
function netWorth(b) {
  let assets = 0, liabilities = 0; const byType = {};
  b.accounts.forEach(a => { const v = parseFloat(a.current_balance) || 0; if (ASSET_TYPES.has(a.type)) { assets += v; byType[a.type] = (byType[a.type] || 0) + v; } else if (LIAB_TYPES.has(a.type)) { liabilities += Math.abs(v); byType[a.type] = (byType[a.type] || 0) + Math.abs(v); } });
  b.debts.forEach(d => { if (!d.linked_account_id) liabilities += Math.abs(parseFloat(d.balance) || 0); });
  return { assets: Math.round(assets), liabilities: Math.round(liabilities), netWorth: Math.round(assets - liabilities), byType };
}

const TOOLS = [
  { name: 'get_net_worth', description: 'Current assets, liabilities, net worth, breakdown by account type, and the net-worth trend (each recorded snapshot). The single most important state of the picture.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_cash_flow', description: 'Monthly income vs. spending by category over the last N months, plus savings rate — what is actually moving net worth up or down each month.', input_schema: { type: 'object', properties: { months_back: { type: 'number' } } } },
  { name: 'get_holdings', description: 'Brokerage/Schwab positions with allocation by asset class, largest positions, and concentration (any single holding as a % of the portfolio). Use to flag unnecessary risk.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_debts', description: 'All liabilities with balance, APR, minimum payment and rough payoff horizon — the debt paydown picture.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_profile', description: 'The owner\'s onboarding profile: risk tolerance, life context, personal skills, past strategies that worked, and the financial decisions he has been avoiding. Ground every recommendation in this.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_recent_reports', description: 'Your own personal-coach reports from the last 7 days — check before writing so you do not repeat yourself.', input_schema: { type: 'object', properties: {} } },
  { name: 'write_recommendation', description: 'Save one coaching recommendation. One call per distinct finding.', input_schema: { type: 'object', properties: {
      title: { type: 'string', description: 'Short, specific headline, lead with the lever, e.g. "Move your idle $18k cash into a HYSA — ~$800/yr you\'re leaving on the table"' },
      body: { type: 'string', description: 'What the data shows, why it matters given his life context and skills, the exact next action, and $ impact. Name emotional blindspots or self-sabotaging patterns directly when the data shows them. For investment/tax items end with: "This is educational, not licensed advice — verify with a licensed professional."' },
      priority: { type: 'string', description: 'urgent | high | normal' } }, required: ['title', 'body'] } }
];

async function executeTool(name, input, key, cache) {
  if (!cache.b) cache.b = await buildBooks(key);
  const b = cache.b;
  switch (name) {
    case 'get_net_worth': {
      const nw = netWorth(b);
      const trend = b.nw.map(s => ({ date: s.snap_date, net_worth: s.net_worth }));
      return JSON.stringify({ current: nw, trend, snapshots: trend.length });
    }
    case 'get_cash_flow': {
      const mb = Math.min(Math.max(parseInt(input.months_back, 10) || 6, 1), 24);
      const since = new Date(); since.setMonth(since.getMonth() - mb);
      const months = {};
      b.txns.forEach(t => { if (new Date(t.txn_date) < since) return; const m = monthKey(t.txn_date); months[m] = months[m] || { income: 0, expense: 0, byCat: {} }; const amt = parseFloat(t.amount) || 0; if (t.flow === 'income') months[m].income += amt; else if (t.flow === 'expense') { months[m].expense += amt; months[m].byCat[t.category || 'Uncategorized'] = (months[m].byCat[t.category || 'Uncategorized'] || 0) + amt; } });
      Object.values(months).forEach(m => { m.savingsRate = m.income > 0 ? Math.round((1 - m.expense / m.income) * 100) : null; m.income = Math.round(m.income); m.expense = Math.round(m.expense); });
      return JSON.stringify(months);
    }
    case 'get_holdings': {
      const total = b.holdings.reduce((s, h) => s + (parseFloat(h.market_value) || 0), 0) || 1;
      const byClass = {}; b.holdings.forEach(h => { const c = h.asset_class || 'other'; byClass[c] = (byClass[c] || 0) + (parseFloat(h.market_value) || 0); });
      const positions = b.holdings.map(h => ({ symbol: h.symbol, name: h.name, value: Math.round(parseFloat(h.market_value) || 0), pctOfPortfolio: Math.round((parseFloat(h.market_value) || 0) / total * 1000) / 10 })).sort((a, c) => c.value - a.value);
      const allocation = Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, Math.round(v / total * 1000) / 10]));
      return JSON.stringify({ totalValue: Math.round(total), allocationPctByClass: allocation, positions: positions.slice(0, 40), largestConcentrationPct: positions[0] ? positions[0].pctOfPortfolio : 0 });
    }
    case 'get_debts':
      return JSON.stringify(b.debts.map(d => ({ name: d.name, type: d.type, balance: Math.abs(parseFloat(d.balance) || 0), apr: d.apr, min_payment: d.min_payment })));
    case 'get_profile':
      return JSON.stringify({ onboarded: !!b.profile.onboarded, risk_tolerance: b.profile.risk_tolerance || null, life_context: b.profile.life_context || null, skills: b.profile.skills || null, past_strategies: b.profile.past_strategies || null, avoided_decisions: b.profile.avoided_decisions || null, monthly_income: b.profile.monthly_income, monthly_savings: b.profile.monthly_savings, data: b.profile.data || null });
    case 'get_recent_reports': {
      const since = new Date(); since.setDate(since.getDate() - 7);
      return JSON.stringify(await supaGet('/personal_coach_reports?select=title,created_at&created_at=gte.' + since.toISOString() + '&order=created_at.desc&limit=30', key));
    }
    case 'write_recommendation':
      await supaInsert('personal_coach_reports', { priority: normalizePriority(input.priority), title: input.title, body: input.body }, key);
      return 'Saved.';
    default: return 'Unknown tool: ' + name;
  }
}

const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };

const SYSTEM = `You are the personal Financial Coach for Dennis Larsen — an individual, NOT his business (never touch or reference Solar Review Corp's books). You run daily. You are a proactive coach and consultant, not a reporter.

Ground EVERYTHING in his profile (get_profile first): his risk tolerance, his life context (a divorce, career changes, and deliberately reduced working hours to be present for his children have shifted what's possible — treat these as real constraints on time and cash flow, but never as permanent ceilings on what he can build), his personal skills (build strategies that lean on existing strengths — never ones that require reinventing himself or distracting from current commitments), and the financial decisions he's told you he's been avoiding.

Each run, in priority order:
1. RISK — flag allocations or positions that introduce unnecessary risk relative to his whole picture (concentration in one holding, cash drag, high-APR debt outrunning investment returns). Name the specific position and the fix.
2. GROWTH LEVERS — the highest-leverage moves to grow net worth faster given his actual situation. Idle cash that should be earning, savings-rate wins, tax-advantaged accounts he isn't using. Use web_search for CURRENT-year rules/rates before asserting numbers (IRA/Roth/solo-401k limits, HYSA rates, cap-gains, CA specifics). Cite what you found.
3. BEHAVIOR — when the data shows an emotional blindspot or self-sabotaging pattern (lifestyle creep after income drops, avoidance of a decision he named, drifting from a system he set), name it directly and kindly. Don't work around it.
4. ACCOUNTABILITY — if he set a system/target and is drifting, say so with the number.

Rules:
- Check get_recent_reports FIRST; don't repeat a recommendation from the last 7 days unless the numbers moved materially.
- If the picture is quiet or the profile isn't filled in yet, write ONE brief note (prompt him to complete onboarding if get_profile shows onboarded=false). Never invent findings.
- Be specific: dollar amounts, position names, exact next actions.
- You never execute trades and never present yourself as a licensed advisor. Investment/tax items end with: "This is educational, not licensed advice — verify with a licensed professional."`;

exports.handler = async function () {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) { console.error('[personal-coach] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY'); return { statusCode: 200, body: 'Missing env vars' }; }
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const cache = {};
    const DATA_TOOLS = TOOLS.filter(t => t.name !== 'write_recommendation').concat([WEB_SEARCH_TOOL]);
    const WRITE_TOOL = TOOLS.find(t => t.name === 'write_recommendation');
    const messages = [{ role: 'user', content: `Run today's personal financial review. Today is ${today}. Start with get_profile and get_recent_reports, then get_net_worth, get_cash_flow, get_holdings, get_debts. Use web_search only to confirm a current rule or rate.` }];

    let turns = 0;
    while (turns++ < 12) {
      const response = await callClaude(messages, DATA_TOOLS, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') { const r = await executeTool(block.name, block.input, key, cache); results.push({ type: 'tool_result', tool_use_id: block.id, content: r }); }
      }
      if (!results.length) break;
      messages.push({ role: 'user', content: results });
    }

    let recCount = 0;
    messages.push({ role: 'user', content: 'You have the full picture. Write your recommendations now with write_recommendation — one call per finding, most valuable first. If nothing material changed, write the single brief note.' });
    const wr1 = await callClaude(messages, [WRITE_TOOL], SYSTEM, { type: 'any' });
    messages.push({ role: 'assistant', content: wr1.content });
    const tr1 = [];
    for (const block of (wr1.content || [])) { if (block.type === 'tool_use') { recCount++; tr1.push({ type: 'tool_result', tool_use_id: block.id, content: await executeTool(block.name, block.input, key, cache) }); } }
    if (wr1.stop_reason === 'tool_use' && tr1.length) {
      messages.push({ role: 'user', content: tr1 });
      let wt = 0;
      while (wt++ < 6) {
        const wr = await callClaude(messages, [WRITE_TOOL], SYSTEM);
        messages.push({ role: 'assistant', content: wr.content });
        if (wr.stop_reason !== 'tool_use') break;
        const res2 = [];
        for (const block of (wr.content || [])) { if (block.type === 'tool_use') { recCount++; res2.push({ type: 'tool_result', tool_use_id: block.id, content: await executeTool(block.name, block.input, key, cache) }); } }
        messages.push({ role: 'user', content: res2 });
      }
    }
    if (recCount > 0) { try { await sendAgentNotification('personal_coach', recCount); } catch (e) {} }
    console.log('[personal-coach] Done. Recommendations:', recCount);
    return { statusCode: 200, body: 'Personal coach completed' };
  } catch (e) {
    console.error('[personal-coach] Error:', e.message);
    try { await supaInsert('personal_coach_reports', { priority: 'urgent', title: 'Personal Coach Error — ' + e.message.slice(0, 60), body: 'Error: ' + e.message }, process.env.SUPA_SERVICE_KEY); } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
