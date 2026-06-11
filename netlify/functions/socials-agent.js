// Socials Agent — runs daily ~8am PT (see netlify.toml)
// Env vars required: ANTHROPIC_KEY, SUPA_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// Generates ready-to-post social content based on recent wins, pipeline events,
// and seasonal/local context. Writes post drafts to the agent_reports table.

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
    name: 'get_recent_wins',
    description: 'Get jobs and leads that recently reached milestone stages (sold, installed, PTO, diagnostic complete). Use this to find stories worth sharing.',
    input_schema: {
      type: 'object',
      properties: { days_back: { type: 'number', description: 'Days to look back for milestone events' } },
      required: ['days_back']
    }
  },
  {
    name: 'get_pipeline_snapshot',
    description: 'Get a high-level snapshot of the current pipeline — total leads, active jobs, stages. Useful for "behind the scenes" or milestone content.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'write_post',
    description: 'Save a ready-to-post social media post to the Agent Inbox. Include the full post text, suggested platform, and any relevant context for the team.',
    input_schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['urgent', 'high', 'normal'], description: 'urgent=post today, high=post this week, normal=use whenever' },
        title: { type: 'string', description: 'Short label, e.g. "LinkedIn — Solar Savings Story" or "Instagram — Behind the Scenes"' },
        body: { type: 'string', description: 'The complete post text ready to copy-paste. Include caption, hashtags, and a note about what image/video to use. Write 2-3 platform variants if relevant.' }
      },
      required: ['priority', 'title', 'body']
    }
  }
];

async function executeTool(name, input, key) {
  switch (name) {

    case 'get_recent_wins': {
      const since = new Date();
      since.setDate(since.getDate() - (input.days_back || 7));

      // Jobs that moved to install or completed stages
      const jobs = await supaGet(
        '/customers?select=first_name,last_name,address,sold_type,step,solar_status,lead_category,install_date,system_size,utility,invoice_amount,created_at' +
        '&sold_type=not.is.null&created_at=gte.' + since.toISOString() + '&limit=50', key
      );

      // Recent FixMy jobs at step 8+ (Install Booked, Monitoring)
      const installs = await supaGet(
        '/customers?select=first_name,address,sold_type,step,invoice_amount,install_date' +
        '&step=gte.8&lead_category=neq.new_solar&install_date=gte.' + since.toISOString() + '&limit=20', key
      );

      // Recent New Solar at job phases
      const nsSold = await supaGet(
        '/customers?select=first_name,address,solar_status,system_size,utility,monthly_bill' +
        '&lead_category=eq.new_solar&solar_status=in.(ns_welcome_closed,ns_button_up,ns_install_scheduled,ns_pto)&limit=20', key
      );

      return JSON.stringify({
        recentJobs: jobs.slice(0, 10).map(j => ({
          name: j.first_name,
          city: (j.address || '').split(',').slice(-3, -2).join('').trim(),
          type: j.sold_type,
          status: j.step || j.solar_status,
          amount: j.invoice_amount
        })),
        recentInstalls: installs.slice(0, 5),
        newSolarMilestones: nsSold.slice(0, 5)
      });
    }

    case 'get_pipeline_snapshot': {
      const all = await supaGet('/customers?select=lead_category,sold_type,step,solar_status&limit=2000', key);
      const leads = all.filter(c => !c.sold_type);
      const jobs = all.filter(c => !!c.sold_type);
      const nsJobs = jobs.filter(c => c.lead_category === 'new_solar');
      const fmJobs = jobs.filter(c => c.lead_category !== 'new_solar');
      const installing = jobs.filter(c => c.step >= 8 || c.solar_status === 'ns_install_scheduled');
      const pto = jobs.filter(c => c.solar_status === 'ns_pto');
      return JSON.stringify({
        totalLeads: leads.length, totalJobs: jobs.length,
        fixmyJobs: fmJobs.length, newSolarJobs: nsJobs.length,
        currentlyInstalling: installing.length, ptoComplete: pto.length
      });
    }

    case 'write_post': {
      await supaInsert('agent_reports', {
        agent: 'socials', priority: input.priority || 'normal',
        title: input.title, body: input.body, action_url: null
      }, key);
      return 'Post saved.';
    }

    default:
      return 'Unknown tool: ' + name;
  }
}

const SYSTEM = `You are the autonomous Socials Agent for FixMy.Energy — a solar diagnostic, battery retrofit, and new solar company serving Southern California. The brand voice is confident, relatable, and community-oriented. The founder (Dennis) is building in public: running the business, using AI tools, and growing a sales team.

You run every morning at 8am. Your job: generate 1–2 ready-to-post social media pieces for the day.

Content pillars to rotate through:
1. Customer wins — anonymized ("A Chula Vista homeowner just got their system PTO'd — here's what their bill looks like now")
2. Behind the scenes — what the team is working on, how the business operates
3. Educational — solar myths, how battery retrofits work, what NEM 3.0 means
4. Sales mindset — hustle, persistence, how to sell solar door-to-door
5. AI + business — how you're using AI to run the company (this is unique content)
6. Local Southern California — community events, weather ("marine layer season means your solar generation drops 20%")

Format for each post saved via write_post:
- Start with the full caption ready to copy-paste
- Include 5-8 hashtags at the end
- Note what visual/image to use (e.g. "Photo: job site from today's install", "Graphic: bill comparison before/after")
- Write a LinkedIn variant AND an Instagram variant if the content fits both

Tone: Direct, no fluff. Real numbers when available. First-person from Dennis's perspective for personal brand posts.`;

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[socials-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const DATA_TOOLS = TOOLS.filter(function(t) { return t.name !== 'write_post'; });
    const WRITE_TOOL = TOOLS.find(function(t) { return t.name === 'write_post'; });

    const messages = [{
      role: 'user',
      content: `Generate today's social content for FixMy.Energy. Today is ${today} (${dayOfWeek}). Use get_recent_wins and get_pipeline_snapshot to find real material for today's posts.`
    }];

    // Phase 1: Data gathering only (write tool not available)
    let turns = 0;
    while (turns++ < 6) {
      const response = await callClaude(messages, DATA_TOOLS, SYSTEM);
      messages.push({ role: 'assistant', content: response.content });
      if (response.stop_reason === 'end_turn') break;
      if (response.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[socials-agent] data tool:', block.name);
          const result = await executeTool(block.name, block.input, key);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    // Phase 2: Write posts — always runs, tool_choice:any guarantees at least one write
    let actionItemCount = 0;
    messages.push({ role: 'user', content: 'You have the data. Now write 1-2 ready-to-post social media posts using write_post. Make them copy-paste ready with caption, hashtags, and image note.' });

    const wr1 = await callClaude(messages, [WRITE_TOOL], SYSTEM, { type: 'any' });
    messages.push({ role: 'assistant', content: wr1.content });
    const toolRes1 = [];
    for (const block of (wr1.content || [])) {
      if (block.type === 'tool_use') {
        console.log('[socials-agent] write:', block.name);
        actionItemCount++;
        const r = await executeTool(block.name, block.input, key);
        toolRes1.push({ type: 'tool_result', tool_use_id: block.id, content: r });
      }
    }
    if (wr1.stop_reason === 'tool_use' && toolRes1.length > 0) {
      messages.push({ role: 'user', content: toolRes1 });
      const wr2 = await callClaude(messages, [WRITE_TOOL], SYSTEM);
      for (const block of (wr2.content || [])) {
        if (block.type === 'tool_use') {
          actionItemCount++;
          await executeTool(block.name, block.input, key);
        }
      }
    }

    if (actionItemCount > 0) await sendAgentNotification('socials', actionItemCount);
    console.log('[socials-agent] Done. Turns:', turns, 'Items:', actionItemCount);
    return { statusCode: 200, body: 'Socials agent completed' };
  } catch (e) {
    console.error('[socials-agent] Error:', e.message);
    try {
      await supaInsert('agent_reports', {
        agent: 'socials', priority: 'urgent',
        title: 'Agent Error — ' + e.message.slice(0, 60),
        body: 'Error: ' + e.message + '\n\nCheck Netlify function logs for [socials-agent].',
        action_url: null
      }, process.env.SUPA_SERVICE_KEY);
    } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
