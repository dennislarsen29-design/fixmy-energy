// zip-boundaries.js
// Fetches real ZCTA (Zip Code Tabulation Area) polygon boundaries from the Census Bureau's
// public TIGERweb ArcGIS service, covering the San Diego / Orange / Riverside / San Bernardino
// region the Black Box expansion queue operates in. Powers the Coverage map on the admin Black
// Box dashboard (portal.html adminCanvassRenderCoverageMap()) — real geography lets a gap in
// coverage read as an obvious visual hole instead of needing a computed adjacency list.
//
// Written defensively, same pattern as outage-sync.js: the exact TIGERweb service URL / layer
// id / field names could not be verified live (tigerweb.geo.census.gov is blocked from the dev
// sandbox this was built in), so this tries a short list of known-candidate TIGERweb service
// paths, self-discovers the ZCTA layer by name/geometry-type within whichever one responds, and
// logs everything it finds (layer list, field guesses, sample attributes, feature count) so the
// first live run's Netlify function logs can confirm it actually matched real data before this
// is trusted further. Also self-discovers the 5-digit zip field name rather than hardcoding it
// (TIGERweb layers commonly use ZCTA5CE20/ZCTA5CE10/ZCTA5CE20, which drifts by vintage).
//
// Uses a bounding-box spatial query (not a county-FIPS attribute filter) — ZCTA polygons don't
// reliably carry a county field since ZIP delivery areas don't respect county lines — so this
// covers our 4-county operating region by geography, no field-name guess required for the
// filter itself.
//
// On-demand only (admin "Refresh Boundaries" button in portal.html) — county boundaries are
// static, so no netlify.toml schedule. Caches the result into the existing pipeline_state table
// (key: 'zip_boundaries_geojson'), same {key, value, updated_at} shape as outage-sync.js's
// sdge_outages snapshot.

const SUPA_URL  = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

// Candidate TIGERweb service roots to probe, in priority order. tigerWMS_Current is a large
// combined service (many geography layers) and is the most likely to exist regardless of vintage
// naming drift on the more specific ZCTA-only service.
const CANDIDATE_SERVICES = [
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer',
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer'
];

// Bounding box covering San Diego, Orange, Riverside, and the West Valley / Coachella portions
// of San Bernardino County we operate in (WGS84 / EPSG:4326).
const BBOX = { xmin: -118.05, ymin: 32.45, xmax: -115.95, ymax: 34.35 };

function looksLikeZctaLayer(name) { return /zcta|zip\s*code\s*tabulation/i.test(name || ''); }
function looksLikeZipField(key) { return /zcta5|zip.?code|^zip$/i.test(key); }

exports.handler = async function (event) {
  const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const supaKey = process.env.SUPA_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };
  const supaHeaders = { 'Content-Type': 'application/json', apikey: supaKey, Authorization: 'Bearer ' + supaKey };

  const log = [];
  function stamp(msg) { log.push(msg); console.log('[zip-boundaries] ' + msg); }

  try {
    let layerUrl = null;
    let usedService = null;

    // Step 1: probe each candidate service for a ZCTA-shaped layer.
    for (const svc of CANDIDATE_SERVICES) {
      try {
        const metaResp = await fetch(svc + '?f=json');
        if (!metaResp.ok) { stamp('Service unreachable (HTTP ' + metaResp.status + '): ' + svc); continue; }
        const meta = await metaResp.json();
        const layers = meta.layers || [];
        stamp('Probed ' + svc + ' — layers: ' + layers.map(l => l.id + ':' + l.name).slice(0, 30).join(', '));
        const zctaLayer = layers.find(l => looksLikeZctaLayer(l.name))
          || layers.find(l => (l.geometryType || '').toLowerCase() === 'esrigeometrypolygon' && looksLikeZctaLayer(l.name));
        if (zctaLayer) {
          layerUrl = svc + '/' + zctaLayer.id;
          usedService = svc;
          stamp('Using layer id=' + zctaLayer.id + ' name="' + zctaLayer.name + '" from ' + svc);
          break;
        }
      } catch (e) {
        stamp('Probe failed for ' + svc + ': ' + e.message);
      }
    }

    if (!layerUrl) {
      stamp('ERROR: no ZCTA-shaped layer found in any candidate service');
      await upsertSnapshot(supaHeaders, { fetched_at: new Date().toISOString(), type: 'FeatureCollection', features: [], note: 'No ZCTA layer discovered — needs manual review of CANDIDATE_SERVICES', log });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'no_zcta_layer', log }) };
    }

    // Step 2: bounding-box query for every ZCTA polygon in our operating region. Generalized
    // geometry (maxAllowableOffset) keeps vertex counts (and payload size) down for a regional
    // overview map — precision isn't needed at this zoom level.
    const geometry = encodeURIComponent(JSON.stringify(BBOX));
    const queryUrl = layerUrl + '/query'
      + '?geometry=' + geometry
      + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects'
      + '&outFields=*&outSR=4326&maxAllowableOffset=0.0015&geometryPrecision=4'
      + '&resultRecordCount=2000&f=geojson';
    const dataResp = await fetch(queryUrl);
    if (!dataResp.ok) throw new Error('ZCTA query failed: HTTP ' + dataResp.status);
    const data = await dataResp.json();
    const features = data.features || [];
    stamp('Features returned: ' + features.length + (data.properties && data.properties.exceededTransferLimit ? ' (⚠️ exceeded transfer limit — some zips may be missing, consider paginating)' : ''));

    if (!features.length) {
      stamp('WARNING: query returned zero features — bbox or layer may be wrong, check queryUrl');
      await upsertSnapshot(supaHeaders, { fetched_at: new Date().toISOString(), type: 'FeatureCollection', features: [], note: 'Zero features from bbox query — needs manual review', log, debug_query_url: queryUrl });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'zero_features', log }) };
    }

    // Step 3: self-discover which property holds the 5-digit zip code, inject a normalized
    // `zip` property onto every feature so the frontend never has to guess the field name.
    const sampleProps = features[0].properties || {};
    const keys = Object.keys(sampleProps);
    const zipKey = keys.find(looksLikeZipField) || keys.find(k => /^\d{5}$/.test(String(sampleProps[k])));
    stamp('Field guess — zip:"' + zipKey + '". Sample properties: ' + JSON.stringify(sampleProps).slice(0, 400));

    if (!zipKey) {
      stamp('ERROR: could not find a 5-digit zip field on returned features');
      await upsertSnapshot(supaHeaders, { fetched_at: new Date().toISOString(), type: 'FeatureCollection', features: [], note: 'No zip field found in schema — needs manual review', log });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'no_zip_field', log }) };
    }

    let injected = 0;
    features.forEach(f => {
      const z = String((f.properties || {})[zipKey] || '').replace(/\D/g, '').slice(0, 5);
      if (z.length === 5) { f.properties.zip = z; injected++; }
    });
    stamp('Zips resolved on ' + injected + '/' + features.length + ' features');

    const geojson = { type: 'FeatureCollection', features, fetched_at: new Date().toISOString(), source: usedService, log };
    await upsertSnapshot(supaHeaders, geojson);

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, feature_count: features.length, log }) };
  } catch (e) {
    stamp('ERROR: ' + e.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message, log }) };
  }
};

async function upsertSnapshot(supaHeaders, geojson) {
  await fetch(SUPA_REST + '/pipeline_state', {
    method: 'POST',
    headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'zip_boundaries_geojson', value: JSON.stringify(geojson), updated_at: new Date().toISOString() })
  });
}
