// Daily: moves quiet leads onto the newsletter list (2026-10-27, per Dennis).
//   - Not interested: 60 days since the last contact/update, no reply -> listed
//   - Paused: all reminders sent (3, or 2 if sensitive) -> listed
// Never lists: Dead, Do Not Contact, sold jobs, unsubscribed, no email, purchased/door/Black Box leads (no consent to market).
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const DAY = 864e5;
exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const KEY = process.env.SUPA_SERVICE_KEY; if (!KEY) return { statusCode: 500, body: 'no key' };
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const base = '/customers?select=id,disposition_exit,recapture_touches,recapture_sensitive,recapture_last_at,updated_at,lead_source,black_box,email'
    + '&disposition_exit=in.(paused,not_interested)&newsletter_status=is.null&dnc=not.eq.true&sold_type=is.null&archived=not.eq.true&email=not.is.null&limit=1000';
  let rows = [];
  try { const r = await doFetch(SUPA + base, { headers: H }); const j = await r.json(); rows = Array.isArray(j) ? j : []; } catch (e) { return { statusCode: 500, body: 'query failed' }; }
  const blockedSrc = /orphaned_list|lead_locker|sunrun/i;
  const ids = rows.filter(c => {
    if (c.black_box === true || blockedSrc.test(c.lead_source || '') || !/@/.test(c.email || '')) return false;
    if (c.disposition_exit === 'not_interested') { const last = new Date(c.recapture_last_at || c.updated_at || 0).getTime(); return last && Date.now() - last >= 60 * DAY; }
    return (c.recapture_touches || 0) >= (c.recapture_sensitive ? 2 : 3);
  }).map(c => c.id);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    await doFetch(SUPA + '/customers?id=in.(' + chunk.join(',') + ')', { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ newsletter_status: 'listed', newsletter_listed_at: new Date().toISOString() }) });
  }
  console.log('newsletter-listing: listed', ids.length, 'of', rows.length);
  return { statusCode: 200, body: JSON.stringify({ listed: ids.length, checked: rows.length }) };
};
