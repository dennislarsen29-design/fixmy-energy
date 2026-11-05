// Self-healing core (2026-11-05, per Dennis). Same protocol as the SEO loop: nothing runs without approval.
//  scan():   detectors read real health records -> open ONE proposal per problem (deduped by system+signature)
//  approve(): runs ONLY an allowlisted function, then waits to verify
//  verify(): when the detector no longer fires the proposal is 'healed'; if it still fires it is 'failed'
//            and the problem is re-opened as 'manual' with the evidence so a person can act.
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const SITE = process.env.URL || 'https://fixmy.energy';
const VERIFY_MIN = 20;
// The ONLY things approval can run. Each is a function that is safe to call again.
const ALLOW = {
  'seo-insights': 'Search Console + GA4 sync',
  'outage-sync': 'SDG&E outage feed',
  'bb-auto-pipeline-background': 'Nightly Black Box pipeline',
  'ghl-payment-sync': 'GHL payments sweep',
  'plaid-sync': 'Bank/card sync',
  'quoya-sync-background': 'Photo categorization sweep',
  'run-agent-background': 'AI agent run'
};
const AGENT_FN = { seo: 'seo', finance: 'finance', marketing: 'marketing', socials: 'socials', bizdev: 'bizdev', 'crm-dev': 'crm-dev', roadmap: 'roadmap', coaching: 'coaching' };
function H(k, x) { return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, x || {}); }
async function get(path, k) { const r = await fetch(SB + path, { headers: H(k) }); if (!r.ok) throw new Error('GET ' + path + ' ' + r.status); return r.json(); }
async function state(k) { const rows = await get('/pipeline_state?select=key,value', k); const o = {}; rows.forEach(r => { let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } o[r.key] = v; }); return o; }
const hrs = (iso) => { const t = new Date(iso).getTime(); return isFinite(t) ? (Date.now() - t) / 3600000 : null; };

// Each detector returns null (healthy) or a problem. fix_kind 'rerun' needs fix_target.
function detect(S, reports) {
  const out = [];
  const add = (p) => out.push(p);
  const seo = S.seo_sync_status;
  if (!seo) add({ system: 'seo-sync', signature: 'no_status', problem: 'Search tracking has never reported a status.', fix_kind: 'rerun', fix_target: 'seo-insights', fix_label: 'Run the search sync now', fix_detail: 'Runs the Search Console + GA4 pull once. Reads data only; changes nothing on the site.' });
  else if (seo.status !== 'ok' || (seo.at && hrs(seo.at) > 40)) add({ system: 'seo-sync', signature: seo.status !== 'ok' ? 'failing' : 'stale', problem: seo.status !== 'ok' ? 'Search tracking is failing: ' + (seo.reason || seo.status) + '.' : 'Search tracking has not synced in ' + Math.round(hrs(seo.at)) + ' hours.', evidence: seo, fix_kind: 'rerun', fix_target: 'seo-insights', fix_label: 'Re-run the search sync', fix_detail: 'Runs the Search Console + GA4 pull once. If Google rejects the credential this will fail again and you will be told what to renew.' });
  const lr = S.last_run_at;
  if (lr && hrs(lr) > 36) add({ system: 'nightly-pipeline', signature: 'stale', problem: 'The nightly Black Box pipeline has not finished a run in ' + Math.round(hrs(lr)) + ' hours.', evidence: { last_run_at: lr, phase: S.last_run_phase }, fix_kind: 'rerun', fix_target: 'bb-auto-pipeline-background', fix_label: 'Run the pipeline now', fix_detail: 'Starts one pipeline run (up to ~13 minutes in the background). It adds leads and enriches owners; it deletes nothing.' });
  else if (S.last_run_phase && S.last_run_phase !== 'complete' && hrs(lr) > 6) add({ system: 'nightly-pipeline', signature: 'stopped_early', problem: 'The last pipeline run stopped after ' + S.last_run_phase + ' and did not finish.', evidence: { phase: S.last_run_phase, at: lr }, fix_kind: 'rerun', fix_target: 'bb-auto-pipeline-background', fix_label: 'Run the pipeline again', fix_detail: 'Starts a fresh run. Earlier phases already saved their work.' });
  const og = S.sdge_outages;
  if (og && og.failed_at && (!og.synced_at || new Date(og.failed_at) > new Date(og.synced_at))) add({ system: 'outage-feed', signature: 'failing', problem: 'The SDG&E outage feed is failing: ' + String(og.error || 'unknown').slice(0, 120), evidence: og, fix_kind: 'rerun', fix_target: 'outage-sync', fix_label: 'Refresh the outage feed', fix_detail: 'Pulls the state outage feed once and rewrites the snapshot.' });
  const rg = S.regrid_health;
  if (rg && rg.status === 'bad') add({ system: 'owner-lookup', signature: 'regrid_' + (rg.code || 'bad'), problem: 'Regrid owner lookup is rejected (HTTP ' + (rg.code || '?') + '). San Diego still fills from the county roll.', evidence: rg, fix_kind: 'manual', fix_label: 'Needs a new Regrid key', fix_detail: 'Only you can fix this: put a valid REGRID_KEY in Netlify (Site configuration > Environment variables) and redeploy, or leave it off and rely on the county roll.' });
  const sf = S.sms_last_failure;
  if (sf && sf.at && hrs(sf.at) < 48) add({ system: 'sms', signature: 'recent_failure', problem: 'A text message failed to send in the last 48 hours: ' + String(sf.reason || sf.error || 'unknown').slice(0, 120), evidence: sf, fix_kind: 'manual', fix_label: 'Check the contact in GHL', fix_detail: 'The reason is in the evidence. Usually a bad phone number or a missing GHL contact; fix the number on the lead and resend.' });
  // Agents: the newest report for each agent that says it errored, with no later normal report.
  const byAgent = {};
  (reports || []).forEach(r => { (byAgent[r.agent] = byAgent[r.agent] || []).push(r); });
  Object.keys(byAgent).forEach(a => {
    const list = byAgent[a].sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    const last = list[0];
    if (last && /agent error|run failed|could not (run|complete)|credit balance/i.test(last.title || '') && hrs(last.created_at) < 72) {
      const credit = /credit/i.test((last.title || '') + (last.body || ''));
      if (credit) add({ system: 'agent:' + a, signature: 'credit', problem: 'The ' + a + ' agent stopped: Anthropic credit is empty.', evidence: { title: last.title }, fix_kind: 'manual', fix_label: 'Top up Anthropic credit', fix_detail: 'Add credit at console.anthropic.com > Plans & Billing, then re-run the agent from Agents.' });
      else if (AGENT_FN[a]) add({ system: 'agent:' + a, signature: 'errored', problem: 'The ' + a + ' agent reported an error: ' + String(last.title).slice(0, 120), evidence: { title: last.title, at: last.created_at }, fix_kind: 'rerun', fix_target: 'run-agent-background', fix_query: 'agent=' + AGENT_FN[a], fix_label: 'Re-run the ' + a + ' agent', fix_detail: 'Runs this agent once. It only writes a report; it does not change the site or your data.' });
      else add({ system: 'agent:' + a, signature: 'errored', problem: 'The ' + a + ' agent reported an error: ' + String(last.title).slice(0, 120), evidence: { title: last.title, at: last.created_at }, fix_kind: 'manual', fix_label: 'Open the report', fix_detail: 'This agent cannot be re-run from here; open its report in Agents for the cause.' });
    }
  });
  return out;
}

async function scan(k) {
  const S = await state(k);
  const reports = await get('/agent_reports?select=agent,title,body,created_at&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 4 * 86400000).toISOString()) + '&order=created_at.desc&limit=200', k);
  const found = detect(S, reports);
  const keyOf = (p) => p.system + '|' + p.signature;
  const open = await get('/heal_proposals?select=*&status=in.(proposed,running,verifying)', k);
  const openKeys = {}; open.forEach(o => { openKeys[keyOf(o)] = o; });
  const foundKeys = {}; found.forEach(p => { foundKeys[keyOf(p)] = p; });
  let created = 0, healed = 0, failed = 0;
  for (const p of found) {
    if (openKeys[keyOf(p)]) continue;
    const r = await fetch(SB + '/heal_proposals', { method: 'POST', headers: H(k, { Prefer: 'return=minimal' }), body: JSON.stringify(Object.assign({ evidence: {} }, p)) });
    if (r.ok) created++;
  }
  // Verify what was already approved.
  for (const o of open) {
    if (o.status !== 'verifying' && o.status !== 'running') continue;
    if (o.verify_after && new Date(o.verify_after) > new Date()) continue;
    const still = !!foundKeys[keyOf(o)];
    const patch = still ? { status: 'failed', closed_at: new Date().toISOString(), result: 'Ran, but the problem is still present.' } : { status: 'healed', closed_at: new Date().toISOString(), result: 'Problem no longer detected.' };
    await fetch(SB + '/heal_proposals?id=eq.' + o.id, { method: 'PATCH', headers: H(k), body: JSON.stringify(patch) });
    if (still) {
      failed++;
      // Re-open as manual so a person sees it again with the evidence.
      await fetch(SB + '/heal_proposals', { method: 'POST', headers: H(k, { Prefer: 'return=minimal' }), body: JSON.stringify({ system: o.system, signature: o.signature, problem: o.problem + ' (a re-run did not fix it)', evidence: o.evidence || {}, fix_kind: 'manual', fix_label: 'Needs a person', fix_detail: 'The automatic re-run did not clear this. Evidence is attached; the usual cause is an expired credential or a changed upstream service.', attempts: (o.attempts || 0) + 1 }) });
    } else healed++;
  }
  // Problems that went away on their own: close proposals nobody approved.
  for (const o of open) {
    if (o.status === 'proposed' && !foundKeys[keyOf(o)]) { await fetch(SB + '/heal_proposals?id=eq.' + o.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'healed', closed_at: new Date().toISOString(), result: 'Cleared by itself before approval.' }) }); healed++; }
  }
  return { detected: found.length, created, healed, failed };
}

async function approve(k, id) {
  const rows = await get('/heal_proposals?id=eq.' + Number(id) + '&select=*', k);
  const p = rows[0];
  if (!p) return { ok: false, error: 'not_found' };
  if (p.status !== 'proposed') return { ok: false, error: 'not_open', status: p.status };
  if (p.fix_kind !== 'rerun' || !ALLOW[p.fix_target]) return { ok: false, error: 'not_runnable' };
  if (p.fix_query && !/^agent=[a-z-]+$/.test(p.fix_query)) return { ok: false, error: 'bad_query' };
  // Claim it first (conditional) so a double tap cannot run it twice.
  const claim = await fetch(SB + '/heal_proposals?id=eq.' + p.id + '&status=eq.proposed', { method: 'PATCH', headers: H(k, { Prefer: 'return=representation' }), body: JSON.stringify({ status: 'running', approved_at: new Date().toISOString(), attempts: (p.attempts || 0) + 1 }) });
  const claimed = await claim.json().catch(() => []);
  if (!Array.isArray(claimed) || !claimed.length) return { ok: false, error: 'already_taken' };
  let httpStatus = 0, err = null;
  try {
    const r = await fetch(SITE + '/.netlify/functions/' + p.fix_target + (p.fix_query ? '?' + p.fix_query : ''), { headers: { Origin: 'https://fixmy.energy' } });
    httpStatus = r.status;
  } catch (e) { err = e.message; }
  const started = !err && httpStatus > 0 && httpStatus < 500;
  await fetch(SB + '/heal_proposals?id=eq.' + p.id, { method: 'PATCH', headers: H(k), body: JSON.stringify(started ? { status: 'verifying', verify_after: new Date(Date.now() + VERIFY_MIN * 60000).toISOString(), result: 'Started (HTTP ' + httpStatus + '). Checking again in ~' + VERIFY_MIN + ' min.' } : { status: 'failed', closed_at: new Date().toISOString(), result: 'Could not start: ' + (err || 'HTTP ' + httpStatus) }) });
  return { ok: started, http: httpStatus, error: err };
}
async function reject(k, id) {
  await fetch(SB + '/heal_proposals?id=eq.' + Number(id) + '&status=eq.proposed', { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'rejected', closed_at: new Date().toISOString(), result: 'Rejected by owner.' }) });
  return { ok: true };
}
module.exports = { detect, scan, approve, reject, ALLOW };
