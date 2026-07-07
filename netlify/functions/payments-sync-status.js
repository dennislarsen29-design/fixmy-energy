// Returns the result summary of the last GHL payments reconcile run, so the
// portal's Money Owed view can show exactly what the background sweep did
// (fetched / recorded / unmatched / errors) instead of leaving admins guessing.
// The sweep writes its stats to app_config (service-role-only table); this
// endpoint proxies just that one key to the portal.
exports.handler = async function() {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return { statusCode: 200, headers: cors, body: JSON.stringify({ never: true, note: 'SUPA_SERVICE_KEY not set' }) };
  const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
  try {
    const resp = await fetch(SUPA_URL + '/rest/v1/app_config?key=eq.payments_last_sync&select=value,updated_at', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
    });
    const rows = resp.ok ? await resp.json() : [];
    if (!rows.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ never: true }) };
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ...rows[0].value, updated_at: rows[0].updated_at }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ never: true, note: e.message }) };
  }
};
