// Marketing Agent — runs every Monday ~7am PT (see netlify.toml)
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// Analyzes the past 30 days of pipeline + marketing spend, writes actionable
// recommendations to the agent_reports table (visible in portal Agents tab).

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';
const { sendAgentNotification } = require('./lib/push');

async function supaGet(path, key) {
  const resp = await fetch(SUPA_REST + path, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  });
  if (!resp.ok) throw new Error('Supabase GET ' + path + ' failed: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

async function supaInsert(table, row, key) {
  const resp = await fetch(SUPA_REST + '/' + table, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  });
  if (!resp.ok) throw new Error('Supabase INSERT ' + table + ' failed: ' + resp.status + ' ' + await resp.text());
}

async function callClaude(messages, tools, system) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 8192, system, tools, messages })
  });
  if (!resp.ok) throw new Error('Claude API error: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

const TOOLS = [
  {
    name: 'get_pipeline_stats',
    description: 'Get lead/job counts, revenue, and breakdowns by lead_source, lead_category, step, and solar_status for the given time window.',
    input_schema: {
      type: 'object',
      properties: { days_back: { type: 'number', description: 'How many days to look back (e.g. 30, 90)' } },
      required: ['days_back']
    }
  },
  {
    name: 'get_marketing_spend',
    description: 'Get all marketing expense records — campaign names, zip codes targeted, amounts, and dates.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_referral_stats',
    description: 'Get referral lead data: who referred whom, incentive status, and conversion outcome.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'write_recommendation',
    description: 'Save an actionable marketing recommendation to the admin Agent Inbox.',
    input_schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['urgent', 'high', 'normal'] },
        title: { type: 'string', description: 'Short headline, max 80 chars' },
        body: { type: 'string', description: 'Full recommendation with specific details, rationale, suggested copy/channels/zip codes/budget. Be concrete.' },
        action_url: { type: 'string', description: 'Optional URL to a tool or resource (e.g. Canva, Google Ads)' }
      },
      required: ['priority', 'title', 'body']
    }
  }
];

async function executeTool(name, input, key) {
  switch (name) {

    case 'get_pipeline_stats': {
      const since = new Date();
      since.setDate(since.getDate() - (input.days_back || 30));
      const rows = await supaGet(
        '/customers?select=step,solar_status,lead_source,lead_category,sold_type,created_at,invoice_amount,deposit_status,address' +
        '&created_at=gte.' + since.toISOString() + '&limit=2000', key
      );
      const bySource = {}, byStage = {};
      let leads = 0, jobs = 0, revenue = 0;
      rows.forEach(c => {
        const src = c.lead_source || 'unknown';
        bySource[src] = (bySource[src] || { leads: 0, jobs: 0 });
        if (c.sold_type) { bySource[src].jobs++; jobs++; revenue += parseFloat(c.invoice_amount) || 0; }
        else { bySource[src].leads++; leads++; }
        const stage = c.sold_type ? ('job:' + c.sold_type) : ('lead:step' + (c.step || 0));
        byStage[stage] = (byStage[stage] || 0) + 1;
      });
      return JSON.stringify({ periodDays: input.days_back, totalLeads: leads, totalJobs: jobs, estimatedRevenue: Math.round(revenue), bySource, byStage });
    }

    case 'get_marketing_spend': {
      const rows = await supaGet('/marketing_expenses?select=*&order=expense_date.desc', key);
      const total = rows.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      return JSON.stringify({ totalAllTime: Math.round(total), campaigns: rows });
    }

    case 'get_referral_stats': {
      const rows = await supaGet(
        '/customers?select=first_name,last_name,lead_source,referred_by,referral_incentive_paid,sold_type,solar_status,created_at' +
        '&lead_source=eq.referral&order=created_at.desc&limit=200', key
      );
      const converted = rows.filter(r => r.sold_type || (r.solar_status && r.solar_status !== 'ns_eval_canceled'));
      return JSON.stringify({ totalReferrals: rows.length, converted: converted.length, conversionRate: rows.length ? Math.round(converted.length / rows.length * 100) + '%' : '0%', records: rows });
    }

    case 'write_recommendation': {
      await supaInsert('agent_reports', {
        agent: 'marketing', priority: input.priority || 'normal',
        title: input.title, body: input.body, action_url: input.action_url || null
      }, key);
      return 'Saved.';
    }

    default:
      return 'Unknown tool: ' + name;
  }
}

const SYSTEM = `You are the autonomous Marketing Agent for FixMy.Energy — a solar diagnostic, battery retrofit, and new solar installation company based in San Diego, CA.

You run every Monday at 7am. Your job: analyze what drove leads and revenue over the past month, then surface the 3–5 highest-impact marketing moves for this week.

Step 1 — Gather data: Pull 30-day pipeline stats, all marketing spend, and referral data.
Step 2 — Analyze: Which sources are converting? Which are dead? What hasn't been tried? What's the cost-per-lead by channel?
Step 3 — Recommend: Write 3–5 specific, actionable items using write_recommendation.

Requirements for each recommendation:
• Be SPECIFIC — include zip codes, ad copy drafts, subject lines, budget numbers, timing
• State the RATIONALE — why this opportunity exists now
• State the EXPECTED OUTCOME — "X leads at ~$Y cost per lead"

Good example: "Launch Nextdoor ads in 91910/91911 this week — your last 3 Chula Vista jobs are there. Suggested headline: 'Your neighbor just cut their bill 60%. Here's how.' Budget: $150/week. Expected: 4-6 inbound leads in 10 days."
Bad example: "Consider improving social media presence."

Prioritize urgent items (e.g., a lead source that's dropped to zero, a campaign with negative ROI) first.`;

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[marketing-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const messages = [{
      role: 'user',
      content: 'Run your weekly marketing analysis. Today is ' + today + '. Use get_pipeline_stats, get_marketing_spend, and get_referral_stats to gather data, then call write_recommendation for each actionable finding.'
    }];

    let turns = 0;
    let actionItemCount = 0;
    while (turns++ < 12) {
      const response = await callClaude(messages, TOOLS, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'end_turn') break;
      if (response.stop_reason !== 'tool_use') break;

      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[marketing-agent] tool:', block.name, JSON.stringify(block.input).slice(0, 120));
          if (block.name === 'write_recommendation') actionItemCount++;
          const result = await executeTool(block.name, block.input, key);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    if (actionItemCount > 0) await sendAgentNotification('marketing', actionItemCount);
    console.log('[marketing-agent] Done. Turns used:', turns, 'Items:', actionItemCount);
    return { statusCode: 200, body: 'Marketing agent completed' };
  } catch (e) {
    console.error('[marketing-agent] Error:', e.message);
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
