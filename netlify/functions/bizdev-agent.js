// BizDev Agent — runs every Tuesday ~7am PT (see netlify.toml)
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// Analyzes conversion rates, team performance, referral pipeline, data quality,
// pipeline anomalies, and ops health. Writes action items to the agent_reports table.

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
    name: 'get_conversion_funnel',
    description: 'Get lead-to-job conversion rates by stage, source, and rep for both FixMy and New Solar pipelines.',
    input_schema: {
      type: 'object',
      properties: { days_back: { type: 'number', description: 'Days to analyze' } },
      required: ['days_back']
    }
  },
  {
    name: 'get_stalled_leads',
    description: 'Find leads and jobs that appear stuck — created/updated long ago but not closed or progressed. These are re-engagement opportunities.',
    input_schema: {
      type: 'object',
      properties: { stale_days: { type: 'number', description: 'Consider a lead stalled if not updated in this many days' } },
      required: ['stale_days']
    }
  },
  {
    name: 'get_rep_performance',
    description: 'Get lead counts and job conversion by rep/setter for the last 30 days.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_referral_pipeline',
    description: 'Get all referral-source leads and their conversion status. Shows who is referring, which referrals converted, and where the $1K incentive is owed.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'audit_data_completeness',
    description: 'Check how many records are missing key fields (phone, email, address, rep assignment, invoice amount on sold jobs, etc.). Returns counts and sample IDs.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'audit_pipeline_health',
    description: 'Find anomalies in the pipeline — records with inconsistent field combinations, jobs missing financial data, leads with impossible stage combinations.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_volume_trends',
    description: 'Get weekly lead and job volume for the past 12 weeks to identify growth, decline, or seasonal patterns.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_ops_assignment_health',
    description: 'Check which jobs are missing ops partner assignment, which ops partners have the most/least load, and any milestone payment gaps.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'write_action_item',
    description: 'Save a specific sales, business development, or CRM action item to the admin Agent Inbox.',
    input_schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['urgent', 'high', 'normal'] },
        title: { type: 'string', description: 'Short headline, max 80 chars' },
        body: { type: 'string', description: 'Detailed action item with who should do what, by when, and the expected outcome. Include customer names/IDs where relevant.' }
      },
      required: ['priority', 'title', 'body']
    }
  }
];

async function executeTool(name, input, key) {
  switch (name) {

    case 'get_conversion_funnel': {
      const since = new Date();
      since.setDate(since.getDate() - (input.days_back || 60));
      const rows = await supaGet(
        '/customers?select=step,solar_status,lead_source,lead_category,sold_type,rep_id,setter_name,created_at,lead_temp' +
        '&created_at=gte.' + since.toISOString() + '&limit=2000', key
      );

      // FixMy funnel
      const fm = rows.filter(r => r.lead_category !== 'new_solar');
      const fmSteps = {};
      fm.forEach(c => { const s = c.step || 0; fmSteps[s] = (fmSteps[s] || 0) + 1; });
      const fmJobs = fm.filter(c => !!c.sold_type).length;
      const fmConvRate = fm.length ? Math.round(fmJobs / fm.length * 100) + '%' : '0%';

      // NS funnel
      const ns = rows.filter(r => r.lead_category === 'new_solar');
      const nsStatuses = {};
      ns.forEach(c => { const s = c.solar_status || 'ns_eval_booked'; nsStatuses[s] = (nsStatuses[s] || 0) + 1; });
      const nsJobs = ns.filter(c => !!c.sold_type).length;
      const nsConvRate = ns.length ? Math.round(nsJobs / ns.length * 100) + '%' : '0%';

      // By source
      const bySrc = {};
      rows.forEach(c => {
        const src = c.lead_source || 'unknown';
        if (!bySrc[src]) bySrc[src] = { leads: 0, jobs: 0 };
        if (c.sold_type) bySrc[src].jobs++; else bySrc[src].leads++;
      });

      return JSON.stringify({
        periodDays: input.days_back,
        fixmy: { total: fm.length, jobs: fmJobs, conversionRate: fmConvRate, byStep: fmSteps },
        newSolar: { total: ns.length, jobs: nsJobs, conversionRate: nsConvRate, byStatus: nsStatuses },
        byLeadSource: bySrc
      });
    }

    case 'get_stalled_leads': {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (input.stale_days || 14));
      // Get leads (not jobs) that were created before cutoff and are still in early stages
      const rows = await supaGet(
        '/customers?select=id,first_name,last_name,phone,email,step,solar_status,lead_category,sold_type,lead_source,rep_id,setter_name,created_at,lead_temp' +
        '&sold_type=is.null&created_at=lte.' + cutoff.toISOString() +
        '&order=created_at.asc&limit=100', key
      );
      // Filter to non-dead stages
      const alive = rows.filter(r => {
        if (r.lead_category === 'new_solar') return r.solar_status !== 'ns_eval_canceled' && r.solar_status !== 'ns_welcome_dead' && r.solar_status !== 'ns_call_dead';
        return r.step !== 7; // step 7 = Not Sold / Dead
      });
      return JSON.stringify({
        count: alive.length,
        leads: alive.slice(0, 30).map(r => ({
          id: r.id,
          name: r.first_name + ' ' + (r.last_name || ''),
          phone: r.phone,
          category: r.lead_category,
          stage: r.step || r.solar_status || 'unknown',
          source: r.lead_source,
          rep: r.setter_name || r.rep_id,
          createdAt: r.created_at,
          temp: r.lead_temp
        }))
      });
    }

    case 'get_rep_performance': {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const rows = await supaGet(
        '/customers?select=rep_id,setter_name,sold_type,lead_category,created_at' +
        '&created_at=gte.' + since.toISOString() + '&limit=2000', key
      );
      const byRep = {};
      rows.forEach(c => {
        const rep = c.setter_name || c.rep_id || 'unassigned';
        if (!byRep[rep]) byRep[rep] = { leads: 0, jobs: 0 };
        if (c.sold_type) byRep[rep].jobs++; else byRep[rep].leads++;
      });
      return JSON.stringify({ periodDays: 30, byRep });
    }

    case 'get_referral_pipeline': {
      const rows = await supaGet(
        '/customers?select=id,first_name,last_name,lead_source,referred_by,referral_incentive_paid,sold_type,solar_status,lead_category,created_at' +
        '&lead_source=eq.referral&order=created_at.desc&limit=200', key
      );
      const incentiveDue = rows.filter(r =>
        (r.solar_status === 'ns_pto' || r.sold_type) && !r.referral_incentive_paid
      );
      return JSON.stringify({
        total: rows.length,
        converted: rows.filter(r => r.sold_type).length,
        incentiveDue: incentiveDue.length,
        incentiveDueNames: incentiveDue.map(r => r.first_name + ' ' + (r.last_name || '') + ' (referred by: ' + (r.referred_by || '?') + ')'),
        all: rows.slice(0, 20)
      });
    }

    case 'audit_data_completeness': {
      const rows = await supaGet('/customers?select=id,first_name,last_name,phone,email,address,rep_id,sold_type,invoice_amount,invoice_status,lead_category,step,solar_status,assigned_ops&limit=2000', key);
      const issues = { missingPhone: [], missingEmail: [], missingAddress: [], soldJobMissingInvoice: [], soldJobMissingOps: [], missingRep: [] };
      rows.forEach(c => {
        const label = (c.first_name || '?') + ' ' + (c.last_name || '') + ' [' + c.id.slice(0, 8) + ']';
        if (!c.phone) issues.missingPhone.push(label);
        if (!c.email) issues.missingEmail.push(label);
        if (!c.address) issues.missingAddress.push(label);
        if (c.sold_type && (!c.invoice_amount || c.invoice_amount === '0')) issues.soldJobMissingInvoice.push(label);
        if (c.sold_type && !c.assigned_ops && c.lead_category !== 'new_solar') issues.soldJobMissingOps.push(label);
        if (!c.rep_id) issues.missingRep.push(label);
      });
      return JSON.stringify({
        totalRecords: rows.length,
        missingPhone: { count: issues.missingPhone.length, samples: issues.missingPhone.slice(0, 5) },
        missingEmail: { count: issues.missingEmail.length, samples: issues.missingEmail.slice(0, 5) },
        missingAddress: { count: issues.missingAddress.length, samples: issues.missingAddress.slice(0, 5) },
        soldJobMissingInvoice: { count: issues.soldJobMissingInvoice.length, samples: issues.soldJobMissingInvoice.slice(0, 10) },
        soldJobMissingOps: { count: issues.soldJobMissingOps.length, samples: issues.soldJobMissingOps.slice(0, 10) },
        missingRep: { count: issues.missingRep.length }
      });
    }

    case 'audit_pipeline_health': {
      const rows = await supaGet('/customers?select=id,first_name,last_name,lead_category,sold_type,step,solar_status,invoice_status,deposit_status&limit=2000', key);
      const anomalies = [];
      rows.forEach(c => {
        const label = (c.first_name || '?') + ' ' + (c.last_name || '') + ' [' + c.id.slice(0, 8) + ']';
        if (c.sold_type === 'battery_retrofit' && c.step === 6 && (!c.invoice_status || c.invoice_status === 'none'))
          anomalies.push({ record: label, issue: 'Step 6 (BR Sold) but invoice_status is none/missing' });
        if (c.lead_category === 'new_solar' && c.sold_type && (!c.solar_status || c.solar_status === 'ns_eval_booked'))
          anomalies.push({ record: label, issue: 'NS job with sold_type but solar_status still at eval stage' });
        if (c.deposit_status === 'paid' && (!c.step || c.step < 6))
          anomalies.push({ record: label, issue: 'Deposit paid but lead is at step ' + (c.step || 0) + ' (pre-sold)' });
      });
      return JSON.stringify({ anomalyCount: anomalies.length, anomalies: anomalies.slice(0, 20) });
    }

    case 'get_volume_trends': {
      const since = new Date();
      since.setDate(since.getDate() - 84);
      const rows = await supaGet('/customers?select=lead_category,sold_type,created_at&created_at=gte.' + since.toISOString() + '&limit=3000', key);
      const weeks = {};
      rows.forEach(c => {
        const d = new Date(c.created_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const wk = weekStart.toISOString().slice(0, 10);
        if (!weeks[wk]) weeks[wk] = { leads: 0, jobs: 0 };
        if (c.sold_type) weeks[wk].jobs++; else weeks[wk].leads++;
      });
      const sorted = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0]));
      return JSON.stringify({ weeks: sorted.map(([wk, v]) => ({ week: wk, ...v })) });
    }

    case 'get_ops_assignment_health': {
      const jobs = await supaGet('/customers?select=id,first_name,last_name,sold_type,lead_category,assigned_ops,ops_payout_status,deposit_status,ops_milestone1_status,install_date&sold_type=not.is.null&lead_category=neq.new_solar&limit=500', key);
      const unassigned = jobs.filter(j => !j.assigned_ops);
      const byOps = {};
      jobs.filter(j => j.assigned_ops).forEach(j => { byOps[j.assigned_ops] = (byOps[j.assigned_ops] || 0) + 1; });
      const milestone1Unpaid = jobs.filter(j => j.deposit_status === 'paid' && j.ops_milestone1_status !== 'paid');
      return JSON.stringify({
        totalFixMyJobs: jobs.length,
        unassignedCount: unassigned.length,
        unassigned: unassigned.slice(0, 10).map(j => (j.first_name || '') + ' [' + j.id.slice(0, 8) + ']'),
        loadByOpsPartner: byOps,
        milestone1PaymentDue: milestone1Unpaid.length
      });
    }

    case 'write_action_item': {
      await supaInsert('agent_reports', {
        agent: 'bizdev', priority: (input.priority || 'normal').toLowerCase(),
        title: input.title, body: input.body, action_url: null
      }, key);
      return 'Saved.';
    }

    default:
      return 'Unknown tool: ' + name;
  }
}

const SYSTEM = `You are the autonomous Business Development + CRM Agent for FixMy.Energy — a solar diagnostic, battery retrofit, and new solar company in San Diego, CA.

You run every Tuesday at 7am. Your job: find the highest-leverage actions the team can take this week across two domains — sales/growth AND data/operations health.

SALES & GROWTH (use get_conversion_funnel, get_stalled_leads, get_rep_performance, get_referral_pipeline):
1. STALLED LEADS — who can be re-engaged? Name specific people, what stage they're at, what the follow-up message should be.
2. CONVERSION GAPS — which stage is losing the most leads? What's the specific fix?
3. REP PERFORMANCE — who needs coaching or recognition? Any reps going dark?
4. REFERRAL HEALTH — are referral incentives owed? Who are the top referrers worth doubling down on?

CRM & OPS HEALTH (use audit_data_completeness, audit_pipeline_health, get_volume_trends, get_ops_assignment_health):
5. DATA QUALITY — missing fields, inconsistent values that will cause problems later. Name the specific records.
6. PIPELINE ANOMALIES — records that don't make sense (deposit paid + step 1, job with no invoice, etc.).
7. OPS GAPS — unassigned jobs, unpaid milestones, ops partner load imbalances.
8. VOLUME TRENDS — week-over-week patterns signaling growth or slowdown.

Use write_action_item for every finding. Be specific: name people and record IDs, give the exact action, state the deadline and expected outcome. Do not write generic advice.`;

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[bizdev-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const DATA_TOOLS = TOOLS.filter(function(t) { return t.name !== 'write_action_item'; });
    const WRITE_TOOL = TOOLS.find(function(t) { return t.name === 'write_action_item'; });

    const messages = [{
      role: 'user',
      content: `Run your weekly business development and CRM audit. Today is ${today}. Use all data tools: get_conversion_funnel, get_stalled_leads, get_rep_performance, get_referral_pipeline, audit_data_completeness, audit_pipeline_health, get_volume_trends, and get_ops_assignment_health.`
    }];

    // Phase 1: Data gathering only (write tool not available)
    let turns = 0;
    while (turns++ < 12) {
      const response = await callClaude(messages, DATA_TOOLS, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'end_turn') break;
      if (response.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[bizdev-agent] data tool:', block.name);
          const result = await executeTool(block.name, block.input, key);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    // Phase 2: Write action items — always runs, tool_choice:any guarantees at least one write
    let actionItemCount = 0;
    messages.push({ role: 'user', content: 'You have all the data. Write your top action items now using write_action_item — one call per item. Name specific people, give the exact action, state the deadline and expected outcome.' });

    const wr1 = await callClaude(messages, [WRITE_TOOL], SYSTEM, { type: 'any' });
    messages.push({ role: 'assistant', content: wr1.content });
    const toolRes1 = [];
    for (const block of (wr1.content || [])) {
      if (block.type === 'tool_use') {
        console.log('[bizdev-agent] write:', block.name);
        actionItemCount++;
        const r = await executeTool(block.name, block.input, key);
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
            actionItemCount++;
            const r = await executeTool(block.name, block.input, key);
            res2.push({ type: 'tool_result', tool_use_id: block.id, content: r });
          }
        }
        messages.push({ role: 'user', content: res2 });
      }
    }

    if (actionItemCount > 0) await sendAgentNotification('bizdev', actionItemCount);
    console.log('[bizdev-agent] Done. Turns:', turns, 'Action items:', actionItemCount);
    return { statusCode: 200, body: 'BizDev agent completed' };
  } catch (e) {
    console.error('[bizdev-agent] Error:', e.message);
    try {
      await supaInsert('agent_reports', {
        agent: 'bizdev', priority: 'urgent',
        title: 'Agent Error — ' + e.message.slice(0, 60),
        body: 'Error: ' + e.message + '\n\nCheck Netlify function logs for [bizdev-agent].',
        action_url: null
      }, process.env.SUPA_SERVICE_KEY);
    } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
