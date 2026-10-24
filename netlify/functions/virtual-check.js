const vc = require('./lib/virtual-check');
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
exports.handler = async (event) => {
  const o = (event.headers || {}).origin || '';
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': OK.includes(o) ? o : OK[0], 'Access-Control-Allow-Headers': 'Content-Type' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: h, body: '' };
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  // Public pre-booking check (no customer yet): { lat, lng } or { address } -> { virtual: true|false|null }
  if (!b.customerId && (b.address || (b.lat != null && b.lng != null))) {
    return { statusCode: 200, headers: h, body: JSON.stringify(await vc.checkPoint({ lat: b.lat, lng: b.lng, address: b.address })) };
  }
  if (!b.customerId || !/^[0-9a-f-]{36}$/i.test(String(b.customerId))) return { statusCode: 400, headers: h, body: JSON.stringify({ ok: false }) };
  return { statusCode: 200, headers: h, body: JSON.stringify(await vc.check(b.customerId)) };
};
