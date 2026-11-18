// Shared guard for the report-writing agents (bizdev, marketing, crm-dev).
// Fixes three problems found in the 2026-11-18 digest audit:
//  1. agents counted Black Box (cold list), archived and test rows as real leads
//  2. agents flagged things that were retired or by design (M1 payments, Top Tier, $1K referral)
//  3. the same finding was filed several times, and everything was "urgent"
const SUPA_REST = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';

// Append to any /customers query: real, live pipeline only.
// Black Box rows are a cold-call list with no owner by design, so they are not "leads without a rep".
const LIVE = '&archived=not.is.true&black_box=not.is.true';

function isTest(r) {
  const n = ((r.first_name || '') + ' ' + (r.last_name || '')).toLowerCase();
  return /\btest/.test(n) || /^test/.test((r.first_name || '').toLowerCase());
}
const real = rows => (rows || []).filter(r => !isTest(r));

// Ground truth the model must respect (taken from how the business actually runs).
const FACTS = `
GROUND RULES (verified business facts; never contradict these):
- Cold-list leads (lead_source orphaned_list / sunrun_layer, black_box=true) are NOT sales leads. They have no rep by design, are worked by the dialer, and are excluded from your tools. Never call them "unassigned leads" or a conversion failure.
- Ops Milestone 1 payments were retired in Aug 2026. Never report "milestone 1 due".
- Top Tier ended Aug 2026. Those records are archived. Never recommend working them.
- The referral program is automatic and paid through Payroll (levels 1-3: $500/$250/$50 by job type). The old "$1K incentive" no longer exists. Referral payouts are not your job to chase.
- Battery Retrofit jobs are collected directly by Cosmic; there is no Solar Review invoice for them. "Sold job with no invoice" is expected for battery retrofits.
- Cosmic (ops3) is the main install partner by design; a heavy ops3 share is not a defect.
- Test records (names containing "test") and archived rows are ignored.
- Dennis Larsen / 8012328301 is the owner's own test contact. Never action it.
- Do not put prices, "$249 flat-rate", fake CSLB numbers, BBB claims or invented credentials in ad or mail copy.
- SDG&E is a private utility, not a public agency; the California Public Records Act does not apply to it. Do not draft CPRA letters to SDG&E.
PRIORITY RULES: "urgent" only for something broken right now or money confirmed owed to a person. At most 2 urgent items per run. Do not file a report that only says "no action needed".
Before flagging a problem, state the evidence (counts from a tool) and what would disprove it. If a tool result looks surprising (e.g. 100% unassigned, 0 conversions), suspect the data filter before suspecting the business.
`;

function words(s) {
  return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
}
function sim(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let i = 0; A.forEach(w => { if (B.has(w)) i++; });
  return i / (A.size + B.size - i);
}

const _runUrgent = {};
// Insert into agent_reports unless a near-identical report from any agent exists (14 days) or was filed this run.
async function guardedInsert(row, key, runTag) {
  let priority = row.priority;
  const tag = runTag || row.agent;
  if (priority === 'urgent') {
    _runUrgent[tag] = (_runUrgent[tag] || 0) + 1;
    if (_runUrgent[tag] > 2) priority = 'high';
  }
  try {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const r = await fetch(SUPA_REST + '/agent_reports?select=title,agent&created_at=gte.' + since + '&limit=300', {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    if (r.ok) {
      const prev = await r.json();
      const dup = prev.find(p => sim(p.title, row.title) >= 0.55);
      if (dup) return 'Skipped: duplicate of an existing report ("' + dup.title + '", ' + dup.agent + '). Do not re-file it.';
    }
  } catch (e) { /* fall through and file it rather than lose a real finding */ }
  const resp = await fetch(SUPA_REST + '/agent_reports', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(Object.assign({}, row, { priority }))
  });
  if (!resp.ok) throw new Error('Supabase INSERT failed: ' + resp.status + ' ' + await resp.text());
  return 'Saved.';
}

module.exports = { LIVE, isTest, real, FACTS, guardedInsert, sim };
