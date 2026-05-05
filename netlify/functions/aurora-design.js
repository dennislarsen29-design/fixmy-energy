const fetch = require('node-fetch');

exports.handler = async function(event) {
  const { design_id } = event.queryStringParameters || {};
  if (!design_id) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing design_id' }) };
  }

  const tenantId = process.env.AURORA_TENANT_ID;
  const apiKey   = process.env.AURORA_API_KEY;

  if (!tenantId || !apiKey) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Aurora API not configured. Set AURORA_TENANT_ID and AURORA_API_KEY in Netlify environment variables.' })
    };
  }

  try {
    const resp = await fetch(
      `https://api.aurorasolar.com/v2/tenants/${tenantId}/designs/${design_id}`,
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    const data = await resp.json();
    return {
      statusCode: resp.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};
