// Ops partner pay automation (see lib/ops-pay.js). POST { action: 'reconcile' | 'bonus', customerId }.
// The server recomputes everything from the database, so the caller cannot choose an amount.
const pay = require('./lib/ops-pay');
const ALLOWED = new Set(['fixmy.energy', 'www.fixmy.energy']);
function originOk(event) { const h = event.headers || {}; const src = h.origin || h.Origin || h.referer || h.Referer || ''; if (!src) return false; try { const host = new URL(src).hostname.toLowerCase(); return ALLOWED.has(host) || host.endsWith('.netlify.app'); } catch (e) { return false; } }
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!originOk(event)) return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Forbidden' }) };
  if (!process.env.SUPA_SERVICE_KEY) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'not_configured' }) };
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const id = String(b.customerId || '');
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Bad request' }) };
  try {
    const r = b.action === 'bonus' ? await pay.bonus(id) : b.action === 'approve_bonus' ? await pay.approveBonus(id) : b.action === 'reconcile' ? await pay.reconcile(id) : { ok: false, reason: 'unknown_action' };
    return { statusCode: 200, headers: cors, body: JSON.stringify(r) };
  } catch (e) { console.error('[ops-pay]', e.message); return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'error' }) }; }
};
