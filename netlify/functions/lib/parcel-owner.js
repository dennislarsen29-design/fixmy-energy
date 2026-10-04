// County assessor roll lookup (parcel_owners table, loaded from the SanGIS PARCELS_ALL export).
//
// One implementation of address normalisation, used by BOTH the importer (parcel-owner.js,
// action 'import') and the lookup (parcel-owner.js 'lookup' + regrid-lookup.js step 0), so a
// key written at import time is exactly the key a lookup computes.
//
// Licence: owner data is internal-only. The table has RLS on and no policies — only these
// service-role paths can read it. Never return this data from a public page.

const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';

const SUFFIXES = new Set([
  'ST','STREET','AVE','AVENUE','RD','ROAD','DR','DRIVE','LN','LANE','CT','COURT','PL','PLACE',
  'BLVD','BOULEVARD','CIR','CIRCLE','TER','TERRACE','TRL','TRAIL','PKWY','PARKWAY','HWY','HIGHWAY',
  'SQ','SQUARE','WAY','LOOP','PT','POINT','ALY','ALLEY','CV','COVE','GLN','GLEN','PASS','RUN',
  'WALK','ROW','VW','VIEW','XING','CROSSING','PL'
]);
const DIRS = new Set(['N','S','E','W','NE','NW','SE','SW','NORTH','SOUTH','EAST','WEST']);

// Core street name: uppercase, punctuation stripped, leading/trailing directional and trailing
// suffix removed — "N Twin Oaks Valley Rd" and (street "TWIN OAKS VALLEY", pre_dir N, suffix RD)
// both reduce to "TWIN OAKS VALLEY".
function streetCore(raw) {
  let t = String(raw || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (t.length > 1 && DIRS.has(t[0])) t.shift();
  if (t.length > 1 && DIRS.has(t[t.length - 1])) t.pop();
  if (t.length > 1 && SUFFIXES.has(t[t.length - 1])) t.pop();
  return t.join(' ');
}

// "12712 Via Donada, Del Mar, CA 92014, USA" -> { house:'12712', core:'VIA DONADA', zip:'92014' }
function parseAddress(address) {
  const a = String(address || '');
  const first = a.split(',')[0].trim();
  const m = first.match(/^(\d+)[A-Za-z]?\s+(.+)$/);
  if (!m) return null;
  // Zip = last 5-digit run AFTER the house number (a 5-digit house number comes first).
  const zips = a.replace(/^\s*\d+\S*\s*/, '').match(/\b\d{5}\b/g) || [];
  const zip = zips.length ? zips[zips.length - 1] : '';
  if (!zip) return null;
  // Drop a unit suffix ("Apt 4", "#12", "Unit B") from the street part.
  const street = m[2].replace(/\s+(apt|unit|ste|suite|#)\s*\S*$/i, '').replace(/\s+#\S*$/, '');
  return { house: m[1], core: streetCore(street), zip: zip };
}

// One county CSV row (raw strings) -> parcel_owners row, or null when it can't be matched later.
function rowFromCounty(r) {
  const apn = String(r.apn || '').replace(/\D/g, '');
  if (!apn || /^7[67]/.test(apn)) return null;                // possessory-interest / mobile-home APNs
  const owner1 = String(r.o1 || '').trim();
  if (!owner1) return null;
  const house = String(r.no || '').replace(/\D/g, '').replace(/^0+/, '');
  const zipM = String(r.z || '').match(/\d{5}/);
  const core = streetCore(r.st);
  if (!house || !zipM || !core) return null;
  const x = parseFloat(r.x), y = parseFloat(r.y);
  return {
    apn: apn,
    owner1: owner1.slice(0, 120),
    owner2: String(r.o2 || '').trim().slice(0, 80) || null,
    house_no: house,
    street_core: core,
    zip: zipM[0],
    x: isFinite(x) ? Math.round(x * 1e6) / 1e6 : null,
    y: isFinite(y) ? Math.round(y * 1e6) / 1e6 : null
  };
}

function headers(extra) {
  const k = process.env.SUPA_SERVICE_KEY;
  return Object.assign({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, extra || {});
}

// Address -> { owner, apn, x, y } | null. Matches ONLY on zip + house number + street core name;
// when several parcels share them (condo units) it answers only if they agree on the owner.
async function lookup(address) {
  if (!process.env.SUPA_SERVICE_KEY) throw new Error('SUPA_SERVICE_KEY not set');
  const p = parseAddress(address);
  if (!p || !p.core) return null;
  const url = SUPA + '/parcel_owners?zip=eq.' + p.zip + '&house_no=eq.' + p.house +
    '&select=apn,owner1,owner2,street_core,x,y&limit=25';
  const resp = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(4000) });
  if (!resp.ok) throw new Error('parcel_owners ' + resp.status);
  const rows = (await resp.json()).filter(r => r.street_core === p.core);
  if (!rows.length) return null;
  const owners = new Set(rows.map(r => (r.owner1 + '|' + (r.owner2 || '')).toUpperCase()));
  if (owners.size !== 1) return null;                       // ambiguous — never guess
  const r = rows[0];
  return { owner: r.owner1 + (r.owner2 ? ' & ' + r.owner2 : ''), apn: r.apn, x: r.x, y: r.y };
}

module.exports = { streetCore, parseAddress, rowFromCounty, lookup, headers, SUPA };
