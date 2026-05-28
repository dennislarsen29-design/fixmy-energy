const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' };
  }

  var repId = (event.queryStringParameters || {}).r;
  if (!repId) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing r param' }) };
  }

  var SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  var url = SUPA_URL + '/rest/v1/team_members?id=eq.' + encodeURIComponent(repId) + '&select=name,phone&limit=1';
  var resp = await fetch(url, {
    headers: {
      'apikey': SUPA_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPA_SERVICE_KEY
    }
  });
  var rows = await resp.json();
  if (!Array.isArray(rows) || !rows.length) {
    return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Rep not found' }) };
  }
  return {
    statusCode: 200,
    headers: cors,
    body: JSON.stringify({ name: rows[0].name || '', phone: rows[0].phone || '' })
  };
};
