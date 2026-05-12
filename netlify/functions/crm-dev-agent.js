// CRM Dev Agent — runs every Wednesday ~9am PT (see netlify.toml)
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// Audits data quality, identifies workflow gaps, and generates portal improvement
// tasks — written to the agent_reports table for the admin to review.

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
    name: 'write_task',
    description: 'Write a specific CRM improvement task or data fix to the admin Agent Inbox.',
    input_schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['urgent', 'high', 'normal'] },
        title: { type: 'string', description: 'Short task title' },
        body: { type: 'string', description: 'Detailed description: what the problem is, what data is affected (include IDs/names where useful), and exactly what action resolves it.' }
      },
      required: ['priority', 'title', 'body']
    }
  }
];

async function executeTool(name, input, key) {
  switch (name) {

    case 'audit_data_completeness': {
      const rows = await supaGet('/customers?select=id,first_name,last_name,phone,email,address,rep_id,sold_type,invoice_amount,invoice_status,lead_category,step,solar_status,assigned_ops&limit=2000', key);

      const issues = {
        missingPhone: [], missingEmail: [], missingAddress: [],
        soldJobMissingInvoice: [], soldJobMissingOps: [], missingRep: []
      };

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
        // FixMy job at step 6 (sold) but no invoice
        if (c.sold_type === 'battery_retrofit' && c.step === 6 && (!c.invoice_status || c.invoice_status === 'none'))
          anomalies.push({ record: label, issue: 'Step 6 (BR Sold) but invoice_status is none/missing' });
        // NS lead with sold_type but no solar_status in job phase
        if (c.lead_category === 'new_solar' && c.sold_type && (!c.solar_status || c.solar_status === 'ns_eval_booked'))
          anomalies.push({ record: label, issue: 'NS job with sold_type but solar_status still at eval stage' });
        // FixMy lead at step 0 with deposit collected
        if (c.deposit_status === 'paid' && (!c.step || c.step < 6))
          anomalies.push({ record: label, issue: 'Deposit paid but lead is at step ' + (c.step || 0) + ' (pre-sold)' });
      });

      return JSON.stringify({ anomalyCount: anomalies.length, anomalies: anomalies.slice(0, 20) });
    }

    case 'get_volume_trends': {
      const since = new Date();
      since.setDate(since.getDate() - 84); // 12 weeks
      const rows = await supaGet(
        '/customers?select=lead_category,sold_type,created_at&created_at=gte.' + since.toISOString() + '&limit=3000', key
      );
      // Bucket into weeks
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
      const jobs = await supaGet(
        '/customers?select=id,first_name,last_name,sold_type,lead_category,assigned_ops,ops_payout_status,deposit_status,ops_milestone1_status,install_date' +
        '&sold_type=not.is.null&lead_category=neq.new_solar&limit=500', key
      );
      const unassigned = jobs.filter(j => !j.assigned_ops);
      const byOps = {};
      jobs.filter(j => j.assigned_ops).forEach(j => {
        byOps[j.assigned_ops] = (byOps[j.assigned_ops] || 0) + 1;
      });
      const milestone1Unpaid = jobs.filter(j => j.deposit_status === 'paid' && j.ops_milestone1_status !== 'paid');
      return JSON.stringify({
        totalFixMyJobs: jobs.length,
        unassignedCount: unassigned.length,
        unassigned: unassigned.slice(0, 10).map(j => (j.first_name || '') + ' [' + j.id.slice(0, 8) + ']'),
        loadByOpsPartner: byOps,
        milestone1PaymentDue: milestone1Unpaid.length
      });
    }

    case 'write_task': {
      await supaInsert('agent_reports', {
        agent: 'crm-dev', priority: input.priority || 'normal',
        title: input.title, body: input.body, action_url: null
      }, key);
      return 'Saved.';
    }

    default:
      return 'Unknown tool: ' + name;
  }
}

const SYSTEM = `You are the autonomous CRM Development Agent for FixMy.Energy — a solar diagnostic, battery retrofit, and new solar company in San Diego, CA.

You run every Wednesday at 9am. Your job: audit the database and portal for data quality issues, workflow gaps, and improvement opportunities. You are not a vague consultant — you write specific, actionable dev/ops tasks.

Four focus areas:
1. DATA QUALITY — missing fields, inconsistent values, records that will cause problems later
2. PIPELINE ANOMALIES — records that don't make sense (paid deposit + step 1, job with no invoice, etc.)
3. OPERATIONAL GAPS — unassigned jobs, unpaid milestones, ops partner load imbalances
4. VOLUME TRENDS — week-over-week patterns that signal growth, slowdown, or seasonality

For each finding, write a task using write_task. Be specific:
- Name the affected records (use names + ID prefixes)
- State what's wrong and why it matters
- Give the exact fix action

Example of a good task: "3 battery retrofit jobs (John S. [a3b2c1d4], Maria R. [e5f6g7h8], Tom K. [i9j0k1l2]) are at Step 6 Sold but have invoice_status=none. This will break the invoice dashboard. Fix: open each record in the admin editor and set invoice_status + invoice_amount."

Example of a bad task: "Improve data entry processes."

Also flag any patterns in volume trends — e.g., "Leads dropped 40% the last 2 weeks — this may indicate the direct mail campaign ended or setter activity dropped."`;

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[crm-dev-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const messages = [{
      role: 'user',
      content: `Run your weekly CRM audit. Today is ${today}. Use audit_data_completeness, audit_pipeline_health, get_volume_trends, and get_ops_assignment_health — then write tasks for every significant finding using write_task.`
    }];

    let turns = 0;
    let actionItemCount = 0;
    while (turns++ < 14) {
      const response = await callClaude(messages, TOOLS, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'end_turn') break;
      if (response.stop_reason !== 'tool_use') break;

      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[crm-dev-agent] tool:', block.name);
          if (block.name === 'write_task') actionItemCount++;
          const result = await executeTool(block.name, block.input, key);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    // Forced write phase: if Claude analyzed data but never called write_task
    if (actionItemCount === 0 && messages.length > 2) {
      console.log('[crm-dev-agent] No items written — forcing write phase');
      messages.push({ role: 'user', content: 'You have all the data. Now call write_task for each finding — one call per task. Do not respond with text.' });
      const WRITE_TOOL = TOOLS.find(function(t){ return t.name === 'write_task'; });
      let wt = 0;
      while (wt++ < 8) {
        const wr = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 4096, system: SYSTEM, tools: [WRITE_TOOL], tool_choice: { type: 'any' }, messages })
        });
        const wrData = await wr.json();
        messages.push({ role: 'assistant', content: wrData.content });
        if (wrData.stop_reason !== 'tool_use') break;
        const res2 = [];
        for (const b of wrData.content) {
          if (b.type === 'tool_use') {
            actionItemCount++;
            const result = await executeTool(b.name, b.input, key);
            res2.push({ type: 'tool_result', tool_use_id: b.id, content: result });
          }
        }
        messages.push({ role: 'user', content: res2 });
      }
    }

    if (actionItemCount > 0) await sendAgentNotification('crm dev', actionItemCount);
    console.log('[crm-dev-agent] Done. Turns:', turns, 'Items:', actionItemCount);
    return { statusCode: 200, body: 'CRM Dev agent completed' };
  } catch (e) {
    console.error('[crm-dev-agent] Error:', e.message);
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
