// chat-agent.js — conversational CRM assistant, answers questions using live Supabase data
// POST { message: string, history: [{role,content}] } → { reply: string }

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

async function supaGet(path, key) {
  const resp = await fetch(SUPA_REST + path, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  });
  if (!resp.ok) throw new Error('Supabase GET failed: ' + resp.status + ' ' + await resp.text());
  return resp.json();
}

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ reply: 'Method not allowed' }) };

  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    return { statusCode: 200, headers, body: JSON.stringify({ reply: 'Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY in Netlify environment variables.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ reply: 'Bad JSON' }) }; }

  const { message, history = [] } = body;
  if (!message) return { statusCode: 400, headers, body: JSON.stringify({ reply: 'Missing message' }) };

  try {
    const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString();
    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();

    const [all, stalled, spend, agentReports] = await Promise.all([
      supaGet('/customers?select=id,first_name,last_name,phone,lead_category,sold_type,step,solar_status,lead_source,rep_id,setter_name,invoice_amount,deposit_status,assigned_ops,lead_temp,created_at,address,notes,original_installer,install_year&limit=2000', key),
      supaGet('/customers?select=id,first_name,last_name,phone,lead_category,sold_type,step,solar_status,lead_source,setter_name,lead_temp,created_at&sold_type=is.null&created_at=lte.' + cutoff14 + '&order=created_at.asc&limit=100', key),
      supaGet('/marketing_expenses?select=*&order=expense_date.desc&limit=30', key),
      supaGet('/agent_reports?select=agent,title,body,priority,created_at&reviewed=eq.false&order=created_at.desc&limit=10', key),
    ]);

    const leads = all.filter(c => !c.sold_type);
    const jobs  = all.filter(c => !!c.sold_type);
    const fmJobs = jobs.filter(c => c.lead_category !== 'new_solar');
    const nsJobs = jobs.filter(c => c.lead_category === 'new_solar');
    const revenue = jobs.reduce((s, c) => s + (parseFloat(c.invoice_amount) || 0), 0);

    const recent = all.filter(c => c.created_at >= cutoff30);
    const recentLeads = recent.filter(c => !c.sold_type).length;
    const recentJobs  = recent.filter(c => !!c.sold_type).length;

    const bySource = {};
    all.forEach(c => {
      const src = c.lead_source || 'unknown';
      if (!bySource[src]) bySource[src] = { leads: 0, jobs: 0 };
      if (c.sold_type) bySource[src].jobs++; else bySource[src].leads++;
    });

    const byRep = {};
    all.forEach(c => {
      const rep = c.setter_name || c.rep_id || 'unassigned';
      if (!byRep[rep]) byRep[rep] = { leads: 0, jobs: 0 };
      if (c.sold_type) byRep[rep].jobs++; else byRep[rep].leads++;
    });

    const fmSteps = {};
    all.filter(c => c.lead_category !== 'new_solar' && !c.sold_type).forEach(c => {
      const s = 'Step ' + (c.step || 0); fmSteps[s] = (fmSteps[s] || 0) + 1;
    });

    const stalledAlive = stalled.filter(r => {
      if (r.lead_category === 'new_solar') return !['ns_eval_canceled','ns_welcome_dead','ns_call_dead'].includes(r.solar_status);
      return r.step !== 7;
    });

    const totalSpend = spend.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    function latestNote(raw) {
      if (!raw) return null;
      try { if (raw.trim().charAt(0) === '[') { const e = JSON.parse(raw); if (e.length) return e[e.length-1]; } } catch(e) {}
      return raw ? { ts: null, by: 'Legacy', text: raw } : null;
    }
    const leadsWithNotes = leads
      .map(c => ({ c, note: latestNote(c.notes) }))
      .filter(x => x.note && x.note.text)
      .sort((a, b) => (b.note.ts || '') > (a.note.ts || '') ? 1 : -1)
      .slice(0, 15);

    const context = `FIXMY.ENERGY CRM SNAPSHOT — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

PIPELINE OVERVIEW:
- Open leads (not sold): ${leads.length}
- Total jobs (sold): ${jobs.length} | FixMy: ${fmJobs.length} | New Solar: ${nsJobs.length}
- Estimated total revenue: $${Math.round(revenue).toLocaleString()}
- Last 30 days: ${recentLeads} new leads, ${recentJobs} new jobs closed

FIXMY LEADS BY STEP (pipeline stages):
${Object.entries(fmSteps).map(([s, n]) => `  ${s}: ${n} leads`).join('\n')}

LEADS BY SOURCE:
${Object.entries(bySource).map(([src, v]) => `  ${src}: ${v.leads} leads, ${v.jobs} jobs (${v.leads + v.jobs > 0 ? Math.round(v.jobs / (v.leads + v.jobs) * 100) : 0}% close rate)`).join('\n')}

REP PERFORMANCE (all time):
${Object.entries(byRep).sort((a, b) => (b[1].jobs + b[1].leads) - (a[1].jobs + a[1].leads)).map(([rep, v]) => `  ${rep}: ${v.leads} leads, ${v.jobs} jobs`).join('\n')}

STALLED LEADS — not updated in 14+ days (${stalledAlive.length} total):
${stalledAlive.slice(0, 20).map(r => `  ${r.first_name} ${r.last_name || ''} | ${r.lead_category === 'new_solar' ? r.solar_status : 'Step ' + (r.step || 0)} | source: ${r.lead_source || '?'} | rep: ${r.setter_name || r.rep_id || 'unassigned'} | phone: ${r.phone || '?'} | created: ${new Date(r.created_at).toLocaleDateString()}`).join('\n')}

ORPHANED INSTALLER LEADS (lead_source=orphaned_list):
${(function(){
  const orphaned = leads.filter(c => c.lead_source === 'orphaned_list');
  if (!orphaned.length) return '  None yet.';
  const byInstaller = {};
  orphaned.forEach(c => { const k = c.original_installer||'Unknown'; byInstaller[k]=(byInstaller[k]||0)+1; });
  return '  Total: '+orphaned.length+'\n'+Object.entries(byInstaller).map(([k,v])=>'  '+k+': '+v+' leads').join('\n');
})()}

MARKETING SPEND:
- Total all time: $${Math.round(totalSpend).toLocaleString()}
${spend.slice(0, 10).map(e => `  $${e.amount} on ${e.expense_date}${e.notes ? ' | ' + e.notes : ''}`).join('\n')}

RECENT ACTIVITY LOG (latest note per lead — up to 15):
${leadsWithNotes.length ? leadsWithNotes.map(({c, note}) => `  ${c.first_name} ${c.last_name||''} (${c.lead_category==='new_solar'?c.solar_status:'Step '+(c.step||0)}) — ${note.by}${note.ts?' '+new Date(note.ts).toLocaleDateString():''}: "${note.text.slice(0,120)}${note.text.length>120?'…':'"'}`).join('\n') : '  No notes logged yet.'}

UNREVIEWED AGENT INBOX ITEMS (${agentReports.length}):
${agentReports.map(r => `  [${r.agent}/${r.priority}] ${r.title}`).join('\n') || '  None'}`;

    const systemPrompt = `You are the AI business assistant for FixMy.Energy, a solar diagnostic, battery retrofit, and new solar company serving Southern California, run by Dennis Larsen.

You have access to live CRM data (shown below). Answer questions directly using that data — be specific, use names and numbers, give actionable recommendations.

Pipeline logic:
- FixMy.Energy: Step 0-5 = lead, Step 6+ = sold job. Step 7 = dead. Types: diagnostic, battery_retrofit, monitoring.
- New Solar: status ns_eval_booked → ns_welcome_closed (job starts) → ns_pto
- lead_source values: direct_mail, self_generated, referral, inbound_web

When recommending follow-ups, give the person's name and phone number if available. Be conversational but data-driven. No hedging — give a direct answer. Use the Recent Activity Log to surface close signals, objection patterns, and follow-up recommendations when asked.

${context}`;

    const messages = [
      ...history.slice(-8),
      { role: 'user', content: message }
    ];

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 1024, system: systemPrompt, messages })
    });

    if (!resp.ok) throw new Error('Claude API error: ' + resp.status + ' ' + await resp.text());
    const data = await resp.json();
    const reply = (data.content || []).find(b => b.type === 'text')?.text || 'No response.';

    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };

  } catch(e) {
    console.error('[chat-agent] Error:', e.message);
    return { statusCode: 200, headers, body: JSON.stringify({ reply: 'Error fetching CRM data: ' + e.message }) };
  }
};
