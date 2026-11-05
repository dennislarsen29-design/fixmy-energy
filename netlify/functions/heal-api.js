// Portal -> self-healing. Actions: list, approve, reject, scan. Origin-allowlisted like the other internal functions
// (no server-verified staff session exists). Approve can only run an allowlisted function named by a DB row.
const heal = require('./lib/heal');
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
exports.handler = async function (event) {
  const origin = (event.headers || {}).origin || '';
  const cors = { 'Access-Control-Allow-Origin': OK.indexOf(origin) > -1 ? origin : OK[0], 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const J = (c, o) => ({ statusCode: c, headers: cors, body: JSON.stringify(o) });
  if (OK.indexOf(origin) < 0 && !/\.netlify\.app$/.test(origin.replace(/^https?:\/\//, ''))) return J(403, { error: 'forbidden' });
  const k = process.env.SUPA_SERVICE_KEY;
  if (!k) return J(500, { error: 'no_key' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { error: 'bad_json' }); }
  try {
    if (b.action === 'list') {
      const r = await fetch(SB + '/heal_proposals?select=*&or=(status.in.(proposed,running,verifying,pr_open),closed_at.gte.' + encodeURIComponent(new Date(Date.now() - 3 * 86400000).toISOString()) + ')&order=created_at.desc&limit=40', { headers: { apikey: k, Authorization: 'Bearer ' + k } });
      const rows = await r.json();
      rows.forEach(x => { x.codefix_ok = !!heal.codefix.fileFor(x.system) && x.status === 'proposed'; });
      return J(200, { ok: true, rows });
    }
    if (b.action === 'approve') return J(200, await heal.approve(k, b.id));
    if (b.action === 'codefix') return J(200, await heal.codefixDraft(k, b.id));
    if (b.action === 'reject') return J(200, await heal.reject(k, b.id));
    if (b.action === 'scan') return J(200, Object.assign({ ok: true }, await heal.scan(k)));
    return J(400, { error: 'unknown_action' });
  } catch (e) { return J(500, { error: e.message }); }
};
