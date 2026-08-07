// shift-autoclose.js — closes shifts the rep never clocked out of.
//
// The portal opens a shift automatically on the first logged dial or knock, and closes a
// stale one when the rep next does something. That covers a rep who keeps working; it does
// NOT cover the common case — they finish for the day and shut the laptop, leaving the
// shift open until their next login, which would bill a 16-hour day.
//
// This sweeps every 15 minutes and closes any shift idle past the threshold, stamping
// ended_at at the rep's LAST REAL ACTIVITY, not at the moment the sweep noticed. Hours are
// therefore the window in which the rep actually logged work — no button press involved,
// and nothing to forget.
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const IDLE_MIN = 45;          // no dial/knock for this long ⇒ the shift is over
const MAX_SHIFT_HOURS = 16;   // a shift longer than this is a mistake, not a workday

exports.handler = async function () {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!key) { console.error('[shift-autoclose] SUPA_SERVICE_KEY not set'); return { statusCode: 200, body: 'no key' }; }
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const REST = SUPA_URL + '/rest/v1';

  async function get(path) {
    const r = await fetch(REST + path, { headers: H });
    if (!r.ok) throw new Error(path + ' → HTTP ' + r.status);
    return r.json();
  }

  try {
    const open = await get('/rep_shifts?ended_at=is.null&select=id,rep_name,started_at&order=started_at.asc&limit=200');
    if (!open.length) return { statusCode: 200, body: 'No open shifts' };

    const cutoff = Date.now() - IDLE_MIN * 60000;
    let closed = 0;
    const notes = [];

    for (const sh of open) {
      const startedMs = new Date(sh.started_at).getTime();

      // The rep's most recent activity since this shift opened.
      const act = await get('/lead_activity?rep_name=eq.' + encodeURIComponent(sh.rep_name || '')
        + '&created_at=gte.' + encodeURIComponent(sh.started_at)
        + '&select=created_at&order=created_at.desc&limit=1');
      const lastIso = act.length ? act[0].created_at : null;
      const lastMs = lastIso ? new Date(lastIso).getTime() : startedMs;

      if (lastMs > cutoff) continue;   // still working

      // Close at the last real activity. A shift opened and never worked closes at its
      // start, contributing zero hours rather than a phantom block.
      let endIso = lastIso || sh.started_at;
      if ((new Date(endIso).getTime() - startedMs) > MAX_SHIFT_HOURS * 3600000) {
        endIso = new Date(startedMs + MAX_SHIFT_HOURS * 3600000).toISOString();
      }

      const upd = await fetch(REST + '/rep_shifts?id=eq.' + sh.id, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ ended_at: endIso, note: lastIso ? 'auto-closed at last activity' : 'auto-closed — no activity logged' })
      });
      if (upd.ok) {
        closed++;
        const mins = Math.round((new Date(endIso).getTime() - startedMs) / 60000);
        notes.push(`${sh.rep_name}: ${mins}m`);
      }
    }

    const msg = `Closed ${closed} of ${open.length} open shifts` + (notes.length ? ' — ' + notes.join(', ') : '');
    console.log('[shift-autoclose] ' + msg);
    return { statusCode: 200, body: msg };
  } catch (e) {
    console.error('[shift-autoclose] ' + e.message);
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};
