// Marketing Agent — runs every Monday ~7am PT (see netlify.toml)
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// Analyzes pipeline + spend, optimizes Google Ads, and generates strategic outreach
// recommendations (incl. CPUC/SDG&E orphaned account campaigns).

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
      const rows = await supaGet(
        '/customers?select=step,solar_status,lead_source,lead_category,sold_type,created_at,invoice_amount,address' +
        '&created_at=gte.' + since.toISOString() + '&limit=2000', key
      );
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
        '&lead_source=eq.referral&order=created_at.desc&limit=200', key
      );
      const converted = rows.filter(r => r.sold_type || (r.solar_status && r.solar_status !== 'ns_eval_canceled'));
      return JSON.stringify({ totalReferrals: rows.length, converted: converted.length, conversionRate: rows.length ? Math.round(converted.length / rows.length * 100) + '%' : '0%', records: rows.slice(0, 20) });
    }

    case 'get_zip_performance': {
      const since = new Date();
      since.setDate(since.getDate() - (input.days_back || 90));
      const rows = await supaGet(
        '/customers?select=address,sold_type,lead_category,lead_source,invoice_amount,created_at' +
        '&created_at=gte.' + since.toISOString() + '&limit=2000', key
      );
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

You run every Monday at 7am. Your job: analyze the pipeline and spend, then write specific, ready-to-execute marketing actions for this week.

FOUR MANDATORY FOCUS AREAS — write at least one recommendation for each:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. GOOGLE ADS OPTIMIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pull 30-day pipeline stats and 90-day zip performance. Then write a concrete Google Ads recommendation that includes ALL of the following:

KEYWORDS (with match types):
• Exact match: ["solar diagnostic san diego"], ["battery backup san diego"], ["sunpower monitoring"], etc.
• Phrase match: ["solar system not working"], ["solar monitoring", "battery storage"]
• Broad match modifier: solar repair, battery retrofit, solar diagnostic
• Negatives: -"diy", -"free", -"lease"

RESPONSIVE SEARCH AD (headline 30 chars max, description 90 chars max):
• Headline 1: [30 chars max]
• Headline 2: [30 chars max]
• Headline 3: [30 chars max]
• Description 1: [90 chars max]
• Description 2: [90 chars max]

GEO-TARGETING: List specific zip codes to target or exclude based on zip performance data.

BID ADJUSTMENTS: Suggest max CPC by intent level (diagnostic: $X, battery: $X, monitoring: $X).

AUDIENCES: Homeowners 35-65, HHI $100k+, solar interest, San Diego DMA.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. CPUC & SDG&E ORPHANED ACCOUNT OUTREACH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each week, write one high-priority recommendation with a COMPLETE, READY-TO-SEND letter for each of the following (two separate write_recommendation calls):

LETTER A — SDG&E Public Records Act Request:
Request the list of NEM/NEM2 interconnection accounts where the system installer's contractor license has lapsed or the company has filed for bankruptcy (specifically SunPower Corporation, which filed Chapter 11 in August 2024, and any other defunct installers). Under the California Public Records Act (Gov. Code §6250), SDG&E as a regulated utility must respond within 10 business days. Address to: SDG&E Legal/Regulatory Affairs, 8330 Century Park Ct, San Diego, CA 92123. Attention: Public Records Coordinator. Include FixMy.Energy contact info (fixmy.energy, Dennis Larsen).

LETTER B — CPUC Data Request:
Request aggregate and account-level NEM data for SDG&E territory from CPUC's Energy Division. Reference CPUC's NEM data reporting requirements. Contact: CPUC Energy Division, 505 Van Ness Ave, San Francisco, CA 94102. Email: energydivision@cpuc.ca.gov.

The goal: get a list of homeowners with orphaned solar systems (installed by SunPower, RGS Energy, and others that went bankrupt) in San Diego — these are ideal FixMy.Energy diagnostic and monitoring customers. Each letter should be complete and professional, ready to copy-paste and send.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. DIRECT MAIL & LOCAL CHANNELS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Based on zip performance, recommend specific zip codes for direct mail drops. Include: estimated homes to target, suggested headline ("Your solar system deserves better monitoring"), CTA, and whether to use Every Door Direct Mail (EDDM) or targeted list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. REFERRAL & RETENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Flag any referral incentives owed ($1K). Identify the top 3 referrers worth personally thanking this week to keep the flywheel going.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT FORMAT: Use write_recommendation for each item. Prioritize urgent items (dying channel, overdue incentive) first.`;

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
      content: 'Run your weekly marketing analysis. Today is ' + today + '. Use get_pipeline_stats (30 days), get_zip_performance (90 days), get_marketing_spend, and get_referral_stats. Then write recommendations for all four focus areas: Google Ads optimization, CPUC/SDG&E orphaned account outreach letters (two separate letters), direct mail, and referral actions. Use write_recommendation for every deliverable.'
    }];

    let turns = 0;
    let actionItemCount = 0;
    while (turns++ < 16) {
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
