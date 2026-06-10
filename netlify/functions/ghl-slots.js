// Proxies GHL free-slots API — keeps GHL_API_KEY server-side.
// GET /.netlify/functions/ghl-slots?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const params       = event.queryStringParameters || {};
  const calendarId   = params.calendarId || process.env.GHL_DIAG_CALENDAR_ID || process.env.GHL_CALENDAR_ID;
  const timezone     = params.timezone || 'America/Los_Angeles';

  if (!calendarId) return { statusCode: 400, body: JSON.stringify({ error: 'calendarId required' }) };
  if (!process.env.GHL_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'GHL_API_KEY not set' }) };

  const now       = new Date();
  const startDate = params.startDate || now.toISOString().split('T')[0];
  const endDate   = params.endDate   || new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const url = `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots`
    + `?startDate=${startDate}&endDate=${endDate}&timezone=${encodeURIComponent(timezone)}`;

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.GHL_API_KEY}`,
        Version: '2021-04-15',
      },
    });
    const body = await resp.text();
    return {
      statusCode: resp.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body,
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
