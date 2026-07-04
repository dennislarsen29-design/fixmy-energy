// SEO Agent — runs every Thursday ~8am PT (see netlify.toml), or on demand via
// run-agent-background.js?agent=seo.
// Reads the seo_metrics / seo_queries data pulled by seo-insights.js plus lead
// attribution from the customers table, and writes prioritized, concrete SEO
// recommendations to the admin Agent Inbox (agent_reports, agent='seo').
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY

const SUPA_URL  = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

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

async function callClaude(messages, tools, system) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 8192, system, tools, messages })
  });
  if (!resp.ok) throw new Error('Claude API error: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

const DATA_TOOLS = [
  {
    name: 'get_seo_metrics',
    description: 'Daily Search Console metrics (clicks, impressions, CTR, avg position) plus GA4 sessions/conversions where available, for the last N days. Sorted oldest → newest.',
    input_schema: { type: 'object', properties: { days_back: { type: 'number', description: 'e.g. 90' } }, required: ['days_back'] }
  },
  {
    name: 'get_top_queries',
    description: 'Latest weekly snapshot of top search queries and top pages with clicks, impressions, CTR, and position.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_lead_outcomes',
    description: 'Lead counts from the last 30 days grouped by lead_source and utm_source, showing which channels produce actual pipeline.',
    input_schema: { type: 'object', properties: {} }
  }
];

const WRITE_TOOL = {
  name: 'write_recommendation',
  description: 'Save one actionable SEO recommendation to the admin Agent Inbox. Be concrete: name the exact page/query, the exact change, and the expected effect. One call per recommendation, max 5 per run, most important first.',
  input_schema: {
    type: 'object',
    properties: {
      priority: { type: 'string', enum: ['urgent', 'high', 'normal'] },
      title:    { type: 'string', description: 'Short imperative headline' },
      body:     { type: 'string', description: 'The recommendation: what to change, why, expected outcome. Plain text.' },
      action_url: { type: 'string', description: 'Optional URL (page to edit, GSC report, etc.)' }
    },
    required: ['priority', 'title', 'body']
  }
};

async function runTool(name, input, key) {
  switch (name) {
    case 'get_seo_metrics': {
      const days = Math.min(input.days_back || 90, 400);
      const since = new Date(); since.setUTCDate(since.getUTCDate() - days);
      const rows = await supaGet('/seo_metrics?date=gte.' + since.toISOString().slice(0, 10) + '&order=date.asc&limit=400', key);
      return rows.length ? JSON.stringify(rows) : 'No data yet — seo-insights.js has not pulled Search Console data (GSC_SERVICE_ACCOUNT may not be configured).';
    }
    case 'get_top_queries': {
      const latest = await supaGet('/seo_queries?select=date&order=date.desc&limit=1', key);
      if (!latest.length) return 'No query snapshots yet.';
      const rows = await supaGet('/seo_queries?date=eq.' + latest[0].date + '&order=clicks.desc&limit=80', key);
      return JSON.stringify(rows);
    }
    case 'get_lead_outcomes': {
      const since = new Date(); since.setUTCDate(since.getUTCDate() - 30);
      const rows = await supaGet('/customers?select=lead_source,utm_source,sold_type,partial_capture&created_at=gte.' + since.toISOString() + '&limit=2000', key);
      const agg = {};
      rows.forEach(r => {
        const k = (r.lead_source || 'unknown') + ' / ' + (r.utm_source || 'no-utm');
        agg[k] = agg[k] || { leads: 0, partials: 0, sold: 0 };
        agg[k].leads++;
        if (r.partial_capture) agg[k].partials++;
        if (r.sold_type) agg[k].sold++;
      });
      return JSON.stringify(agg);
    }
    case 'write_recommendation':
      await supaInsert('agent_reports', {
        agent: 'seo', priority: normalizePriority(input.priority),
        title: input.title, body: input.body, action_url: input.action_url || null
      }, key);
      return 'Saved.';
    default:
      return 'Unknown tool: ' + name;
  }
}

const SYSTEM = `You are the SEO analyst for Solar Review (domain fixmy.energy), a San Diego solar repair / diagnostics / battery retrofit company.

Context you must factor in:
- July 2026: organic traffic previously dropped. Search Console showed NO manual actions and NO security issues — the drop was algorithmic. On 2026-07-04 the likely causes were removed from the live site: a hidden off-screen keyword block, unverifiable aggregateRating schema, 814KB page weight (now ~131KB HTML), and a sitemap/robots.txt were added. Recovery is expected to be gradual as Google recrawls.
- Site structure: one main page (/) plus 7 orphaned-installer pages (/sunpower /titan /sunnova /sullivan /petersen-dean /sungevity /mosaic — served by check-preview.html with per-installer titles + FAQ schema) and /careers. /book is a noindexed ads lander.
- Strategy: own "orphaned solar installer" queries (SunPower/Titan/Sunnova bankruptcies), solar repair symptom queries, and battery-retrofit + SGIP/SDCP rebate queries in San Diego County.
- The business goal is booked evaluations, not traffic. Weigh queries by commercial intent.

Each week: pull the data, compare the recent period to the prior one, and write 2-5 concrete recommendations via write_recommendation (most important first). Good recommendations name a specific page, query, or metric and a specific change ("write a page targeting X — it gets N impressions at position 40 with no dedicated page", "title of /sunpower truncated in SERPs, shorten to ...", "CTR on query X is 1.2% at position 4 — rewrite the meta description"). If data is missing or too thin to analyze, write ONE 'normal' recommendation explaining exactly what setup step is missing and stop.`;

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.log('seo-agent: ANTHROPIC_KEY / SUPA_SERVICE_KEY not set — skipping');
    return { statusCode: 200, body: JSON.stringify({ skipped: 'missing env vars' }) };
  }

  const today = new Date().toISOString().slice(0, 10);
  const messages = [{
    role: 'user',
    content: 'Run your weekly SEO analysis. Today is ' + today + '. Gather data with get_seo_metrics (90 days), get_top_queries, and get_lead_outcomes, then write your recommendations.'
  }];

  try {
    let turns = 0, wrote = 0;
    const tools = DATA_TOOLS.concat([WRITE_TOOL]);
    while (turns++ < 10) {
      const response = await callClaude(messages, tools, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        if (block.name === 'write_recommendation') wrote++;
        let out;
        try { out = await runTool(block.name, block.input, key); }
        catch (e) { out = 'Tool error: ' + e.message; }
        results.push({ type: 'tool_result', tool_use_id: block.id, content: String(out).slice(0, 40000) });
      }
      messages.push({ role: 'user', content: results });
    }
    console.log('seo-agent: done —', wrote, 'recommendations written');
    return { statusCode: 200, body: JSON.stringify({ ok: true, recommendations: wrote }) };
  } catch (e) {
    console.error('seo-agent:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
