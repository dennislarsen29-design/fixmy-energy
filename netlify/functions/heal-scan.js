// Self-healing scan: every 2h. Opens proposals and verifies approved ones. Never runs a fix itself.
const heal = require('./lib/heal');
exports.handler = async function () {
  const k = process.env.SUPA_SERVICE_KEY;
  if (!k) return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'no_key' }) };
  try { const r = await heal.scan(k); return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) }; }
  catch (e) { console.error('[heal-scan]', e.message); return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) }; }
};
