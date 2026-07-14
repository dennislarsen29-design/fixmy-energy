// personal-consultant.js — the Financial Coach's Consultant Mode. A conversational
// endpoint that pressure-tests Dennis's ideas against his live personal financial
// picture + profile. Reads personal_* via service role, gated by PERSONAL_ACCESS_KEY.
// It thinks-with-him and challenges; it never executes anything and isn't licensed advice.
//
// POST { message, history:[{role,content}] } → { reply }

const P = require('./lib/personal');

const ASSET_TYPES = new Set(['checking', 'savings', 'investment', 'asset']);
const LIAB_TYPES = new Set(['credit', 'loan']);

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return P.reply(200, {});
  if (event.httpMethod !== 'POST') return P.reply(405, { reply: 'Method not allowed' });
  const gate = P.personalGate(event);
  if (!gate.ok) return P.reply(gate.code, { error: gate.error, reply: gate.error === 'personal_key_required' ? '🔒 Enter your personal access key to use the consultant.' : 'Forbidden' });
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) return P.reply(200, { reply: 'Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY in Netlify.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return P.reply(400, { reply: 'Bad JSON' }); }
  const message = body.message, history = body.history || [];
  if (!message) return P.reply(400, { reply: 'Missing message' });

  try {
    const [accounts, txns, debts, holdings, nw, profileRows] = await Promise.all([
      P.supaGet('/personal_accounts?select=name,type,current_balance&limit=500').catch(() => []),
      P.supaGet('/personal_transactions?select=amount,flow,category,txn_date&order=txn_date.desc&limit=1500').catch(() => []),
      P.supaGet('/personal_debts?select=name,type,balance,apr,min_payment&limit=200').catch(() => []),
      P.supaGet('/personal_holdings?select=symbol,name,market_value,asset_class&order=market_value.desc&limit=200').catch(() => []),
      P.supaGet('/personal_net_worth_snapshots?select=snap_date,net_worth&order=snap_date.desc&limit=6').catch(() => []),
      P.supaGet('/personal_profile?id=eq.default&select=*').catch(() => [])
    ]);
    const profile = (profileRows && profileRows[0]) || {};

    let assets = 0, liabilities = 0;
    accounts.forEach(a => { const v = parseFloat(a.current_balance) || 0; if (ASSET_TYPES.has(a.type)) assets += v; else if (LIAB_TYPES.has(a.type)) liabilities += Math.abs(v); });
    debts.forEach(d => { liabilities += Math.abs(parseFloat(d.balance) || 0); });
    const holdingsTotal = holdings.reduce((s, h) => s + (parseFloat(h.market_value) || 0), 0);

    // last full month cash flow
    const now = new Date(); const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const lmKey = lm.toISOString().slice(0, 7);
    let inc = 0, exp = 0; txns.forEach(t => { if (String(t.txn_date).slice(0, 7) !== lmKey) return; const a = parseFloat(t.amount) || 0; if (t.flow === 'income') inc += a; else if (t.flow === 'expense') exp += a; });

    const context = `PERSONAL FINANCIAL SNAPSHOT — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
Net worth: $${Math.round(assets - liabilities).toLocaleString()} (assets $${Math.round(assets).toLocaleString()}, liabilities $${Math.round(liabilities).toLocaleString()})
Investments: $${Math.round(holdingsTotal).toLocaleString()} across ${holdings.length} positions${holdings.length ? ' — top: ' + holdings.slice(0, 5).map(h => (h.symbol || h.name) + ' $' + Math.round(h.market_value || 0).toLocaleString()).join(', ') : ''}
Debts: ${debts.length ? debts.map(d => d.name + ' $' + Math.round(Math.abs(d.balance || 0)).toLocaleString() + (d.apr ? ' @' + d.apr + '%' : '')).join('; ') : 'none tracked'}
Last full month (${lmKey}): income $${Math.round(inc).toLocaleString()}, spending $${Math.round(exp).toLocaleString()}, net $${Math.round(inc - exp).toLocaleString()}
Net-worth trend: ${nw.length ? nw.slice().reverse().map(s => s.snap_date + ' $' + Math.round(s.net_worth).toLocaleString()).join(' → ') : 'no snapshots yet'}

PROFILE:
Risk tolerance: ${profile.risk_tolerance || '(not set)'}
Life context: ${profile.life_context || '(not set)'}
Skills/strengths: ${profile.skills || '(not set)'}
Past strategies that worked: ${profile.past_strategies || '(not set)'}
Decisions he's been avoiding: ${profile.avoided_decisions || '(not set)'}`;

    const system = `You are Dennis Larsen's personal financial consultant in "Consultant Mode" — a thinking partner he brings ideas to before he acts. This is his PERSONAL money, not his business.

Your job is to pressure-test, not to cheerlead. When he floats an idea:
- Ask the clarifying question that exposes the real assumption before you opine.
- Steelman it, then name the strongest objection and the actual risk in dollar terms against his real numbers below.
- Ground advice in his life context (divorce, career changes, reduced hours for his kids — real constraints, not permanent ceilings) and lean on his existing skills rather than proposing he reinvent himself.
- When you see an emotional blindspot or a decision he's been avoiding, name it directly and kindly.
- Be concise and specific. Use his real numbers. One sharp question beats five vague ones.

You never execute anything and you are not a licensed advisor — for investment/tax specifics, say "verify with a licensed professional."

${context}`;

    const messages = [...history.slice(-8), { role: 'user', content: message }];
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1200, system: system, messages: messages })
    });
    if (!resp.ok) throw new Error('Claude API error: ' + resp.status);
    const data = await resp.json();
    const reply = (data.content || []).find(b => b.type === 'text');
    return P.reply(200, { reply: (reply && reply.text) || 'No response.' });
  } catch (e) {
    console.error('[personal-consultant] Error:', e.message);
    return P.reply(200, { reply: 'Error: ' + e.message });
  }
};
