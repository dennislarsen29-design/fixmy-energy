// Weekly Business Review agent (2026-11-23, per Dennis) — replaces the separate Marketing (Mon), BizDev (Tue)
// and CRM Dev agents, which reviewed the same pipeline data three times a week (47 reports in 30 days) on Opus 4.7.
// One run a week on Sonnet 5.5, reusing the read tools of marketing-agent.js and bizdev-agent.js (bizdev's four
// data-health tools were byte-for-byte the CRM Dev agent's). Files at most MAX_ITEMS findings to agent_reports
// (agent 'review'), most valuable first. Dennis's inbox replies to any of the old three agents still steer it.
// Manual: run-agent-background?agent=review (also reached via marketing / bizdev / crm-dev).
const M = require('./marketing-agent');
const B = require('./bizdev-agent');
const G = require('./lib/agent-guard');
const { sendAgentNotification } = require('./lib/push');
let feedback = { loadFeedback: async function () { return { text: '', ids: [] }; } };
try { feedback = require('./lib/agent-replies'); } catch (e) {}

const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const MODEL = 'claude-sonnet-5-5';
const MAX_ITEMS = 8;

const M_READ = M.TOOLS.filter(t => !/^write_/.test(t.name));
const B_READ = B.TOOLS.filter(t => !/^write_/.test(t.name) && !M_READ.some(m => m.name === t.name));
const WRITE_TOOL = {
  name: 'write_finding',
  description: 'File one finding for Dennis. Call once per finding, most valuable first. At most ' + MAX_ITEMS + ' per run.',
  input_schema: {
    type: 'object',
    required: ['area', 'priority', 'title', 'body'],
    properties: {
      area: { type: 'string', enum: ['sales', 'marketing', 'operations', 'data', 'portal'], description: 'sales = leads/reps/conversion; marketing = channels/zips/spend; operations = jobs, ops partners, payments; data = record quality; portal = a CRM feature or workflow gap' },
      priority: { type: 'string', enum: ['urgent', 'high', 'normal'] },
      title: { type: 'string', description: 'Under 90 characters, says the action' },
      body: { type: 'string', description: 'What the data shows (with the actual counts or names), the exact action, who does it, and by when.' }
    }
  }
};

const SYSTEM = G.FACTS + `NOTE: lead counts are real, live leads only (cold-list/Black Box rows are excluded).

You are the weekly Business Review for FixMy.Energy / Solar Review (solar diagnostics, repair, battery retrofits, new solar through partners). You replace three older agents (marketing, business development, CRM). Once a week, find the few highest-leverage actions across:
- SALES: stalled leads worth a follow-up (name them), the stage losing the most leads, rep coaching or recognition.
- MARKETING: which sources and zips actually produce live leads and jobs; at most one EDDM zip, only if the data supports it. Advisory only: never give ad budgets, bids, prices or "flat-rate" offers.
- OPERATIONS: unassigned jobs, ops-partner load, unpaid milestones.
- DATA & PORTAL: records that will cause problems (name them), and at most one portal improvement worth building.

Rules: write a finding only where the data supports it; skip an area rather than pad it. No more than ${MAX_ITEMS} findings. Do not repeat a finding from the last 4 weeks (listed below) unless it got worse; then say what changed. Do not write SDG&E/CPUC records-request letters. Referral payouts are automatic (Payroll); never say one is owed. Be specific: names, record ids, counts, the exact action, a deadline.`;

async function recentFindings(key) {
  try {
    const since = new Date(Date.now() - 28 * 86400000).toISOString();
    const r = await fetch(SB + '/agent_reports?agent=in.(review,marketing,bizdev,crm-dev)&created_at=gte.' + since + '&select=agent,title,created_at&order=created_at.desc&limit=60', { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    const rows = r.ok ? await r.json() : [];
    return rows.map(x => '- ' + String(x.created_at).slice(0, 10) + ' [' + x.agent + '] ' + x.title).join('\n') || 'none';
  } catch (e) { return 'unknown'; }
}
async function insertReport(row, key) {
  const r = await fetch(SB + '/agent_reports', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error('agent_reports insert ' + r.status + ' ' + (await r.text()).slice(0, 160));
}
async function callClaude(messages, tools) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 12000, system: SYSTEM, tools, messages })
  });
  if (!r.ok) throw new Error('Claude API error: ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

exports.handler = async function () {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) { console.error('[business-review] missing env'); return { statusCode: 200, body: 'Missing env' }; }
  const filed = [];
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let fbText = '';
    for (const a of ['review', 'marketing', 'bizdev', 'crm-dev']) { const f = await feedback.loadFeedback(a, key); fbText += f.text; }
    const tools = M_READ.concat(B_READ, [WRITE_TOOL]);
    const messages = [{ role: 'user', content: fbText + 'Run the weekly business review. Today is ' + today + '.\n\nFINDINGS FROM THE LAST 4 WEEKS (do not repeat):\n' + await recentFindings(key) + '\n\nUse the data tools first (pipeline stats, marketing spend, zip performance, conversion funnel, stalled leads, rep performance, referral pipeline, data completeness, pipeline health, volume trends, ops assignment health), then file your findings with write_finding.' }];
    let nudged = false;
    for (let turn = 0; turn < 24; turn++) {
      const resp = await callClaude(messages, tools);
      messages.push({ role: 'assistant', content: resp.content });
      if (resp.stop_reason !== 'tool_use') {
        if (!filed.length && !nudged) { nudged = true; messages.push({ role: 'user', content: 'Now file your findings with write_finding (most valuable first). If truly nothing needs action, file one normal-priority finding saying so and why.' }); continue; }
        break;
      }
      const results = [];
      for (const b of resp.content || []) {
        if (b.type !== 'tool_use') continue;
        let out;
        try {
          if (b.name === 'write_finding') {
            if (filed.length >= MAX_ITEMS) out = 'Limit reached; stop filing.';
            else {
              const i = b.input || {};
              const pr = ['urgent', 'high', 'normal'].indexOf(i.priority) > -1 ? i.priority : 'normal';
              await insertReport({ agent: 'review', priority: pr, title: '[' + (i.area || 'review') + '] ' + String(i.title || '').slice(0, 120), body: String(i.body || ''), action_url: null }, key);
              filed.push(i.title); out = 'Saved.';
            }
          } else if (M_READ.some(t => t.name === b.name)) out = await M.executeTool(b.name, b.input || {}, key);
          else if (B_READ.some(t => t.name === b.name)) out = await B.executeTool(b.name, b.input || {}, key);
          else out = 'Unknown tool';
        } catch (e) { out = 'Tool error: ' + e.message; }
        results.push({ type: 'tool_result', tool_use_id: b.id, content: typeof out === 'string' ? out : JSON.stringify(out) });
      }
      messages.push({ role: 'user', content: results });
    }
    if (filed.length) { try { await sendAgentNotification('review', filed.length); } catch (e) {} }
    console.log('[business-review] filed', filed.length);
    return { statusCode: 200, body: 'Business review filed ' + filed.length };
  } catch (e) {
    console.error('[business-review]', e.message);
    try { await insertReport({ agent: 'review', priority: 'urgent', title: 'Business Review error — ' + e.message.slice(0, 60), body: 'Error: ' + e.message + (filed.length ? '\n\n' + filed.length + ' findings were filed before the error.' : ''), action_url: null }, key); } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
