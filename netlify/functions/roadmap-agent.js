// Roadmap Agent — the business-growth strategist for the Roadmap board.
// Runs weekly (see netlify.toml; also manually via run-agent-background?agent=roadmap).
//
// What it does: reads the business model, the live growth metrics, and the current
// roadmap, uses web_search for current solar-industry growth tactics, then AUTO-ADDS
// new growth tasks straight onto the board (roadmap_items, source='ai', status='todo')
// — each with a ready-to-paste Claude prompt so Dennis can act immediately. It also
// files a short summary into the Agent Inbox (agent_reports, agent='roadmap').
//
// It deliberately does NOT mark existing items done — shipped-status is reconciled at
// ship time (whoever ships a roadmap item flips its row) + Dennis's one-tap Done.
//
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY.

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

let sendAgentNotification;
try { sendAgentNotification = require('./lib/push').sendAgentNotification; }
catch (e) { sendAgentNotification = async function(){}; }

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

function callClaude(messages, tools, system, toolChoice) {
  const body = { model: 'claude-sonnet-5', max_tokens: 8192, system, tools, messages };
  if (toolChoice) body.tool_choice = toolChoice;
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      // Required for the web_search server tool — without it the whole call 500s.
      'anthropic-beta': 'web-search-2025-03-05'
    },
    body: JSON.stringify(body)
  }).then(async function(resp) {
    if (!resp.ok) throw new Error('Claude API error: ' + resp.status + ' ' + await resp.text());
    return resp.json();
  });
}

const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 4 };

const GROUPS = ['marketing', 'social', 'crm', 'finance', 'staff', 'future', 'growth-ai'];

// Existing roadmap titles, lowercased — used to dedupe new proposals.
let _existingTitles = new Set();

const DATA_TOOLS = [
  {
    name: 'get_business_model',
    description: 'Read the current business model (services & pricing, revenue projections, key metrics targets) that Dennis maintains in the portal.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_current_roadmap',
    description: 'Read the current roadmap: every item with its title, status, group, and source. Use this to avoid proposing anything that already exists or is already done.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_growth_metrics',
    description: 'Get live growth signals: weekly lead/job volume for the last 8 weeks, total recorded revenue, and the latest social follower/reach numbers.',
    input_schema: { type: 'object', properties: {} }
  }
];

const ADD_TASK_TOOL = {
  name: 'add_roadmap_task',
  description: 'Add a NEW growth task to the roadmap board (it appears immediately for Dennis). Only add genuinely new, specific, high-leverage tasks — never duplicate an existing roadmap item.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short, specific task title (e.g. "Launch a Google LSA campaign for orphaned SunPower leads").' },
      description: { type: 'string', description: 'One or two sentences: what to build/do and the growth rationale (why it moves the business).' },
      group: { type: 'string', enum: GROUPS, description: 'Best-fit group. Use growth-ai if it does not cleanly fit the others.' },
      effort: { type: 'string', enum: ['quick', 'medium', 'large'], description: 'quick = <15 min / a config change; medium = a few hours; large = half-day+.' },
      priority: { type: 'integer', description: '1 (highest) to 5 (lowest), by leverage vs effort.' },
      dennis_action: { type: 'string', description: 'Optional — a step only Dennis can do outside Claude (create an account, share an ID, set a budget). Omit if none.' },
      prompt: { type: 'string', description: 'A ready-to-paste Claude Code prompt that implements this task: context + explicit steps + "commit and push". Written so Dennis can paste it into a fresh session and get a working result.' }
    },
    required: ['title', 'description', 'group', 'effort', 'priority', 'prompt']
  }
};

const WRITE_REPORT_TOOL = {
  name: 'write_report',
  description: 'File a short summary of this week\'s roadmap analysis into the Agent Inbox.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body: { type: 'string', description: 'What you found and what you added this week — the tasks proposed and why, in a few sentences.' }
    },
    required: ['title', 'body']
  }
};

function slugify(s) {
  return String(s || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

async function executeTool(name, input, key) {
  switch (name) {

    case 'get_business_model': {
      const rows = await supaGet('/business_model_data?select=section_key,data', key);
      const bm = {};
      rows.forEach(function(r) { bm[r.section_key] = r.data; });
      return JSON.stringify({
        services: bm.services || null,
        projections: bm.projections || null,
        metrics: bm.metrics || null
      }).slice(0, 6000);
    }

    case 'get_current_roadmap': {
      const rows = await supaGet('/roadmap_items?select=key,title,status,group_key,source,effort,priority', key);
      _existingTitles = new Set(rows.map(function(r){ return String(r.title || '').toLowerCase().trim(); }));
      return JSON.stringify(rows.map(function(r){
        return { title: r.title, status: r.status, group: r.group_key, source: r.source };
      }));
    }

    case 'get_growth_metrics': {
      const out = {};
      try {
        const since = new Date(); since.setDate(since.getDate() - 56);
        const rows = await supaGet('/customers?select=lead_category,sold_type,created_at&created_at=gte.' + since.toISOString() + '&limit=3000', key);
        const weeks = {};
        rows.forEach(function(c) {
          const d = new Date(c.created_at), ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
          const wk = ws.toISOString().slice(0, 10);
          if (!weeks[wk]) weeks[wk] = { leads: 0, jobs: 0 };
          if (c.sold_type) weeks[wk].jobs++; else weeks[wk].leads++;
        });
        out.weeklyVolume = Object.entries(weeks).sort(function(a,b){ return a[0].localeCompare(b[0]); }).map(function(e){ return Object.assign({ week: e[0] }, e[1]); });
      } catch (e) { out.weeklyVolume = 'unavailable'; }
      try {
        const pays = await supaGet('/payments?select=amount,category&limit=2000', key);
        out.totalRecordedRevenue = pays.reduce(function(s, p){ return s + (parseFloat(p.amount) || 0); }, 0);
      } catch (e) { out.totalRecordedRevenue = 'unavailable'; }
      try {
        const sm = await supaGet('/social_metrics?select=followers,reach,captured_at&order=captured_at.desc&limit=2', key);
        out.social = sm && sm[0] ? sm[0] : 'none';
      } catch (e) { out.social = 'unavailable'; }
      return JSON.stringify(out);
    }

    case 'add_roadmap_task': {
      const title = String(input.title || '').trim();
      if (!title) return 'Skipped — empty title.';
      if (_existingTitles.has(title.toLowerCase())) return 'Skipped — a roadmap item with this title already exists.';
      const grp = GROUPS.indexOf(input.group) >= 0 ? input.group : 'growth-ai';
      const row = {
        key: 'ai-' + slugify(title) + '-' + Date.now().toString(36).slice(-4),
        title: title,
        description: input.description || null,
        dennis_action: input.dennis_action || null,
        group_key: grp,
        status: 'todo',
        priority: Math.min(Math.max(parseInt(input.priority, 10) || 3, 1), 5),
        effort: ['quick','medium','large'].indexOf(input.effort) >= 0 ? input.effort : 'medium',
        prompt: input.prompt || null,
        source: 'ai',
        sort: 100,
        checked: false
      };
      await supaInsert('roadmap_items', row, key);
      _existingTitles.add(title.toLowerCase());
      return 'Added: ' + title;
    }

    case 'write_report': {
      await supaInsert('agent_reports', {
        agent: 'roadmap', priority: 'normal',
        title: input.title || 'Weekly roadmap update',
        body: input.body || '', action_url: '/business-model.html?t=fixmybp26#roadmap'
      }, key);
      return 'Report filed.';
    }

    default: return 'Unknown tool: ' + name;
  }
}

const SYSTEM = `You are the Roadmap & Growth Strategist for Solar Review (internal name FixMy.Energy) — a solar diagnostic, battery-retrofit, and new-solar company in San Diego / Southern California. Also active: a Top Tier and a New Solar sales line (rep + manager-override comp).

You run weekly. Your job: study the business and ADD a few genuinely new, high-leverage growth tasks to the roadmap — the kind of moves that bring in leads, close more jobs, add recurring revenue, or recruit reps. Each task you add appears instantly on Dennis's board with the copy-paste Claude prompt you write, so he can implement it in minutes.

Process:
1. Read get_business_model, get_current_roadmap, and get_growth_metrics.
2. Use web_search to check CURRENT (this-year) solar growth tactics, orphaned-installer opportunities (SunPower/Titan/Sunnova aftermarket), local-SEO/LSA trends, and battery-retrofit demand signals in California. Ground your ideas in what's actually working now.
3. Add 2–4 NEW tasks with add_roadmap_task. Rules:
   - NEVER duplicate an existing roadmap item (you have the full list) or re-add something already done.
   - Be specific and buildable, not vague. "Build a /sunpower-repair landing page with a orphaned-system checklist + book CTA" — not "improve marketing."
   - Favor high-leverage / low-effort first (mark effort honestly: quick/medium/large).
   - Write a real, paste-ready Claude Code prompt for each: context (files, tables, env vars this repo uses), explicit numbered steps, and end with "commit and push". Match how this codebase works — single-file portal.html, Netlify functions, Supabase.
   - If a step needs Dennis personally (an account, an API key, a budget), put it in dennis_action.
4. Finish with write_report summarizing what you added and why.

Quality bar: every task should be something that, if done, plausibly grows revenue or pipeline. If you can only think of one strong idea this week, add one — do not pad with filler.`;

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[roadmap-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const messages = [{
      role: 'user',
      content: 'Run your weekly roadmap review. Today is ' + today + '. Gather the business model, current roadmap, and growth metrics; web_search current solar growth tactics; then add 2–4 new high-leverage tasks and file your report.'
    }];

    // Phase 1 — gather + research (data tools + web_search, no writes)
    let turns = 0;
    while (turns++ < 8) {
      const response = await callClaude(messages, DATA_TOOLS.concat([WEB_SEARCH_TOOL]), SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name !== 'web_search') {
          console.log('[roadmap-agent] data tool:', block.name);
          const r = await executeTool(block.name, block.input, key);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: r });
        }
      }
      if (!results.length) break; // only server-side web_search ran this turn
      messages.push({ role: 'user', content: results });
    }

    // Phase 2 — write tasks + report (force at least one write)
    let added = 0;
    messages.push({ role: 'user', content: 'Now add your new roadmap tasks with add_roadmap_task (one call each), then call write_report. Do not duplicate anything already on the board.' });
    const WRITE_TOOLS = [ADD_TASK_TOOL, WRITE_REPORT_TOOL];
    let wt = 0;
    let forced = { type: 'any' };
    while (wt++ < 8) {
      const wr = await callClaude(messages, WRITE_TOOLS, SYSTEM, forced);
      forced = undefined; // only force the first write turn
      messages.push({ role: 'assistant', content: wr.content });
      if (wr.stop_reason !== 'tool_use') break;
      const res = [];
      for (const block of (wr.content || [])) {
        if (block.type === 'tool_use') {
          if (block.name === 'add_roadmap_task') added++;
          console.log('[roadmap-agent] write:', block.name);
          const r = await executeTool(block.name, block.input, key);
          res.push({ type: 'tool_result', tool_use_id: block.id, content: r });
        }
      }
      if (!res.length) break;
      messages.push({ role: 'user', content: res });
    }

    if (added > 0) { try { await sendAgentNotification('roadmap', added); } catch (e) {} }
    console.log('[roadmap-agent] Done. Turns:', turns, 'Tasks added:', added);
    return { statusCode: 200, body: 'Roadmap agent completed — ' + added + ' task(s) added' };
  } catch (e) {
    console.error('[roadmap-agent] Error:', e.message);
    try {
      await supaInsert('agent_reports', {
        agent: 'roadmap', priority: 'urgent',
        title: 'Roadmap Agent Error — ' + e.message.slice(0, 60),
        body: 'Error: ' + e.message + '\n\nCheck Netlify function logs for [roadmap-agent].',
        action_url: null
      }, process.env.SUPA_SERVICE_KEY);
    } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
