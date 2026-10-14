// Lets agents hear Dennis. Replies are written from the portal (Agent Inbox / S.U.N. agent issues)
// into agent_replies. At the start of each run an agent calls loadFeedback(agent, key) and puts the
// returned text at the top of its first user message; after the run it calls markSeen(ids, key).
// Unseen replies are always included; replies from the last 60 days stay as standing guidance so
// "stop recommending X" keeps holding. Any failure returns an empty block — it must never stop a run.
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const LABEL = { answer: 'ANSWER to your question', off_track: 'OFF TRACK — change course', stop: 'STOP doing this' };

async function loadFeedback(agent, key) {
  try {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const r = await fetch(SB + '/agent_replies?agent=eq.' + encodeURIComponent(agent) + '&created_at=gte.' + since + '&order=created_at.asc&limit=40',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!r.ok) return { text: '', ids: [] };
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return { text: '', ids: [] };
    const lines = rows.map(function (x) {
      return '- [' + (x.seen_at ? 'earlier' : 'NEW') + ', ' + String(x.created_at).slice(0, 10) + '] ' + (LABEL[x.kind] || 'NOTE')
        + (x.report_title ? ' (about your report "' + x.report_title + '")' : '') + ': ' + String(x.body).slice(0, 1200);
    });
    const text = 'OWNER FEEDBACK FROM DENNIS (he replied to your earlier reports). This is authoritative: follow it, do not repeat anything he told you to stop, correct course where he said you were off track, and use his answers as facts. Where relevant, briefly say in your output what you changed because of it.\n'
      + lines.join('\n') + '\n\n';
    const ids = rows.filter(function (x) { return !x.seen_at; }).map(function (x) { return x.id; });
    await markSeen(ids, key);   // stamped when the agent actually loads them, so the portal can show "read"
    return { text: text, ids: ids };
  } catch (e) { return { text: '', ids: [] }; }
}

async function markSeen(ids, key) {
  if (!ids || !ids.length) return;
  try {
    await fetch(SB + '/agent_replies?id=in.(' + ids.join(',') + ')', {
      method: 'PATCH', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen_at: new Date().toISOString() })
    });
  } catch (e) {}
}
module.exports = { loadFeedback, markSeen };
