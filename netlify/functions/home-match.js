// Lead Capture "we already know this home" preview + post-create enrich. Origin-allowlisted like the other internal functions.
const hm = require('./lib/home-match');
const OK = ['https://fixmy.energy', 'https://www.fixmy.energy'];
exports.handler = async (event) => {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const cors = { 'Access-Control-Allow-Origin': OK.indexOf(origin) > -1 ? origin : OK[0], 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: '{}' };
  if (OK.indexOf(origin) === -1 && !/\.netlify\.app$|localhost/.test(origin)) return { statusCode: 403, headers: cors, body: '{}' };
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  const out = b.action === 'enrich' ? await hm.enrich(String(b.customerId || '')) : await hm.preview(String(b.address || ''));
  return { statusCode: 200, headers: cors, body: JSON.stringify(out) };
};
