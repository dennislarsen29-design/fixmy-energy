// Internal alerts (to the assigned rep, and Dennis) when a customer opens / signs a document.
// Built here so the message always carries the customer's NAME — the old GHL workflow texted
// "agreement has been opened." with no name because its merge fields never resolved.
// Public endpoint, so: only the event type + customer id + doc type come from the caller; text and
// recipients are built from our records, and each event requires the real document state.
const notify = require('./lib/notify');
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });
const DEFAULT_REP = 'tech4';

exports.handler = async function (event, context, deps) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method Not Allowed' });
  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return out(500, { error: 'Server misconfigured' });
  const doFetch = (deps && deps.fetch) || fetch;
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  let b; try { b = JSON.parse(event.body); } catch (e) { return out(400, { error: 'Invalid JSON' }); }
  const ev = b.event, id = String(b.customerId || ''), docType = String(b.docType || '');
  if (['document_opened', 'document_signed'].indexOf(ev) === -1) return out(400, { error: 'Unknown event' });
  if (!/^[0-9a-fA-F-]{36}$/.test(id) || !/^[a-z0-9_]{1,60}$/.test(docType)) return out(400, { error: 'Bad request' });

  const get = async (path) => (await (await doFetch(SUPA_URL + '/rest/v1' + path, { headers: H })).json().catch(() => null));
  const c = ((await get('/customers?id=eq.' + id + '&select=first_name,last_name,rep_id&limit=1')) || [])[0];
  const d = ((await get('/deal_documents?customer_id=eq.' + id + '&doc_type=eq.' + docType + '&select=status,data&limit=1')) || [])[0];
  if (!c || !d) return out(404, { ok: false });
  if (ev === 'document_opened' && d.status !== 'reviewed') return out(409, { ok: false, reason: 'state' });
  if (ev === 'document_signed' && d.status !== 'signed') return out(409, { ok: false, reason: 'state' });

  // One alert per event per document (opened is fired from the client; guard replays).
  const rlKey = 'staffalert_' + ev + '_' + id + '_' + docType;
  const rl = ((await get('/pipeline_state?key=eq.' + encodeURIComponent(rlKey) + '&select=value')) || [])[0];
  if (rl) return out(200, { ok: true, skipped: 'already_sent' });

  const dt = ((await get('/document_templates?doc_type=eq.' + docType + '&select=label&limit=1')) || [])[0];
  const docLabel = (dt && dt.label) || ({ cpuc_guide: 'CPUC Consumer Guide', tesla_sdcp: 'Tesla SDCP Agreement' })[docType] || docType.replace(/_/g, ' ');
  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'A customer';
  const msg = ev === 'document_opened'
    ? name + ' just opened the ' + docLabel + ' to sign.'
    : name + ' signed the ' + docLabel + '. ✅';

  const ids = [c.rep_id || DEFAULT_REP];
  if (ids.indexOf(DEFAULT_REP) === -1) ids.push(DEFAULT_REP);
  const results = [];
  for (const tid of ids) {
    const tm = ((await get('/team_members?id=eq.' + encodeURIComponent(tid) + '&select=name,phone&limit=1')) || [])[0];
    if (!tm || !tm.phone) { results.push({ to: tid, ok: false, reason: 'no_phone' }); continue; }
    const r = await notify.sendSms({ phone: tm.phone, first_name: tm.name }, msg, doFetch);
    results.push({ to: tid, ok: r.ok, reason: r.reason });
  }
  if (results.some(r => r.ok)) {
    await doFetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: rlKey, value: JSON.stringify({ ts: Date.now() }), updated_at: new Date().toISOString() }) }).catch(() => {});
  }
  return out(200, { ok: results.some(r => r.ok), results });
};
