// Coaching Agent — the sales-coach behind the Team → 1:1s view.
// Runs weekly (see netlify.toml; also manually via run-agent-background?agent=coaching).
//
// What it does: reads the AI-generated call/knock notes (lead_activity.note, 🎙 prefix)
// from the last ~30 days, grouped by rep, and asks Claude to extract — per rep — a short
// coaching summary, repeating objections with suggested rebuttals, winning/losing patterns,
// and concrete coaching flags. It writes one coaching_reports row per rep (surfaced in the
// 1:1s view) PLUS a short org-wide summary to agent_reports (agent='coaching') so it lands
// in the Agents inbox + the daily email digest. quoya_kb is an objection→rebuttal export
// Dennis pastes into GHL's Quoya knowledge base.
//
// No web_search needed — this reads internal notes only (so no anthropic-beta header).
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
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  }).then(async function(resp) {
    if (!resp.ok) throw new Error('Claude API error: ' + resp.status + ' ' + await resp.text());
    return resp.json();
  });
}

const SUBMIT_TOOL = {
  name: 'submit_coaching',
  description: 'Return the structured coaching analysis: one entry per rep, plus one org-wide objection→rebuttal export for the Quoya knowledge base.',
  input_schema: {
    type: 'object',
    properties: {
      reps: {
        type: 'array',
        description: 'One entry per rep you analyzed.',
        items: {
          type: 'object',
          properties: {
            rep_name: { type: 'string' },
            summary: { type: 'string', description: '2-4 sentence coaching summary for this rep: what is going well, what is holding them back, and the single highest-impact thing to work on in their next 1:1.' },
            patterns: { type: 'array', items: { type: 'string' }, description: 'Winning and losing patterns you noticed in their calls/knocks (each a short phrase).' },
            objections: { type: 'array', description: 'Repeating objections this rep hit and a suggested rebuttal for each.', items: { type: 'object', properties: { objection: { type: 'string' }, rebuttal: { type: 'string' } }, required: ['objection', 'rebuttal'] } },
            coaching_flags: { type: 'array', items: { type: 'string' }, description: 'Concrete, specific coaching actions for this rep (e.g. "practice the SDG&E-bill pivot before asking for the appointment").' }
          },
          required: ['rep_name', 'summary']
        }
      },
      quoya_kb: { type: 'string', description: 'An org-wide objection→rebuttal knowledge-base export, plain text, one pair per block ("Objection: ...\\nRebuttal: ..."), covering the most common real objections across ALL reps. This is pasted directly into GHL\'s Quoya AI knowledge base, so make the rebuttals accurate to Solar Review\'s pitch (orphaned-installer diagnostics, free eval, no phone selling, SDG&E bill pain).' }
    },
    required: ['reps', 'quoya_kb']
  }
};

const SYSTEM = `You are the Sales Coach for Solar Review (internal name FixMy.Energy) — a solar diagnostic, battery-retrofit, and new-solar company in San Diego / Southern California. Reps reach homeowners whose original solar installer went out of business (SunPower, Titan, Sunnova, etc.), via phone dialing and door-knocking, and book a free on-site evaluation. The pitch is informational and nonchalant — never sell over the phone, never talk down the defunct installer, pivot on the rising SDG&E bill, and always confirm date + arrival window when booking.

You are given each rep's recent AI-generated call/knock notes. Analyze them and, for each rep, extract: a short honest coaching summary, repeating objections with suggested rebuttals, winning/losing patterns, and concrete coaching flags. Then produce one org-wide objection→rebuttal export for the Quoya knowledge base.

Be specific and grounded in what the notes actually show — do not invent objections that aren't there. If a rep has thin data, say so briefly rather than padding. Rebuttals must fit Solar Review's real pitch (free eval, orphaned-system diagnostics, no phone-selling, SDG&E bill pain point). Return everything through the submit_coaching tool.`;

function repBlockFor(rep, rows) {
  // Compact per-rep transcript: date + outcome + note, capped.
  let out = 'REP: ' + rep + ' (' + rows.length + ' notes)\n';
  let budget = 6000;
  for (const r of rows) {
    const line = '- [' + String(r.created_at || '').slice(0, 10) + (r.outcome ? '/' + r.outcome : '') + '] ' + String(r.note || '').replace(/\s+/g, ' ').trim() + '\n';
    if (budget - line.length < 0) break;
    out += line; budget -= line.length;
  }
  return out;
}

exports.handler = async function() {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) {
    console.error('[coaching-agent] Missing ANTHROPIC_KEY or SUPA_SERVICE_KEY');
    return { statusCode: 200, body: 'Missing required env vars' };
  }

  try {
    const since = new Date(); since.setDate(since.getDate() - 30);
    const rows = await supaGet('/lead_activity?select=rep_name,note,outcome,channel,created_at&note=not.is.null&created_at=gte.' + since.toISOString() + '&order=created_at.desc&limit=1200', key);

    // Group by rep; prefer AI (🎙) notes but include all field notes for context.
    const groups = {};
    (rows || []).forEach(function(r) {
      const rep = (r.rep_name && r.rep_name.trim()) || 'Unassigned';
      (groups[rep] = groups[rep] || []).push(r);
    });
    // Only coach reps with a meaningful sample (>= 3 notes), skip the Unassigned bucket.
    const reps = Object.keys(groups).filter(function(rep) { return rep !== 'Unassigned' && groups[rep].length >= 3; });

    if (!reps.length) {
      console.log('[coaching-agent] No reps with >=3 notes in the last 30 days — nothing to coach.');
      return { statusCode: 200, body: 'No coaching data yet.' };
    }

    const periodStr = since.toISOString().slice(0, 10) + ' → ' + new Date().toISOString().slice(0, 10);
    const notesByRep = {};
    let corpus = '';
    reps.forEach(function(rep) { notesByRep[rep] = groups[rep].length; corpus += repBlockFor(rep, groups[rep]) + '\n'; });

    const messages = [{
      role: 'user',
      content: 'Here are the recent rep notes (' + periodStr + '). Analyze each rep and return the structured coaching via submit_coaching.\n\n' + corpus.slice(0, 24000)
    }];

    const response = await callClaude(messages, [SUBMIT_TOOL], SYSTEM, { type: 'tool', name: 'submit_coaching' });
    const toolBlock = (response.content || []).find(function(b) { return b.type === 'tool_use' && b.name === 'submit_coaching'; });
    if (!toolBlock) throw new Error('Model did not return submit_coaching output.');

    const out = toolBlock.input || {};
    const repResults = Array.isArray(out.reps) ? out.reps : [];
    const quoyaKb = out.quoya_kb || '';

    let written = 0;
    for (const rr of repResults) {
      const rep = (rr.rep_name || '').trim();
      if (!rep) continue;
      await supaInsert('coaching_reports', {
        rep_name: rep,
        period: periodStr,
        summary: rr.summary || '',
        patterns: rr.patterns || [],
        objections: rr.objections || [],
        coaching_flags: rr.coaching_flags || [],
        quoya_kb: quoyaKb,
        notes_analyzed: notesByRep[rep] || null
      }, key);
      written++;
    }

    // Org-wide summary into the Agents inbox (+ daily email digest).
    const bodyLines = repResults.map(function(rr) {
      return '• ' + (rr.rep_name || '') + ' — ' + (rr.summary || '').slice(0, 240);
    });
    await supaInsert('agent_reports', {
      agent: 'coaching', priority: 'normal',
      title: 'Weekly 1:1s Coaching — ' + written + ' rep' + (written === 1 ? '' : 's') + ' analyzed',
      body: 'Coaching analysis for ' + periodStr + ':\n\n' + bodyLines.join('\n') + '\n\nOpen Team → 1:1s for the full per-rep breakdown, objection→rebuttal pairs, and the "Copy for Quoya KB" export.',
      action_url: '/portal'
    }, key);

    if (written > 0) { try { await sendAgentNotification('coaching', written); } catch (e) {} }
    console.log('[coaching-agent] Done. Reps analyzed:', written);
    return { statusCode: 200, body: 'Coaching agent completed — ' + written + ' rep report(s) written' };
  } catch (e) {
    console.error('[coaching-agent] Error:', e.message);
    try {
      await supaInsert('agent_reports', {
        agent: 'coaching', priority: 'urgent',
        title: 'Coaching Agent Error — ' + e.message.slice(0, 60),
        body: 'Error: ' + e.message + '\n\nCheck Netlify function logs for [coaching-agent].',
        action_url: null
      }, process.env.SUPA_SERVICE_KEY);
    } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
