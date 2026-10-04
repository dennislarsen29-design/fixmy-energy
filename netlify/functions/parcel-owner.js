// County parcel owner lookup + bulk import (parcel_owners table).
//
//   POST { action:'lookup', address }            -> { found, owner, apn }
//   POST { action:'stats' }                      -> { count }
//   POST { action:'import', rows:[{apn,o1,o2,no,st,z,x,y}, ...] }   (needs x-import-key)
//
// Import is gated by the PARCEL_IMPORT_KEY Netlify env var so a stranger cannot write to the
// table; the table itself is RLS-locked (no anon policies). Lookup/stats are origin-allowlisted
// like the other internal functions. Owner data must never be shown on a public page.

const P = require('./lib/parcel-owner');
const { originAllowed } = require('./lib/plaid');

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-import-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  if (!originAllowed(event)) return reply(403, { error: 'Forbidden' });
  if (!process.env.SUPA_SERVICE_KEY) return reply(500, { error: 'SUPA_SERVICE_KEY not set in Netlify' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }

  try {
    if (req.action === 'lookup') {
      const hit = await P.lookup(req.address);
      return reply(200, hit ? { found: true, owner: hit.owner, apn: hit.apn } : { found: false });
    }

    if (req.action === 'stats') {
      const resp = await fetch(P.SUPA + '/parcel_owners?select=apn&limit=1', { headers: P.headers({ Prefer: 'count=exact' }) });
      if (!resp.ok) return reply(500, { error: 'parcel_owners ' + resp.status });
      const m = String(resp.headers.get('content-range') || '').match(/\/(\d+)$/);
      return reply(200, { count: m ? parseInt(m[1], 10) : 0 });
    }

    if (req.action === 'import') {
      const want = process.env.PARCEL_IMPORT_KEY;
      if (!want) return reply(500, { error: 'import_key_not_configured' });
      const h = event.headers || {};
      if ((h['x-import-key'] || h['X-Import-Key'] || '') !== want) return reply(401, { error: 'bad_import_key' });
      const rows = Array.isArray(req.rows) ? req.rows.slice(0, 2000) : [];
      const byApn = {};
      let skipped = 0;
      rows.forEach(r => {
        const row = P.rowFromCounty(r || {});
        if (row) byApn[row.apn] = row; else skipped++;       // one row per APN per batch (Postgres rejects dupes)
      });
      const out = Object.keys(byApn).map(k => byApn[k]);
      if (out.length) {
        const resp = await fetch(P.SUPA + '/parcel_owners?on_conflict=apn', {
          method: 'POST',
          headers: P.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify(out)
        });
        if (!resp.ok) return reply(500, { error: 'insert_failed', detail: (await resp.text()).slice(0, 300) });
      }
      return reply(200, { ok: true, written: out.length, skipped: skipped });
    }

    return reply(400, { error: 'unknown action' });
  } catch (e) {
    console.error('[parcel-owner] ' + e.message);
    return reply(500, { error: e.message });
  }
};
