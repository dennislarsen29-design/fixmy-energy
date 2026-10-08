// POST /.netlify/functions/proposal-accepted  { customerId, code }
// Called by the customer's proposal page right after they approve. Opens the CPUC guide for our rep
// to sign (the customer can't sign until the rep has) and texts the assigned rep + Dennis the link.
const crypto = require('crypto');
const notify = require('./lib/notify');
const chain = require('./lib/doc-chain');

const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const out = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
function normPhone(p) { let d = String(p || '').replace(/[^0-9]/g, ''); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1); if (d.length > 11) d = d.slice(-10); return d; }
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }
function codeMatches(code, c) { const n = normPhone(code); return (n.length >= 10 && n === normPhone(c.phone)) || (n.length >= 10 && n === normPhone(c.access_code)) || safeEqual(code, c.access_code) || safeEqual(code, c.phone); }

exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const SK = process.env.SUPA_SERVICE_KEY;
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  if (!SK) return out(500, { error: 'not configured' });
  const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  const id = String(b.customerId || ''); const code = String(b.code || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !code) return out(400, { error: 'missing fields' });

  const r = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id + '&select=id,first_name,last_name,phone,email,access_code,rep_id,lead_category,proposal&limit=1', { headers: H });
  const rows = await r.json().catch(function () { return null; });
  const c = Array.isArray(rows) && rows[0];
  if (!c || !codeMatches(code, c)) return out(403, { error: 'Not authorized' });
  const prop = typeof c.proposal === 'string' ? (function () { try { return JSON.parse(c.proposal); } catch (e) { return null; } })() : c.proposal;
  if (!prop || prop.status !== 'accepted') return out(409, { error: 'Proposal is not approved' });
  if (c.lead_category === 'new_solar') return out(200, { ok: true, skipped: 'axia' });

  // Open the CPUC guide for the rep. ignore-duplicates: a second call (refresh/replay) changes nothing and doesn't re-text.
  const ins = await doFetch(SUPA_URL + '/rest/v1/deal_documents?on_conflict=customer_id,doc_type', {
    method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify({ customer_id: id, doc_type: 'cpuc_guide', status: 'pending', data: { opened_by: 'proposal_approval', at: new Date().toISOString() } })
  });
  const created = await ins.json().catch(function () { return []; });
  if (!ins.ok) return out(502, { error: 'Could not open the document' });
  if (!Array.isArray(created) || !created.length) return out(200, { ok: true, already: true });

  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'A customer';
  const opt = chain.acceptedOption(prop);
  const label = (opt && (opt.title || opt.name)) || 'their proposal';
  const link = 'https://fixmy.energy/portal?signdoc=' + id;
  const msg = '✅ ' + name + ' approved ' + label + '. Sign the CPUC guide so it goes to them: ' + link;
  const ctx = { doFetch, H, SUPA_URL };
  let texted = 0;
  try { for (const t of await chain.ownerPhones(ctx, c)) { const s = await notify.sendSms({ phone: t.phone, first_name: t.name }, msg, doFetch); if (s.ok) texted++; } } catch (e) {}
  return out(200, { ok: true, created: true, texted });
};
