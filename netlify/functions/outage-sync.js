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
    // upstream only carries live outages, no history).
    const queryUrl = FEATURESERVER + '/' + incidentLayer.id + '/query?where=1%3D1&outFields=*&f=json&resultRecordCount=2000';
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

    // Step 5: extract zips directly if the schema has them; otherwise fall back to city names
    // (zip-level lead matching needs zips — city-only is recorded for visibility but won't drive
    // the Focus-ZIP suggestions until a geocoding fallback is added, if this schema lacks zips).
    const zipCounts = {};
    const cities = new Set();
    sdgeFeatures.forEach(f => {
      const a = f.attributes || {};
      if (zipKey && a[zipKey]) {
        const z = String(a[zipKey]).replace(/\D/g, '').slice(0, 5);
        if (z.length === 5) {
          zipCounts[z] = (zipCounts[z] || 0) + (countKey ? (parseInt(a[countKey], 10) || 1) : 1);
        }
      }
      if (cityKey && a[cityKey]) cities.add(String(a[cityKey]).trim());
    });
    const zips = Object.keys(zipCounts).sort((a, b) => zipCounts[b] - zipCounts[a])
      .map(z => ({ zip: z, affected: zipCounts[z] }));
    stamp('Resolved zips: ' + zips.map(z => z.zip + '(' + z.affected + ')').join(', '));
    if (!zipKey) stamp('No zip field in schema — cities recorded instead: ' + Array.from(cities).slice(0, 20).join(', '));

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
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message, log }) };
  }
};

async function upsertSnapshot(supaHeaders, snapshot) {
  await fetch(SUPA_REST + '/pipeline_state', {
    method: 'POST',
    headers: { ...supaHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: 'sdge_outages', value: JSON.stringify(snapshot), updated_at: new Date().toISOString() })
  });
}
