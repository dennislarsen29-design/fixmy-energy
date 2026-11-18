// ads-queue-scan.js — daily: looks for ads to pause and budgets that earned an increase, and queues them for Dennis. Never changes an ad.
const q = require('./lib/ads-queue');
exports.handler = async function () {
  try { const r = await q.scan(); console.log('[ads-queue-scan]', JSON.stringify(r)); return { statusCode: 200, body: JSON.stringify(r) }; }
  catch (e) { console.error('[ads-queue-scan] failed:', e.message); return { statusCode: 200, body: 'error: ' + e.message }; }
};
