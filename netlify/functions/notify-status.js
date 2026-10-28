// Asks GHL what happened to the recent texts we sent (delivered / failed / undelivered) and writes it back to notification_log.
// Origin-allowlisted like the other internal functions. Returns the last 25 log rows.
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://fixmy.energy' };
exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (origin && !/^https:\/\/(www\.)?fixmy\.energy$|\.netlify\.app$/.test(origin)) return { statusCode: 403, headers: cors, body: '{}' };
  const K = process.env.SUPA_SERVICE_KEY, G = process.env.GHL_API_KEY;
  if (!K) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'not configured' }) };
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  const rows = await (await doFetch(SUPA + '/notification_log?select=*&order=at.desc&limit=25', { headers: H })).json().catch(() => []);
  if (G && Array.isArray(rows)) {
    for (const r of rows) {
      if (r.kind !== 'sms' || !r.message_id || (r.delivery && /delivered|failed|undelivered/i.test(r.delivery))) continue;
      try {
        const g = await doFetch('https://services.leadconnectorhq.com/conversations/messages/' + encodeURIComponent(r.message_id), { headers: { Authorization: 'Bearer ' + G, Version: '2021-04-15' } });
        const j = await g.json().catch(() => ({})), m = j.message || j, st = m.status || null, err = (m.meta && m.meta.error) || m.error || null;
        r.delivery = st ? (st + (err ? ': ' + String(err).slice(0, 80) : '')) : ('http ' + g.status);
        await doFetch(SUPA + '/notification_log?id=eq.' + r.id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ delivery: r.delivery, delivery_checked_at: new Date().toISOString() }) });
      } catch (e) {}
    }
  }
  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, rows: rows }) };
};
