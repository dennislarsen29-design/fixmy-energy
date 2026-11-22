// Nightly: re-read every live business listing page and confirm our name and phone are still on it.
// Scheduled in netlify.toml. Never submits anything. Env: SUPA_SERVICE_KEY.
const L = require('./lib/listings');

exports.handler = async function () {
  const k = process.env.SUPA_SERVICE_KEY;
  if (!k) return { statusCode: 200, body: 'SUPA_SERVICE_KEY not set' };
  const v = await L.load(k);
  const targets = v.items.filter(x => x.listing_url && x.status !== 'skip');
  const tally = {};
  for (let i = 0; i < targets.length; i += 5) {
    const res = await Promise.all(targets.slice(i, i + 5).map(x => L.checkItem(x, v.nap).catch(() => ({ result: 'unreachable', at: new Date().toISOString() }))));
    res.forEach((c, j) => { L.mergeCheck(targets[i + j], c); tally[c.result] = (tally[c.result] || 0) + 1; });
  }
  if (targets.length) await L.save(k, v);
  console.log('[listings-check]', JSON.stringify({ checked: targets.length, tally }));
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checked: targets.length, tally }) };
};
