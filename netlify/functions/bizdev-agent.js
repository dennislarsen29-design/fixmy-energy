// BizDev Agent — runs every Tuesday ~7am PT (see netlify.toml)
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY
// Analyzes conversion rates, team performance, referral pipeline, and partnership
// opportunities. Writes sales + growth action items to the agent_reports table.

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

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
    body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 8192, thinking: { type: 'enabled', budget_tokens: 5000 }, system, tools, messages })
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
    name: 'write_action_item',
    description: 'Save a specific sales or business development action item to the admin Agent Inbox.',
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

    case 'write_action_item': {
      await supaInsert('agent_reports', {
        agent: 'bizdev', priority: input.priority || 'normal',
        title: input.title, body: input.body, action_url: null
      }, key);
      return 'Saved.';
    }

    default:
      return 'Unknown tool: ' + name;
  }
}

const SYSTEM = `You are the autonomous Business Development Agent for FixMy.Energy — a solar diagnostic, battery retrofit, and new solar company in San Diego, CA.

You run every Tuesday at 7am. Your job: find the highest-leverage actions the team can take this week to increase revenue, improve conversion, and accelerate growth.

Four focus areas:
1. STALLED LEADS — who can be re-engaged? Name specific people, what stage they're at, what the follow-up message should be.
2. CONVERSION GAPS — which stage is losing the most leads? What's the specific fix? (e.g., "12 leads are stuck at Step 3 Diagnostic — send them the savings estimate today")
3. REP PERFORMANCE — who needs coaching or recognition? Any reps going dark?
4. REFERRAL HEALTH — are referral incentives owed? Who are the top referrers worth doubling down on?

Use write_action_item for each finding. Be specific: name people, give the exact action, state the deadline and expected outcome.

Good example: "Re-engage 8 stalled Step 2 leads — call list: [names]. Script: 'Hey [Name], this is Dennis from FixMy.Energy — you booked an eval about 3 weeks ago. We had a cancellation and can get your full diagnostic done this Thursday at 10am. Does that work?' Expected: 2-3 re-bookings."

Do not write generic advice. Every action item must be something a specific person can do in the next 48 hours.`;

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[bizdev-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const messages = [{
      role: 'user',
      content: `Run your weekly business development analysis. Today is ${today}. Use all available tools — get_conversion_funnel, get_stalled_leads, get_rep_performance, get_referral_pipeline — then write your top action items using write_action_item.`
    }];

    let turns = 0;
    while (turns++ < 14) {
      const response = await callClaude(messages, TOOLS, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'end_turn') break;
      if (response.stop_reason !== 'tool_use') break;

      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[bizdev-agent] tool:', block.name);
          const result = await executeTool(block.name, block.input, key);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    console.log('[bizdev-agent] Done. Turns:', turns);
    return { statusCode: 200, body: 'BizDev agent completed' };
  } catch (e) {
    console.error('[bizdev-agent] Error:', e.message);
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
