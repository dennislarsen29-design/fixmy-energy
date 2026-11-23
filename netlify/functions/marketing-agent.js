// Marketing Agent — runs every Monday ~7am PT (see netlify.toml)
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// Analyzes pipeline + spend, optimizes Google Ads, and generates strategic outreach
// recommendations (incl. CPUC/SDG&E orphaned account campaigns).

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';
const { sendAgentNotification } = require('./lib/push');
const G = require('./lib/agent-guard');

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

function normalizePriority(p) {
  const s = (p || '').toLowerCase();
  if (s === 'urgent') return 'urgent';
  if (s === 'high' || s === 'medium') return 'high';
  return 'normal';
}

async function callClaude(messages, tools, system, toolChoice) {
  const body = { model: 'claude-opus-4-7', max_tokens: 8192, system, tools, messages };
  if (toolChoice) body.tool_choice = toolChoice;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Claude API error: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

const TOOLS = [
  {
    name: 'get_pipeline_stats',
    description: 'Get lead/job counts, revenue, and breakdowns by lead_source, lead_category, and sold_type for the given time window.',
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
    name: 'get_zip_performance',
    description: 'Analyze which zip codes are producing the most leads and jobs. Use this to drive Google Ads geo-targeting and direct mail decisions.',
    input_schema: {
      type: 'object',
      properties: { days_back: { type: 'number', description: 'Days to analyze (e.g. 90)' } },
      required: ['days_back']
    }
  },
  {
    name: 'write_recommendation',
    description: 'Save an actionable marketing recommendation to the admin Agent Inbox. Use for: Google Ads adjustments (include exact headlines/descriptions/keywords), CPUC/SDG&E outreach (include full letter template), direct mail campaigns, referral actions.',
    input_schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['urgent', 'high', 'normal'] },
        title: { type: 'string', description: 'Short headline, max 80 chars' },
        body: { type: 'string', description: 'Full recommendation. For Google Ads: include exact RSA headlines (30 chars max each), descriptions (90 chars max each), keywords, match types, bid strategy, and geo-targeting. For outreach letters: include the complete ready-to-send letter text.' },
        action_url: { type: 'string', description: 'Optional URL — e.g. Google Ads dashboard link' }
      },
      required: ['priority', 'title', 'body']
    }
  }
];

function extractZip(address) {
  if (!address) return null;
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

async function executeTool(name, input, key) {
  switch (name) {

    case 'get_pipeline_stats': {
      const since = new Date();
      since.setDate(since.getDate() - (input.days_back || 30));
      let rows = await supaGet(
        '/customers?select=step,solar_status,lead_source,lead_category,sold_type,created_at,invoice_amount,address' +
        '&created_at=gte.' + since.toISOString() + G.LIVE + '&limit=2000', key
      );
      rows = G.real(rows);
      const bySource = {};
      let leads = 0, jobs = 0, revenue = 0;
      rows.forEach(c => {
        const src = c.lead_source || 'unknown';
        if (!bySource[src]) bySource[src] = { leads: 0, jobs: 0 };
        if (c.sold_type) { bySource[src].jobs++; jobs++; revenue += parseFloat(c.invoice_amount) || 0; }
        else { bySource[src].leads++; leads++; }
      });
      const byType = {};
      rows.filter(r => r.sold_type).forEach(r => { byType[r.sold_type] = (byType[r.sold_type] || 0) + 1; });
      return JSON.stringify({ periodDays: input.days_back, totalLeads: leads, totalJobs: jobs, estimatedRevenue: Math.round(revenue), bySource, jobsByType: byType });
    }

    case 'get_marketing_spend': {
      const rows = await supaGet('/marketing_expenses?select=*&order=expense_date.desc', key);
      const total = rows.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      return JSON.stringify({ totalAllTime: Math.round(total), campaigns: rows });
    }

    case 'get_referral_stats': {
      const rows = await supaGet(
        '/customers?select=first_name,last_name,lead_source,referred_by,referral_incentive_paid,sold_type,solar_status,created_at' +
        '&lead_source=eq.referral&archived=not.is.true&order=created_at.desc&limit=200', key
      );
      const converted = rows.filter(r => r.sold_type || (r.solar_status && r.solar_status !== 'ns_eval_canceled'));
      return JSON.stringify({ totalReferrals: rows.length, converted: converted.length, conversionRate: rows.length ? Math.round(converted.length / rows.length * 100) + '%' : '0%', records: rows.slice(0, 20) });
    }

    case 'get_zip_performance': {
      const since = new Date();
      since.setDate(since.getDate() - (input.days_back || 90));
      let rows = await supaGet(
        '/customers?select=address,sold_type,lead_category,lead_source,invoice_amount,created_at' +
        '&created_at=gte.' + since.toISOString() + G.LIVE + '&limit=2000', key
      );
      rows = G.real(rows);
      const zips = {};
      rows.forEach(c => {
        const zip = extractZip(c.address);
        if (!zip) return;
        if (!zips[zip]) zips[zip] = { leads: 0, jobs: 0, revenue: 0, sources: {} };
        if (c.sold_type) {
          zips[zip].jobs++;
          zips[zip].revenue += parseFloat(c.invoice_amount) || 0;
        } else {
          zips[zip].leads++;
        }
        const src = c.lead_source || 'unknown';
        zips[zip].sources[src] = (zips[zip].sources[src] || 0) + 1;
      });
      // Sort by jobs desc, then leads desc
      const sorted = Object.entries(zips)
        .map(([zip, v]) => ({ zip, ...v, revenue: Math.round(v.revenue), jobRate: v.leads + v.jobs > 0 ? Math.round(v.jobs / (v.leads + v.jobs) * 100) + '%' : '0%' }))
        .sort((a, b) => b.jobs - a.jobs || b.leads - a.leads);
      return JSON.stringify({ periodDays: input.days_back, zipCount: sorted.length, topZips: sorted.slice(0, 20) });
    }

    case 'write_recommendation': {
      return await G.guardedInsert({
        agent: 'marketing', priority: normalizePriority(input.priority),
        title: input.title, body: input.body, action_url: input.action_url || null
      }, key, 'marketing');
    }

    default:
      return 'Unknown tool: ' + name;
  }
}

const SYSTEM = G.FACTS + `NOTE: the lead counts you receive are real, live leads only (cold-list/Black Box rows are excluded). Zip counts therefore show real demand, not mailing-list size.\n\n` + `You are the autonomous Marketing Agent for FixMy.Energy — a solar diagnostic, battery retrofit, and new solar installation company serving Southern California.

You run every Monday at 7am. Your job: analyze the pipeline and spend, then write specific, ready-to-execute marketing actions for this week.

FOCUS AREAS — write a recommendation only where the data supports one; skip an area rather than pad it:

1. PAID SEARCH / SOCIAL (advisory only; ad changes are made by the owner in S.U.N. and the Meta/Google tools, not by you)
Use 30-day pipeline stats and 90-day zip performance. If real data shows a zip or source clearly outperforming, say so with the counts. Suggest keyword themes and negative keywords if useful. Do NOT include prices, "flat-rate" offers, CSLB/BBB claims, a daily budget or max-CPC numbers. State which numbers came from a tool.

2. DIRECT MAIL & LOCAL CHANNELS
Based on LIVE-lead zip performance only, recommend at most one zip for an EDDM drop with the reasoning and the lead count. Do not infer demand from cold-list rows. Only recommend a zip you have not already recommended in the past 14 days (see recent reports).

3. RECORDS REQUESTS
Do NOT write SDG&E or CPUC records-request letters. SDG&E is a private utility (the Public Records Act does not apply) and the owner already has a CPUC request in progress.

4. REFERRALS
Referral payouts are automatic and handled in Payroll. Only note referral volume trends; never say an incentive is owed.

OUTPUT FORMAT: Use write_recommendation for each item. Prioritize by evidence. Do not file the same recommendation two weeks in a row.`;

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[marketing-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const DATA_TOOLS = TOOLS.filter(function(t) { return t.name !== 'write_recommendation'; });
    const WRITE_TOOL = TOOLS.find(function(t) { return t.name === 'write_recommendation'; });

    const _fb = await require('./lib/agent-replies').loadFeedback('marketing', key);
    const messages = [{
      role: 'user',
      content: _fb.text + 'Run your weekly marketing analysis. Today is ' + today + '. Use get_pipeline_stats (30 days), get_zip_performance (90 days), get_marketing_spend, and get_referral_stats to gather all the data you need.'
    }];

    // Phase 1: Data gathering only (write tool not available)
    let turns = 0;
    while (turns++ < 8) {
      const response = await callClaude(messages, DATA_TOOLS, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'end_turn') break;
      if (response.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[marketing-agent] data tool:', block.name);
          const result = await executeTool(block.name, block.input, key);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    // Phase 2: Write recommendations — always runs, tool_choice:any guarantees at least one write
    let actionItemCount = 0;
    messages.push({ role: 'user', content: 'You have all the data. Now write recommendations for all four focus areas using write_recommendation — one call per recommendation: (1) Google Ads optimization with full RSA copy/keywords/geo-targeting, (2) SDG&E Public Records Act letter, (3) CPUC data request letter, (4) Direct mail + referral actions.' });

    const wr1 = await callClaude(messages, [WRITE_TOOL], SYSTEM, { type: 'any' });
    messages.push({ role: 'assistant', content: wr1.content });
    const toolRes1 = [];
    for (const block of (wr1.content || [])) {
      if (block.type === 'tool_use') {
        console.log('[marketing-agent] write:', block.name);
        actionItemCount++;
        const r = await executeTool(block.name, block.input, key);
        toolRes1.push({ type: 'tool_result', tool_use_id: block.id, content: r });
      }
    }
    if (wr1.stop_reason === 'tool_use' && toolRes1.length > 0) {
      messages.push({ role: 'user', content: toolRes1 });
      let wt = 0;
      while (wt++ < 8) {
        const wr = await callClaude(messages, [WRITE_TOOL], SYSTEM);
        messages.push({ role: 'assistant', content: wr.content });
        if (wr.stop_reason !== 'tool_use') break;
        const res2 = [];
        for (const block of (wr.content || [])) {
          if (block.type === 'tool_use') {
            actionItemCount++;
            const r = await executeTool(block.name, block.input, key);
            res2.push({ type: 'tool_result', tool_use_id: block.id, content: r });
          }
        }
        messages.push({ role: 'user', content: res2 });
      }
    }

    if (actionItemCount > 0) await sendAgentNotification('marketing', actionItemCount);
    console.log('[marketing-agent] Done. Turns:', turns, 'Items:', actionItemCount);
    return { statusCode: 200, body: 'Marketing agent completed' };
  } catch (e) {
    console.error('[marketing-agent] Error:', e.message);
    try {
      await supaInsert('agent_reports', {
        agent: 'marketing', priority: 'urgent',
        title: 'Agent Error — ' + e.message.slice(0, 60),
        body: 'Error: ' + e.message + '\n\nCheck Netlify function logs for [marketing-agent].',
        action_url: null
      }, process.env.SUPA_SERVICE_KEY);
    } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};

// Shared with business-review-agent.js (2026-11-23): its read tools are reused there.
exports.TOOLS = TOOLS;
exports.executeTool = executeTool;
exports.SYSTEM = SYSTEM;
