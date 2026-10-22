// Home match (2026-10-22, per Dennis): when a lead comes in (online booking, flyer, call-in, setter form),
// find the Black Box record for the SAME home (exact normalized street + zip) and ADD what we already know —
// original installer, install year, system size, owner of record, APN, mailing/absentee — to the new lead.
// RULES: fill blanks only (the lead's own data is never overwritten); only an exact, unambiguous street+zip
// match is merged (anything else returns nothing); the Black Box row is archived (reversible), never deleted,
// and its call history is repointed to the lead. Never throws — a failed match must not fail a booking.
const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUF = { LANE:'LN', ROAD:'RD', STREET:'ST', DRIVE:'DR', AVENUE:'AVE', COURT:'CT', PLACE:'PL', BOULEVARD:'BLVD', CIRCLE:'CIR', TERRACE:'TER', TRAIL:'TRL', PARKWAY:'PKWY', HIGHWAY:'HWY', WAY:'WAY', NORTH:'N', SOUTH:'S', EAST:'E', WEST:'W' };
function zipOf(a) { const m = String(a || '').match(/\b(\d{5})\b/g); return m ? m[m.length - 1] : ''; }
function streetOf(a) {
  return String(a || '').split(',')[0].toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    .split(' ').map(w => SUF[w] || w).join(' ');
}
function keyOf(a) { const s = streetOf(a), z = zipOf(a); return (s && z) ? s + '|' + z : ''; }
// Fields copied onto the lead ONLY when the lead's own value is blank.
const FILL = ['original_installer', 'install_year', 'system_size', 'title_owner', 'apn', 'mail_address', 'mail_city', 'mail_state', 'mail_zip', 'absentee', 'lat', 'lng', 'phone', 'email'];

function heads() {
  const key = process.env.SUPA_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPA_KEY;
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
}
async function findMatch(address, excludeId, doFetch) {
  doFetch = doFetch || fetch;
  const key = keyOf(address); if (!key) return null;
  const num = (String(address).trim().match(/^\d+/) || [''])[0]; if (!num) return null;
  const q = SUPA_URL + '/rest/v1/customers?select=*&address=ilike.' + encodeURIComponent(num + ' %')
    + '&or=(black_box.is.true,lead_source.eq.orphaned_list)&archived=is.false' + (excludeId ? '&id=neq.' + excludeId : '') + '&limit=40';
  const r = await doFetch(q, { headers: heads() }); if (!r.ok) return null;
  const hits = ((await r.json()) || []).filter(x => keyOf(x.address) === key);
  return hits.length === 1 ? hits[0] : null;   // 0 or >1 → don't guess
}
function summary(bb) {
  const bits = [];
  if (bb.original_installer) bits.push('installer: ' + bb.original_installer);
  if (bb.install_year) bits.push('installed ' + bb.install_year);
  if (bb.system_size) bits.push('system ' + bb.system_size + ' kW');
  if (bb.title_owner) bits.push('owner of record: ' + bb.title_owner);
  if (bb.apn) bits.push('APN ' + bb.apn);
  if (bb.absentee === true) bits.push('owner lives elsewhere (likely rental)');
  return bits.join(' · ');
}
// Preview only — what we already know about this home (used by the Lead Capture form).
async function preview(address, doFetch) {
  try { const bb = await findMatch(address, null, doFetch); if (!bb) return { found: false };
    return { found: true, original_installer: bb.original_installer || null, install_year: bb.install_year || null, system_size: bb.system_size || null,
      title_owner: bb.title_owner || null, apn: bb.apn || null, absentee: bb.absentee === true, first_name: bb.first_name || null, last_name: bb.last_name || null,
      phone: bb.phone || null, email: bb.email || null, summary: summary(bb) };
  } catch (e) { return { found: false }; }
}
async function enrich(leadId, doFetch) {
  doFetch = doFetch || fetch;
  try {
    if (!leadId) return { ok: false, reason: 'no_id' };
    const H = heads(), base = SUPA_URL + '/rest/v1/customers';
    const lr = await doFetch(base + '?id=eq.' + encodeURIComponent(leadId) + '&select=*', { headers: H });
    const lead = ((await lr.json()) || [])[0]; if (!lead || !lead.address) return { ok: false, reason: 'no_lead' };
    if (lead.black_box === true && lead.lead_source === 'orphaned_list') return { ok: true, skipped: 'is_black_box' };
    if ((lead.notes || '').indexOf('Home match') > -1) return { ok: true, skipped: 'already_matched' };
    const bb = await findMatch(lead.address, leadId, doFetch); if (!bb) return { ok: true, matched: false };
    const patch = {}; FILL.forEach(f => {
      const mine = lead[f], theirs = bb[f];
      if ((mine === null || mine === undefined || mine === '') && theirs !== null && theirs !== undefined && theirs !== '') patch[f] = theirs;
    });
    let notes = []; try { notes = JSON.parse(lead.notes || '[]'); if (!Array.isArray(notes)) notes = []; } catch (e) { notes = lead.notes ? [{ ts: null, by: 'Legacy', text: lead.notes }] : []; }
    notes.push({ ts: new Date().toISOString(), by: '🏠 Home match', text: 'Home match — we already had this address on file (Black Box). ' + summary(bb) + '. Added to this lead; nothing you entered was changed.' });
    patch.notes = JSON.stringify(notes);
    await doFetch(base + '?id=eq.' + encodeURIComponent(leadId), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    // Keep the history, retire the duplicate (archived, restorable — never deleted).
    await doFetch(SUPA_URL + '/rest/v1/lead_activity?customer_id=eq.' + encodeURIComponent(bb.id), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ customer_id: leadId }) }).catch(() => {});
    let bbNotes = []; try { bbNotes = JSON.parse(bb.notes || '[]'); if (!Array.isArray(bbNotes)) bbNotes = []; } catch (e) {}
    bbNotes.push({ ts: new Date().toISOString(), by: '🏠 Home match', text: 'Merged into live lead ' + leadId + ' (archived, restorable).' });
    await doFetch(base + '?id=eq.' + encodeURIComponent(bb.id), { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ archived: true, black_box: false, notes: JSON.stringify(bbNotes) }) });
    return { ok: true, matched: true, from: bb.id, added: Object.keys(patch).filter(k => k !== 'notes') };
  } catch (e) { return { ok: false, reason: 'error', detail: e.message }; }
}
module.exports = { enrich, preview, findMatch, keyOf };
