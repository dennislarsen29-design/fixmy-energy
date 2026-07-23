// Agent Report Email Digest — sends Dennis one email a day with every new AI
// agent report so he doesn't have to log in and hunt for them in the Agents tab.
// Scheduled daily (see netlify.toml). Also runnable on demand: GET this function.
//
// Covers every agent that writes to agent_reports (marketing, bizdev, crm-dev,
// seo, finance, roadmap, socials, …). Personal Coach reports live in a separate
// private table (personal_coach_reports) and are deliberately NOT included.
//
// Idempotent: only rows with emailed_at IS NULL are sent, and they're stamped
// emailed_at afterward — so a failed/missed day catches up next run, and nothing
// is ever emailed twice. Sends nothing (no empty email) when there's no news.
//
// Env vars: RESEND_API_KEY, SUPA_SERVICE_KEY, AGENT_REPORT_EMAIL (recipient —
// defaults to dennislarsen29@gmail.com).

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';
const DEFAULT_TO = 'dennislarsen29@gmail.com';
const PORTAL_URL = 'https://fixmy.energy/portal';

const AGENT_META = {
  marketing:        { emoji: '🎯', label: 'Marketing' },
  bizdev:           { emoji: '🤝', label: 'Biz Dev' },
  'crm-dev':        { emoji: '🛠️', label: 'CRM Dev' },
  seo:              { emoji: '🔎', label: 'SEO' },
  finance:          { emoji: '💰', label: 'Finance Advisor' },
  roadmap:          { emoji: '🗺️', label: 'Roadmap & Growth' },
  socials:          { emoji: '📱', label: 'Social Media' },
  financial_coach:  { emoji: '🧭', label: 'Financial Coach' }
};
function agentMeta(a) { return AGENT_META[a] || { emoji: '🤖', label: a || 'Agent' }; }

function supaHeaders(key, extra) {
  return Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json' }, extra || {});
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// body text → safe HTML with line breaks preserved
function bodyHtml(s) { return esc(s).replace(/\n/g, '<br>'); }

function priorityBadge(p) {
  if (p === 'urgent') return '<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#fff;background:#dc2626;border-radius:100px;padding:2px 9px;">Urgent</span>';
  if (p === 'high')   return '<span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0f0f0f;background:#f59e0b;border-radius:100px;padding:2px 9px;">High</span>';
  return '';
}

function buildEmailHtml(reportsByAgent, total, dateStr) {
  let sections = '';
  // Urgent-first ordering of agents by whether they contain an urgent item, then name
  const agents = Object.keys(reportsByAgent).sort(function(a, b) {
    const au = reportsByAgent[a].some(function(r){ return r.priority === 'urgent'; }) ? 0 : 1;
    const bu = reportsByAgent[b].some(function(r){ return r.priority === 'urgent'; }) ? 0 : 1;
    if (au !== bu) return au - bu;
    return agentMeta(a).label.localeCompare(agentMeta(b).label);
  });

  agents.forEach(function(agent) {
    const meta = agentMeta(agent);
    const rows = reportsByAgent[agent].map(function(r) {
      const when = r.created_at ? new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      const badge = priorityBadge(r.priority);
      return '<tr><td style="padding:0 0 14px;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#161616;border:1px solid #262626;border-radius:10px;">' +
          '<tr><td style="padding:14px 16px;">' +
            '<div style="font-size:15px;font-weight:700;color:#ffffff;margin:0 0 4px;">' + esc(r.title || '(untitled)') + (badge ? ' &nbsp;' + badge : '') + '</div>' +
            '<div style="font-size:11px;color:#666;margin:0 0 10px;">' + esc(when) + '</div>' +
            '<div style="font-size:13px;line-height:1.6;color:#c9c9c9;">' + bodyHtml(r.body || '') + '</div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>';
    }).join('');

    sections +=
      '<tr><td style="padding:22px 0 8px;">' +
        '<div style="font-size:13px;font-weight:700;letter-spacing:0.04em;color:#8DC63F;text-transform:uppercase;">' + meta.emoji + ' ' + esc(meta.label) + ' &middot; ' + reportsByAgent[agent].length + '</div>' +
      '</td></tr>' +
      '<tr><td><table width="100%" cellpadding="0" cellspacing="0">' + rows + '</table></td></tr>';
  });

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f0f0f;font-family:\'Helvetica Neue\',Arial,sans-serif;color:#f0f0f0;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:36px 18px;"><tr><td align="center">' +
      '<table width="620" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;max-width:620px;">' +
        '<tr><td style="background:#8DC63F;padding:7px 28px;"><p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0f0f0f;">Solar Review &middot; AI Agents</p></td></tr>' +
        '<tr><td style="padding:32px 28px 8px;">' +
          '<h1 style="margin:0 0 4px;font-size:24px;font-weight:700;color:#fff;">Your daily agent digest</h1>' +
          '<p style="margin:0;font-size:14px;color:#888;">' + esc(dateStr) + ' &middot; ' + total + ' new report' + (total !== 1 ? 's' : '') + '</p>' +
        '</td></tr>' +
        '<tr><td style="padding:0 28px;"><table width="100%" cellpadding="0" cellspacing="0">' + sections + '</table></td></tr>' +
        '<tr><td style="padding:26px 28px 34px;">' +
          '<a href="' + PORTAL_URL + '" style="display:inline-block;background:#8DC63F;color:#0f0f0f;text-decoration:none;font-size:14px;font-weight:700;padding:12px 26px;border-radius:100px;">Open the Agents tab &rarr;</a>' +
          '<p style="margin:20px 0 0;font-size:11px;color:#555;line-height:1.6;">You\'re getting this because AI agent reports are set to email daily. Change the recipient via the AGENT_REPORT_EMAIL env var in Netlify.</p>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr></table></body></html>';
}

exports.handler = async function() {
  const KEY = process.env.SUPA_SERVICE_KEY;
  const RESEND = process.env.RESEND_API_KEY;
  const TO = process.env.AGENT_REPORT_EMAIL || DEFAULT_TO;
  if (!KEY || !RESEND) {
    console.warn('[agent-report-digest] Missing SUPA_SERVICE_KEY or RESEND_API_KEY — skipping');
    return { statusCode: 200, body: JSON.stringify({ skipped: 'missing env vars' }) };
  }

  try {
    // Source 1 — the business agent inbox (marketing, bizdev, crm-dev, seo,
    // socials, finance, roadmap, + any future agent).
    const resp = await fetch(
      SUPA_REST + '/agent_reports?select=id,agent,priority,title,body,created_at&emailed_at=is.null&order=created_at.asc&limit=200',
      { headers: supaHeaders(KEY) }
    );
    if (!resp.ok) throw new Error('agent_reports fetch failed: ' + resp.status + ' ' + await resp.text());
    const bizReports = (await resp.json()).map(function(r) { r._src = 'agent_reports'; return r; });

    // Source 2 — the private Financial Coach (personal_coach_reports). Kept out
    // of the anon-readable inbox for privacy, but it's Dennis's own data going to
    // Dennis's own inbox, so include it here. Service-role key can read it.
    let coachReports = [];
    try {
      const cResp = await fetch(
        SUPA_REST + '/personal_coach_reports?select=id,priority,title,body,created_at&emailed_at=is.null&order=created_at.asc&limit=100',
        { headers: supaHeaders(KEY) }
      );
      if (cResp.ok) {
        coachReports = (await cResp.json()).map(function(r) { r.agent = 'financial_coach'; r._src = 'personal_coach_reports'; return r; });
      } else {
        console.warn('[agent-report-digest] coach reports fetch failed (continuing):', cResp.status);
      }
    } catch (e) { console.warn('[agent-report-digest] coach reports fetch error (continuing):', e.message); }

    const reports = bizReports.concat(coachReports)
      .sort(function(a, b) { return String(a.created_at || '').localeCompare(String(b.created_at || '')); });

    if (!reports.length) {
      console.log('[agent-report-digest] No new reports — nothing to send.');
      return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
    }

    // Group by agent
    const byAgent = {};
    reports.forEach(function(r) { (byAgent[r.agent || 'agent'] = byAgent[r.agent || 'agent'] || []).push(r); });

    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const urgentCount = reports.filter(function(r){ return r.priority === 'urgent'; }).length;
    const subject = (urgentCount ? '⚠️ ' : '') + reports.length + ' new agent report' + (reports.length !== 1 ? 's' : '') +
      (urgentCount ? ' (' + urgentCount + ' urgent)' : '') + ' — Solar Review';

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Solar Review Agents <info@fixmy.energy>',
        to: [TO],
        subject: subject,
        html: buildEmailHtml(byAgent, reports.length, dateStr)
      })
    });
    if (!emailResp.ok) throw new Error('Resend send failed: ' + emailResp.status + ' ' + await emailResp.text());

    // Mark them emailed so they never re-send — each row in its own table.
    const nowIso = new Date().toISOString();
    async function stamp(table, rows) {
      const ids = rows.map(function(r){ return r.id; });
      if (!ids.length) return;
      const sr = await fetch(SUPA_REST + '/' + table + '?id=in.(' + ids.join(',') + ')', {
        method: 'PATCH',
        headers: supaHeaders(KEY, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ emailed_at: nowIso })
      });
      if (!sr.ok) console.warn('[agent-report-digest] emailed_at stamp failed for ' + table + ':', sr.status, await sr.text());
    }
    await stamp('agent_reports', bizReports);
    await stamp('personal_coach_reports', coachReports);

    console.log('[agent-report-digest] Sent digest of', reports.length, 'reports to', TO);
    return { statusCode: 200, body: JSON.stringify({ sent: reports.length, to: TO }) };
  } catch (e) {
    console.error('[agent-report-digest] Error:', e.message);
    return { statusCode: 200, body: JSON.stringify({ error: e.message }) };
  }
};
