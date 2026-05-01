// Proxies the diagnostic agreement webhook to GHL server-side,
// avoiding browser no-cors header stripping and enabling server logs.
exports.handler = async function(event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const GHL_URL = 'https://services.leadconnectorhq.com/hooks/gXWwbOVymY0iRfj7c1It/webhook-trigger/3d688c42-03ed-4960-ad82-64d2467ddaf1';

  let payload;
  try { payload = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  console.log('GHL diag-agreement → sending for:', payload.email, payload.phone, 'fee:', payload.diagnostic_fee);

  let ghlStatus, ghlBody;
  try {
    const resp = await fetch(GHL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; FixMyEnergy/1.0)',
        'Origin': 'https://fixmy.energy',
        'Referer': 'https://fixmy.energy/'
      },
      body: JSON.stringify(payload)
    });
    ghlStatus = resp.status;
    ghlBody   = await resp.text();
  } catch(e) {
    console.error('GHL fetch error:', e.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL unreachable', detail: e.message }) };
  }

  console.log('GHL response:', ghlStatus, ghlBody);

  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ ghlStatus, ghlBody })
  };
};
