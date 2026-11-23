// Self-healing core (2026-11-05, per Dennis). Same protocol as the SEO loop: nothing runs without approval.
//  scan():   detectors read real health records -> open ONE proposal per problem (deduped by system+signature)
//  approve(): runs ONLY an allowlisted function, then waits to verify
//  verify(): when the detector no longer fires the proposal is 'healed'; if it still fires it is 'failed'
//            and the problem is re-opened as 'manual' with the evidence so a person can act.
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const SITE = process.env.URL || 'https://fixmy.energy';
const VERIFY_MIN = 20;
const codefix = require('./heal-codefix');
const healSeo = require('./heal-seo');
const OPEN = 'proposed,running,verifying,pr_open';
// The ONLY things approval can run. Each is a function that is safe to call again.
const ALLOW = {
  'seo-insights': 'Search Console + GA4 sync',
  'outage-sync': 'SDG&E outage feed',
  'bb-auto-pipeline-background': 'Nightly Black Box pipeline',
  'ghl-payment-sync': 'GHL payments sweep',
  'plaid-sync': 'Bank/card sync',
  'quoya-sync-background': 'Photo categorization sweep',
  'run-agent-background': 'AI agent run',
  'market-report-background': 'Market opportunity report',
  'seo-audit-scan': 'Site SEO audit'
};
// Cities the market loop keeps a fresh report on. Override with pipeline_state key market_watchlist ([{city,state}]).
const MARKETS = [{ city: 'Salt Lake City', state: 'UT' }, { city: 'Austin', state: 'TX' }];
const AGENT_FN = { seo: 'seo', finance: 'finance', marketing: 'marketing', socials: 'socials', bizdev: 'bizdev', 'crm-dev': 'crm-dev', roadmap: 'roadmap', coaching: 'coaching', pr: 'pr' };
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
  const sum = S.last_run_summary;
  if (sum && typeof sum === 'object') {
    if (/insufficient credits/i.test(String(sum.phase3_tracerfy || ''))) add({ system: 'skip-trace', signature: 'no_credits', problem: 'Tracerfy skip-trace is out of credits: ' + String(sum.phase3_tracerfy).slice(0, 120), evidence: { phase3: sum.phase3_tracerfy }, fix_kind: 'manual', fix_label: 'Add Tracerfy credits', fix_detail: 'Add credits in your Tracerfy account. Until then new leads get no phone/email and the dialer queue stops growing.' });
    const po = String(sum.permit_pull_outcomes || '');
    if (po && !/:ok/.test(po) && !/no permit queries ran/.test(po)) add({ system: 'permit-pull', signature: 'no_success', problem: 'Last night no permit request succeeded: ' + po.slice(0, 120), evidence: { permit_pull_outcomes: po }, fix_kind: 'rerun', fix_target: 'bb-auto-pipeline-background', fix_label: 'Run the pipeline now', fix_detail: 'Starts one pipeline run. If PermitStack is rejecting the key, the re-run fails again and you are told to check PERMITSTACK_KEY.' });
  }
  const pay = S._payments;
  if (pay && pay.updated_at && hrs(pay.updated_at) > 40) add({ system: 'payments-sweep', signature: 'stale', problem: 'The GHL payments sweep has not recorded a run in ' + Math.round(hrs(pay.updated_at)) + ' hours.', evidence: { updated_at: pay.updated_at }, fix_kind: 'rerun', fix_target: 'ghl-payment-sync', fix_label: 'Run the payments sweep now', fix_detail: 'Pulls recent GHL transactions into the payments ledger. Duplicates are skipped; safe to repeat.' });
  else if (pay && pay.value && Number(pay.value.errors) > 0) add({ system: 'payments-sweep', signature: 'errors', problem: 'The last payments sweep reported ' + pay.value.errors + ' error(s).', evidence: pay.value, fix_kind: 'rerun', fix_target: 'ghl-payment-sync', fix_label: 'Run the payments sweep again', fix_detail: 'Re-pulls recent GHL transactions; duplicates are skipped.' });
  const pl = S._plaid;
  if (Array.isArray(pl)) pl.forEach(it => { if (it && it.last_synced && hrs(it.last_synced) > 40) add({ system: 'bank-sync', signature: 'stale_' + String(it.institution || 'item').replace(/\W+/g, '_').slice(0, 24), problem: 'Bank sync for ' + (it.institution || 'a connected account') + ' has not run in ' + Math.round(hrs(it.last_synced)) + ' hours.', evidence: { institution: it.institution, last_synced: it.last_synced }, fix_kind: 'rerun', fix_target: 'plaid-sync', fix_label: 'Sync the bank now', fix_detail: 'Pulls new bank/card transactions. If the bank login expired you must reconnect it in Finance > Sync.' }); });
  const nf = S._notifFails;
  if (Array.isArray(nf) && nf.length) add({ system: 'notifications', signature: 'failed_sends', problem: nf.length + ' customer text/email' + (nf.length > 1 ? 's' : '') + ' failed in the last 24 hours (latest: ' + String(nf[0].reason || 'unknown').slice(0, 80) + ').', evidence: { latest: nf.slice(0, 3).map(x => ({ at: x.at, kind: x.kind, to: x.to_masked, reason: x.reason })) }, fix_kind: 'manual', fix_label: 'Resend by hand', fix_detail: 'Open the lead and resend from there; a bad phone number or a customer who replied STOP are the usual causes. This clears itself 24 hours after the last failure.' });
  // Scheduled agents that went quiet (cadence from netlify.toml, with slack).
  const CAD = { finance: 40, seo: 9 * 24, roadmap: 9 * 24, marketing: 9 * 24, bizdev: 9 * 24 };
  Object.keys(CAD).forEach(a => {
    const mine = (reports || []).filter(r => r.agent === a).sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0];
    if (reports && reports.length && !mine) add({ system: 'agent:' + a, signature: 'silent', problem: 'The ' + a + ' agent has filed nothing in the last 30 days.', evidence: {}, fix_kind: 'rerun', fix_target: 'run-agent-background', fix_query: 'agent=' + a, fix_label: 'Run the ' + a + ' agent', fix_detail: 'Runs this agent once; it only writes a report.' });
    else if (mine && hrs(mine.created_at) > CAD[a]) add({ system: 'agent:' + a, signature: 'silent', problem: 'The ' + a + ' agent has not reported in ' + Math.round(hrs(mine.created_at) / 24) + ' days (expected about every ' + (CAD[a] > 48 ? '1-2 weeks' : 'day') + ').', evidence: { last_report: mine.created_at }, fix_kind: 'rerun', fix_target: 'run-agent-background', fix_query: 'agent=' + a, fix_label: 'Run the ' + a + ' agent', fix_detail: 'Runs this agent once; it only writes a report.' });
  });
  // Photo backlog detector disabled 2026-11-23: the nightly photo sweep is turned off on purpose (per Dennis).
  if (false && Array.isArray(S._photos) && S._photos.length >= 200) add({ system: 'photo-sync', signature: 'backlog', problem: '200+ uploaded photos are still waiting to be categorized.', evidence: { pending_at_least: S._photos.length }, fix_kind: 'rerun', fix_target: 'quoya-sync-background', fix_label: 'Run the photo sweep now', fix_detail: 'Categorizes up to 60 pending photos (uses AI credit). Repeats nightly anyway.' });
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
  // ── SEO: site audit + market reports (2026-11-16) ──
  const au = S.seo_audit, skip = S._skip || {};
  if (!au || !au.at || hrs(au.at) > 24 * 10) add({ system: 'site-audit', signature: 'stale', problem: au && au.at ? 'The site SEO audit has not run in ' + Math.round(hrs(au.at) / 24) + ' days.' : 'The site SEO audit has never run.', evidence: { at: au && au.at }, fix_kind: 'rerun', fix_target: 'seo-audit-scan', fix_label: 'Run the site audit now', fix_detail: 'Reads every public page on fixmy.energy once and records title, description and heading problems. Changes nothing.' });
  else {
    const fx = Array.isArray(au.fixable_pages) ? au.fixable_pages : [];
    const sigFix = 'meta_fixes_' + fx.length;
    if (fx.length && !skip['site-audit|' + sigFix]) add({ system: 'site-audit', signature: sigFix, problem: fx.length + ' page' + (fx.length > 1 ? 's have' : ' has') + ' a title or description that is too long or missing (Google cuts it off).', evidence: { pages: fx.slice(0, 12), audited: au.pages }, fix_kind: 'audit_fix', fix_label: 'Draft fixes for up to 3 pages', fix_detail: 'Rewrites the title and description on up to 3 pages and opens one pull request per page. Nothing goes live until you merge, and the result is measured afterward.' });
    const hi = Array.isArray(au.high_items) ? au.high_items : [];
    if (hi.length) add({ system: 'site-audit', signature: 'high_' + hi.length, problem: hi.length + ' serious page problem' + (hi.length > 1 ? 's' : '') + ' found (missing description or heading, broken markup): ' + hi.slice(0, 3).map(x => x.url + ' - ' + x.msg).join('; ') + '.', evidence: { items: hi }, fix_kind: 'manual', fix_label: 'Fix in Claude Code', fix_detail: 'These need a page edit (a missing H1 or description). Ask Claude Code to fix the pages listed in the evidence.' });
  }
  const wl = Array.isArray(S.market_watchlist) && S.market_watchlist.length ? S.market_watchlist : MARKETS;
  wl.forEach(m => {
    if (!m || !m.city || !/^[A-Z]{2}$/.test(m.state || '')) return;
    const mkey = (m.city + '-' + m.state).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const want = ('Market report: ' + m.city + ', ' + m.state).toLowerCase();
    const rep = (reports || []).filter(r => String(r.title || '').toLowerCase() === want).sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0];
    if (!rep) { add({ system: 'market:' + mkey, signature: 'no_report', problem: 'No market report for ' + m.city + ', ' + m.state + ' in the last 30 days.', evidence: m, fix_kind: 'rerun', fix_target: 'market-report-background', fix_query: 'city=' + encodeURIComponent(m.city) + '&state=' + m.state, fix_label: 'Research ' + m.city, fix_detail: 'Searches the web for who ranks, local utility rules, defunct installers and demand, then files a report. Uses AI credit; changes nothing on the site.' }); return; }
    const v = (/VERDICT[^\n]*?(Build now|Build small test|Wait)/i.exec(rep.body || '') || [])[1];
    const slug = 'solar-repair-' + m.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + m.state.toLowerCase();
    const have = au && Array.isArray(au.urls) && au.urls.some(u => u === '/' + slug);
    if (v && /^build/i.test(v) && !have && !skip['market:' + mkey + '|draft_page']) add({ system: 'market:' + mkey, signature: 'draft_page', problem: 'The ' + m.city + ' market report says "' + v + '" but there is no ' + m.city + ' page yet.', evidence: { city: m.city, state: m.state, verdict: v, report: String(rep.body || '').slice(0, 7000) }, fix_kind: 'page_draft', fix_label: 'Draft the ' + m.city + ' page', fix_detail: 'Adapts the Salt Lake page for ' + m.city + ' using only facts from the report, and opens a pull request. Nothing goes live until you merge.' });
  });
  return out;
}

async function scan(k) {
  const S = await state(k);
  try { const r = await get('/app_config?key=eq.payments_last_sync&select=value,updated_at', k); S._payments = r[0] || null; } catch (e) {}
  try { const r = await get('/app_config?key=eq.plaid_items&select=value', k); let v = r[0] && r[0].value; if (typeof v === 'string') v = JSON.parse(v); S._plaid = Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : null); } catch (e) {}
  try { S._notifFails = await get('/notification_log?select=at,kind,to_masked,reason&ok=eq.false&at=gte.' + encodeURIComponent(new Date(Date.now() - 86400000).toISOString()) + '&order=at.desc&limit=20', k); } catch (e) {}
  try { S._photos = await get('/job_photos?select=id&quoya_status=eq.pending&limit=200', k); } catch (e) {}
  const reports = await get('/agent_reports?select=agent,title,body,created_at&created_at=gte.' + encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString()) + '&order=created_at.desc&limit=400', k);
  try {
    const live = await get('/heal_proposals?select=system,signature,status,closed_at&or=(status.in.(pr_open,verifying),and(status.eq.rejected,closed_at.gte.' + encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString()) + '))', k);
    S._skip = {}; live.forEach(x => { S._skip[x.system + '|' + x.signature] = 1; });
  } catch (e) { S._skip = {}; }
  const found = detect(S, reports);
  const keyOf = (p) => p.system + '|' + p.signature;
  const open = await get('/heal_proposals?select=*&status=in.(' + OPEN + ')', k);
  const openKeys = {}; open.forEach(o => { openKeys[keyOf(o)] = o; });
  const foundKeys = {}; found.forEach(p => { foundKeys[keyOf(p)] = p; });
  let created = 0, healed = 0, failed = 0;
  for (const p of found) {
    if (openKeys[keyOf(p)]) continue;
    const r = await fetch(SB + '/heal_proposals', { method: 'POST', headers: H(k, { Prefer: 'return=minimal' }), body: JSON.stringify(Object.assign({ evidence: {} }, p)) });
    if (r.ok) created++;
  }
  // Code-fix pull requests: merged -> verify after the deploy lands; closed unmerged -> rejected.
  for (const o of open) {
    if (o.status !== 'pr_open') continue;
    const m = /\/pull\/(\d+)/.exec(o.pr_url || o.result || '');
    if (!m) continue;
    let st = null; try { st = await codefix.prState(m[1]); } catch (e) {}
    if (st === 'merged') await fetch(SB + '/heal_proposals?id=eq.' + o.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'verifying', approved_at: new Date().toISOString(), verify_after: new Date(Date.now() + 60 * 60000).toISOString(), result: 'Fix merged. Checking again about an hour after the deploy.' }) });
    else if (st === 'closed') await fetch(SB + '/heal_proposals?id=eq.' + o.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'rejected', closed_at: new Date().toISOString(), result: 'Pull request closed without merging.' }) });
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
  if (p.fix_query && !/^(agent=[a-z-]+|city=[A-Za-z%0-9.]+&state=[A-Z]{2})$/.test(p.fix_query)) return { ok: false, error: 'bad_query' };
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
async function codefixDraft(k, id) {
  const rows = await get('/heal_proposals?id=eq.' + Number(id) + '&select=*', k);
  const p = rows[0];
  if (!p) return { ok: false, error: 'not_found' };
  if (p.status !== 'proposed') return { ok: false, error: 'not_open', status: p.status };
  const claim = await fetch(SB + '/heal_proposals?id=eq.' + p.id + '&status=eq.proposed', { method: 'PATCH', headers: H(k, { Prefer: 'return=representation' }), body: JSON.stringify({ status: 'running', attempts: (p.attempts || 0) + 1 }) });
  const got = await claim.json().catch(() => []);
  if (!Array.isArray(got) || !got.length) return { ok: false, error: 'already_taken' };
  let r; try { r = await codefix.draft(p); } catch (e) { r = { ok: false, error: e.message }; }
  if (r.ok) await fetch(SB + '/heal_proposals?id=eq.' + p.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'pr_open', pr_url: r.pr_url, result: 'Code fix drafted: ' + r.explanation + ' Review and merge: ' + r.pr_url }) });
  else await fetch(SB + '/heal_proposals?id=eq.' + p.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'proposed', result: 'Code fix not drafted: ' + r.error }) });
  return r;
}
async function claimProposed(k, id, kind) {
  const rows = await get('/heal_proposals?id=eq.' + Number(id) + '&select=*', k);
  const p = rows[0];
  if (!p) return { err: { ok: false, error: 'not_found' } };
  if (p.status !== 'proposed' || p.fix_kind !== kind) return { err: { ok: false, error: 'not_open', status: p.status } };
  const claim = await fetch(SB + '/heal_proposals?id=eq.' + p.id + '&status=eq.proposed', { method: 'PATCH', headers: H(k, { Prefer: 'return=representation' }), body: JSON.stringify({ status: 'running', approved_at: new Date().toISOString(), attempts: (p.attempts || 0) + 1 }) });
  const got = await claim.json().catch(() => []);
  if (!Array.isArray(got) || !got.length) return { err: { ok: false, error: 'already_taken' } };
  return { p };
}
async function auditFix(k, id) {
  const c = await claimProposed(k, id, 'audit_fix'); if (c.err) return c.err;
  let r; try { r = await healSeo.auditDraft(c.p, k); } catch (e) { r = { ok: false, error: e.message }; }
  if (r.ok) await fetch(SB + '/heal_proposals?id=eq.' + c.p.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'verifying', verify_after: new Date(Date.now() + 7 * 86400000).toISOString(), result: 'Drafted ' + r.prs.length + ' pull request(s): ' + r.prs.map(x => x.page + ' ' + x.pr).join(' | ') + '. Merge them; the next weekly audit confirms the fix.' }) });
  else await fetch(SB + '/heal_proposals?id=eq.' + c.p.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'proposed', result: 'Not drafted: ' + r.error }) });
  return r;
}
async function pageDraftApprove(k, id) {
  const c = await claimProposed(k, id, 'page_draft'); if (c.err) return c.err;
  let r; try { r = await healSeo.pageDraft(c.p, k); } catch (e) { r = { ok: false, error: e.message }; }
  if (r.ok) await fetch(SB + '/heal_proposals?id=eq.' + c.p.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'pr_open', pr_url: r.pr_url, result: 'Page drafted: ' + r.explanation + ' Review and merge: ' + r.pr_url }) });
  else await fetch(SB + '/heal_proposals?id=eq.' + c.p.id, { method: 'PATCH', headers: H(k), body: JSON.stringify({ status: 'proposed', result: 'Page not drafted: ' + r.error }) });
  return r;
}
module.exports = { detect, scan, approve, reject, codefixDraft, auditFix, pageDraftApprove, codefix, ALLOW };
