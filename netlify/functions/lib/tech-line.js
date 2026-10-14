// "You can call your Tech, <name>, directly at (xxx) xxx-xxxx." — the lead's assigned rep (else Dennis).
// Put into follow-up DRAFTS so the rep sees exactly what the customer will get. '' when no phone on file.
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
async function techLineFor(customerId, key, doFetch) {
  try {
    if (!key || !/^[0-9a-fA-F-]{36}$/.test(String(customerId || ''))) return '';
    const H = { apikey: key, Authorization: 'Bearer ' + key };
    const f = doFetch || fetch;
    const cr = await f(SUPA + '/customers?id=eq.' + customerId + '&select=rep_id&limit=1', { headers: H });
    const c = ((await cr.json().catch(() => null)) || [])[0];
    const tr = await f(SUPA + '/team_members?id=eq.' + encodeURIComponent((c && c.rep_id) || 'tech4') + '&select=name,phone&limit=1', { headers: H });
    const t = ((await tr.json().catch(() => null)) || [])[0];
    const d = t && String(t.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (t && t.name && d && d.length === 10) return 'You can call your Tech, ' + String(t.name).trim() + ', directly at (' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) + '.';
  } catch (e) {}
  return '';
}
module.exports = { techLineFor };
