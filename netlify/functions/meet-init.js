const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event) {
  var repId = (event.queryStringParameters || {}).r;
  if (!repId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing r param' }) };
  }

  var supabase = createClient(
    process.env.SUPA_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co',
    process.env.SUPA_SERVICE_KEY
  );

  var { data, error } = await supabase
    .from('team_members')
    .select('name, phone')
    .eq('id', repId)
    .maybeSingle();

  if (error || !data) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Rep not found' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ name: data.name || '', phone: data.phone || '' })
  };
};
