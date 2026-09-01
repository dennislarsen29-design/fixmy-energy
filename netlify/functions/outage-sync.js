// outage-sync.js
// Pulls live SDG&E power-outage data from California's public statewide outage feed
// (NOT outage.sdge.com directly — that's SDG&E's own bot-protected consumer map;
// the state publishes the same underlying data as an open ArcGIS FeatureServer,
// refreshed every ~15 min, covering PG&E/SCE/SDG&E/SMUD: see data.ca.gov "Power
// Outage Areas"). Written defensively — the exact field schema wasn't reachable to
// verify from the dev sandbox (services.arcgis.com is blocked by that environment's
// network policy), so this self-discovers the Incidents layer + utility/zip fields
// at runtime instead of hardcoding names, and logs what it finds so a first live
// run (Netlify function logs) can confirm the match before this is trusted further.
//
// Writes a single pipeline_state row (key: 'sdge_outages') — current-snapshot only,
// no history, matching the transient nature of outage data (mirrors the
// expansion_index/phase0_insights key-value pattern in bb-auto-pipeline-background.js).
//
// Scheduled every 20 min via netlify.toml. Also callable manually via
// POST/GET /.netlify/functions/outage-sync

const SUPA_URL  = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';
const FEATURESERVER = 'https://services.arcgis.com/BLN4oKB0N1YSgvY8/arcgis/rest/services/Power_Outages_(View)/FeatureServer';

function looksLikeUtilityField(key) { return /util|company|owner/i.test(key); }
function looksLikeZipField(key) { return /zip/i.test(key); }
function looksLikeCityField(key) { return /city/i.test(key); }
function looksLikeCountField(key) { return /(cust|affect).*count|count.*(cust|affect)/i.test(key); }
function looksLikeStartField(key) { return /start|begin|outage.*date|date.*outage/i.test(key); }
function valueMatchesSDGE(v) { return typeof v === 'string' && /sdg\s*&?\s*e|san\s*diego\s*gas/i.test(v); }

// ⚠️ 2026-09-01, per Dennis: "I don't ever see that there is an outage." The sync WAS running
// (every 20 min, real SDG&E incidents found) but the "Power Outage Incidents" layer's own schema
// carries only a County field, no zip or city — confirmed live from a real run's log. `zips`
// (the only thing the portal's badge logic ever reads) stayed permanently empty regardless of
// how many real outages existed, which is indistinguishable from "no outages" — same "never let
// an untaken code path render identically to a real negative" rule as everywhere else in this
// file. Fixed by reusing geometry the ArcGIS response DOES carry: point-in-polygon each incident's
// lat/lng against the ZCTA zip boundaries this project already fetches and caches for the Black
// Box Coverage map (zip-boundaries.js → pipeline_state.zip_boundaries_geojson) — no dependency on
// the outage feed's schema ever having a zip field at all. Dependency-free ray-casting (no turf.js
// in this project's Netlify functions), fine at this scale: a handful of incidents against a few
// hundred cached zip polygons completes in milliseconds.
function pointInRing(pt, ring) {
  var x = pt[0], y = pt[1], inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function pointInPolygonGeom(pt, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') {
    var rings = geom.coordinates || [];
    if (!rings.length || !pointInRing(pt, rings[0])) return false; // outside the outer ring
    for (var h = 1; h < rings.length; h++) { if (pointInRing(pt, rings[h])) return false; } // inside a hole
    return true;
  }
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates || []).some(function (poly) { return pointInPolygonGeom(pt, { type: 'Polygon', coordinates: poly }); });
  }
  return false;
}
function resolveZipForPoint(lng, lat, zipFeatures) {
  var pt = [lng, lat];
  for (var i = 0; i < zipFeatures.length; i++) {
    var f = zipFeatures[i];
    if (f && f.properties && f.properties.zip && pointInPolygonGeom(pt, f.geometry)) return f.properties.zip;
  }
  return null;
}
async function fetchCachedZipBoundaries(supaHeaders, stamp) {
  try {
    const r = await fetch(SUPA_REST + '/pipeline_state?key=eq.zip_boundaries_geojson&select=value', { headers: supaHeaders });
    if (!r.ok) { stamp('zip boundary fetch failed: HTTP ' + r.status); return []; }
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) { stamp('no cached zip boundaries row — run "Refresh Boundaries" on the Coverage map first'); return []; }
    const v = rows[0].value;
    const geojson = typeof v === 'string' ? JSON.parse(v) : v;
    const features = (geojson && geojson.features) || [];
    stamp('Loaded ' + features.length + ' cached zip boundary polygons (fetched ' + (geojson && geojson.fetched_at || 'unknown') + ')');
    return features;
  } catch (e) { stamp('zip boundary fetch/parse failed: ' + e.message); return []; }
}

exports.handler = async function (event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const supaKey = process.env.SUPA_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };
  const supaHeaders = { 'Content-Type': 'application/json', apikey: supaKey, Authorization: 'Bearer ' + supaKey };

  const log = [];
  function stamp(msg) { log.push(msg); console.log('[outage-sync] ' + msg); }

  try {
    // Step 1: discover which layer is the point-based Incidents layer (don't hardcode an index —
    // the plan explicitly calls for verifying schema live rather than guessing).
    const metaResp = await fetch(FEATURESERVER + '?f=json');
    if (!metaResp.ok) throw new Error('FeatureServer metadata fetch failed: HTTP ' + metaResp.status);
    const meta = await metaResp.json();
    const layers = meta.layers || [];
    stamp('Layers found: ' + layers.map(l => l.id + ':' + l.name).join(', '));
    const incidentLayer = layers.find(l => /incident/i.test(l.name || ''))
      || layers.find(l => (l.geometryType || '').toLowerCase() === 'esrigeometrypoint')
      || layers[0];
    if (!incidentLayer) throw new Error('No usable layer found in FeatureServer');
    stamp('Using layer id=' + incidentLayer.id + ' name="' + incidentLayer.name + '"');

    // Step 2: pull all current records for that layer (current-snapshot data, no date filter needed —
    // upstream only carries live outages, no history). outSR=4326 so any point geometry comes back
    // as plain WGS84 lng/lat — needed for the point-in-polygon zip fallback below.
    const queryUrl = FEATURESERVER + '/' + incidentLayer.id + '/query?where=1%3D1&outFields=*&outSR=4326&returnGeometry=true&f=json&resultRecordCount=2000';
    const dataResp = await fetch(queryUrl);
    if (!dataResp.ok) throw new Error('Incident query failed: HTTP ' + dataResp.status);
    const data = await dataResp.json();
    const features = data.features || [];
    stamp('Total incident records (all utilities): ' + features.length);

    if (!features.length) {
      await upsertSnapshot(supaHeaders, { synced_at: new Date().toISOString(), sdge_incident_count: 0, zips: [], note: 'No incident records returned', log });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, sdge_incident_count: 0, log }) };
    }

    // Step 3: heuristically find the utility field + zip/city fields from the actual returned
    // attribute keys (schema wasn't verifiable ahead of time — self-discover instead of guessing).
    const sampleAttrs = features[0].attributes || {};
    const keys = Object.keys(sampleAttrs);
    const utilityKey = keys.find(looksLikeUtilityField);
    const zipKey = keys.find(looksLikeZipField);
    const cityKey = keys.find(looksLikeCityField);
    const countKey = keys.find(looksLikeCountField);
    const startKey = keys.find(looksLikeStartField);
    stamp('Field guesses — utility:"' + utilityKey + '" zip:"' + zipKey + '" city:"' + cityKey + '" count:"' + countKey + '" start:"' + startKey + '"');
    stamp('Sample attributes: ' + JSON.stringify(sampleAttrs).slice(0, 500));

    // Step 4: filter to SDG&E. If no utility field was found at all, bail out rather than silently
    // treating every utility's outages as SDG&E's.
    let sdgeFeatures = features;
    if (utilityKey) {
      sdgeFeatures = features.filter(f => valueMatchesSDGE(f.attributes && f.attributes[utilityKey]));
    } else {
      stamp('WARNING: no utility field detected — cannot confidently filter to SDG&E, skipping this run');
      await upsertSnapshot(supaHeaders, { synced_at: new Date().toISOString(), sdge_incident_count: null, zips: [], note: 'No utility field found in schema — needs manual review', log });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'no_utility_field', log }) };
    }
    stamp('SDG&E incident records: ' + sdgeFeatures.length);

    // Step 5: extract zips directly if the schema has them; otherwise point-in-polygon each
    // incident's geometry against the cached ZCTA boundaries (the real schema for this feed
    // has no zip/city field at all — see the note above pointInRing — so this is the normal
    // path, not a rare fallback).
    const zipCounts = {};
    const cities = new Set();
    let geoResolved = 0, geoAttempted = 0;
    let zipBoundaryFeatures = null; // lazy-loaded only if actually needed
    for (const f of sdgeFeatures) {
      const a = f.attributes || {};
      let z = null;
      if (zipKey && a[zipKey]) {
        const raw = String(a[zipKey]).replace(/\D/g, '').slice(0, 5);
        if (raw.length === 5) z = raw;
      }
      if (!z && f.geometry && typeof f.geometry.x === 'number' && typeof f.geometry.y === 'number') {
        if (zipBoundaryFeatures === null) zipBoundaryFeatures = await fetchCachedZipBoundaries(supaHeaders, stamp);
        geoAttempted++;
        z = resolveZipForPoint(f.geometry.x, f.geometry.y, zipBoundaryFeatures);
        if (z) geoResolved++;
      }
      if (z) zipCounts[z] = (zipCounts[z] || 0) + (countKey ? (parseInt(a[countKey], 10) || 1) : 1);
      if (cityKey && a[cityKey]) cities.add(String(a[cityKey]).trim());
    }
    const zips = Object.keys(zipCounts).sort((a, b) => zipCounts[b] - zipCounts[a])
      .map(z => ({ zip: z, affected: zipCounts[z] }));
    stamp('Resolved zips: ' + zips.map(z => z.zip + '(' + z.affected + ')').join(', '));
    if (!zipKey) stamp('No zip field in schema — resolved ' + geoResolved + '/' + geoAttempted + ' incidents via point-in-polygon against cached zip boundaries' + (cities.size ? '; cities also recorded: ' + Array.from(cities).slice(0, 20).join(', ') : ''));

    const snapshot = {
      synced_at: new Date().toISOString(),
      sdge_incident_count: sdgeFeatures.length,
      zips: zips,
      cities: zipKey ? undefined : Array.from(cities).slice(0, 50),
      log
    };
    await upsertSnapshot(supaHeaders, snapshot);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, sdge_incident_count: sdgeFeatures.length, zips: zips.length, log }) };
  } catch (e) {
    stamp('ERROR: ' + e.message);
    // ⚠️ This used to return 500 and write NOTHING, so a broken feed left the last good
    // snapshot in place (or no row at all) and the portal rendered zero outage badges —
    // exactly what a genuinely calm night looks like. A failing path must never be
    // indistinguishable from a real negative. Record the failure instead, keeping the
    // last known zips so a transient blip doesn't blank the badges mid-shift.
    try {
      const prev = await readSnapshot(supaHeaders);
      await upsertSnapshot(supaHeaders, {
        synced_at: prev && prev.synced_at || null,   // NOT now — the data did not refresh
        failed_at: new Date().toISOString(),
        error: e.message,
        sdge_incident_count: prev ? prev.sdge_incident_count : null,
        zips: (prev && Array.isArray(prev.zips)) ? prev.zips : [],
        log
      });
    } catch (e2) { stamp('could not record the failure: ' + e2.message); }
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message, log }) };
  }
};

// Last stored snapshot, so a failed run can preserve the previous zips rather than
// blanking the badges while it retries 20 minutes later.
async function readSnapshot(supaHeaders) {
  try {
    const r = await fetch(SUPA_REST + '/pipeline_state?key=eq.sdge_outages&select=value', { headers: supaHeaders });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const v = rows[0].value;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch (e) { return null; }
}

async function upsertSnapshot(supaHeaders, snapshot) {
  await fetch(SUPA_REST + '/pipeline_state', {
    method: 'POST',
    headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'sdge_outages', value: JSON.stringify(snapshot), updated_at: new Date().toISOString() })
  });
}
