// Runs every 15 minutes: turns collected cash into referral payouts (see lib/referrals.js). Idempotent.
const R = require('./lib/referrals');
exports.handler = async function (event, context, deps) {
  const db = R.client(deps);
  if (!db.key) return { statusCode: 500, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY missing' }) };
  try {
    const r = await R.settleAll(db, 500);
    console.log('[referral-settle]', JSON.stringify(r));
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ ok: true }, r)) };
  } catch (e) {
    console.warn('[referral-settle] failed', e.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
