exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  const key = process.env.REGRID_KEY;
  // Do NOT bail if key is missing — Regrid steps are skipped, but SANDAG runs regardless.

  let address, lat, lng;
  try {
    const body = JSON.parse(event.body);
    address = body.address;
    lat = body.lat;
    lng = body.lng;
  } catch(e) {}
  if (!address) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'address required' }) };
  }

  const tried = [];
  // Without this marker the debug chain reads like the free San Diego services failed,
  // when the truth may be that the PAID source was never called at all. That distinction
  // is the whole diagnosis when owner coverage looks broken — the free CA services return
  // APN + situs but redact the name by law, so a missing key means no owner source ran.
  if (!key) tried.push('regrid:no_key(REGRID_KEY unset — paid owner source skipped)');
  const regridHeaders = { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' };
  // Regrid's v1 API conventionally authenticates with a `token` QUERY PARAMETER; the
  // Bearer header alone returns 401 {"status":"error","message":"Invalid token"} against
  // some key types. Sending both costs nothing and removes an auth-mechanism mismatch as
  // a possible cause — if it still 401s, the key itself is genuinely bad/expired.
  const regridTok = key ? '&token=' + encodeURIComponent(key) : '';

  function parseRegridFeature(feat) {
    if (!feat) return null;
    const f = (feat.properties && feat.properties.fields) || feat.fields || {};
    const owner = f.owner || f.owner2 || f.mail_name || null;
    const apn   = f.parcelnumb || f.parcelnumb_formatted || f.apn || null;
    const rawVal = String(f.parval || f.improvval || f.landval || '').replace(/[$,\s]/g, '');
    const assessedValue = rawVal ? (parseInt(rawVal, 10) || null) : null;
    const taxDelinquent = f.tax_delinquent != null
      ? (String(f.tax_delinquent).toUpperCase() === 'Y' || f.tax_delinquent === true)
      : null;
    return owner ? { owner, apn, assessed_value: assessedValue, tax_delinquent: taxDelinquent } : null;
  }

  // ── 1. Regrid lat/lon — most precise ──────────────────────────────────────
  if (key && lat != null && lng != null) {
    try {
      const url = 'https://app.regrid.com/api/v1/search.json?lat=' + lat +
        '&lon=' + lng + '&radius=0' + regridTok;
      const resp = await fetch(url, { headers: regridHeaders });
      if (resp.ok) {
        const data = await resp.json();
        const features = (data.parcels && data.parcels.features) ||
                         (data.results && data.results.features) ||
                         data.results || data.features || [];
        const parsed = parseRegridFeature(Array.isArray(features) ? features[0] : null);
        if (parsed) {
          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ...parsed, lat, lng, source: 'regrid_latlon' }) };
        }
        tried.push('regrid_latlon:ok_no_data');
      } else {
        const errText = await resp.text().catch(() => '');
        tried.push('regrid_latlon:' + resp.status + ' ' + errText.slice(0, 60));
        console.error('Regrid lat/lon HTTP', resp.status, errText);
      }
    } catch(e) {
      tried.push('regrid_latlon:err:' + e.message);
      console.error('Regrid lat/lon error:', e.message);
    }
  }

  // ── 2. Regrid address search ───────────────────────────────────────────────
  if (key) try {
    const url = 'https://app.regrid.com/api/v1/search.json?query=' +
      encodeURIComponent(address) + '&limit=3' + regridTok;
    const resp = await fetch(url, { headers: regridHeaders });
    if (resp.ok) {
      const data = await resp.json();
      const features = (data.parcels && data.parcels.features) ||
                       (data.results && data.results.features) ||
                       data.results || data.features || [];
      const parsed = parseRegridFeature(Array.isArray(features) ? features[0] : null);
      if (parsed) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ...parsed, lat: lat || null, lng: lng || null, source: 'regrid_search' }) };
      }
      tried.push('regrid_search:ok_no_data');
    } else {
      const errText = await resp.text().catch(() => '');
      tried.push('regrid_search:' + resp.status + ' ' + errText.slice(0, 60));
      console.error('Regrid search HTTP', resp.status, errText);
    }
  } catch(e) {
    tried.push('regrid_search:err:' + e.message);
    console.error('Regrid search error:', e.message);
  }

  // ── 3. Regrid typeahead fallback ──────────────────────────────────────────
  if (key) try {
    const url = 'https://app.regrid.com/api/v1/typeahead.json?query=' +
      encodeURIComponent(address) + '&limit=3' + regridTok;
    const resp = await fetch(url, { headers: regridHeaders });
    if (resp.ok) {
      const data = await resp.json();
      const results = data.results || [];
      const parsed = parseRegridFeature(Array.isArray(results) ? results[0] : null);
      if (parsed) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ...parsed, lat: lat || null, lng: lng || null, source: 'regrid_typeahead' }) };
      }
      tried.push('regrid_typeahead:ok_no_data');
    } else {
      const errText = await resp.text().catch(() => '');
      tried.push('regrid_typeahead:' + resp.status + ' ' + errText.slice(0, 60));
    }
  } catch(e) {
    tried.push('regrid_typeahead:err:' + e.message);
  }

  // ── Helper: ArcGIS spatial point query params (most reliable when lat/lng known) ──
  function arcgisPointParams(qlat, qlng, outFields) {
    return '&geometry=' + encodeURIComponent(JSON.stringify({ x: qlng, y: qlat })) +
      '&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&inSR=4326' +
      '&outFields=' + outFields + '&f=json&resultRecordCount=1';
  }

  // ── Helper: strip city/state/zip, take first 4 words for LIKE matching ────
  const addrUpper = address.toUpperCase().replace(/,.*/, '').trim();
  const addrParts = addrUpper.split(' ').slice(0, 4).join(' ');

  // ── Helper: extract owner from any SANDAG-style attributes object ────────
  function parseSandagOwner(attr) {
    return attr.OWN_NAME1 || attr.OWNER_NAME || attr.OWNER || attr.OWN_NAME ||
           attr.OWNERNME1 || attr.OWN1 || attr.OWNER1 || attr.PARCEL_OWNER || null;
  }
  function parseSandagApn(attr) {
    return attr.APN_8 || attr.APN || attr.PARCEL_NBR || attr.ASSESSOR_PARCEL_NUMBER || null;
  }

  // ── San Diego County parcel services, run for ONE coordinate pair ─────────
  // Every one of these is a point-in-polygon query, so the accuracy of the coordinate
  // decides whether it hits at all. `tag` labels which coordinate source produced the
  // attempt so the debug chain stays readable (e.g. "sandag@geo:ok_no_data").
  const SD_SERVICES = [
    { name: 'sandag',       url: 'https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0/query?',       fields: '*', referer: 'https://sdgis.sandag.org/' },
    { name: 'sandag_south', url: 'https://geo.sandag.org/server/rest/services/Hosted/Parcels_South/FeatureServer/0/query?', fields: '*', referer: 'https://sdgis.sandag.org/' },
    { name: 'sd_city',      url: 'https://webmaps.sandiego.gov/arcgis/rest/services/GeocoderMerged/MapServer/1/query?',     fields: 'SITUS_STREET,OWN_NAME1,APN_8' }
  ];

  // A parcel that was positively identified but whose OWNER NAME is withheld is NOT a
  // miss — it still yields the APN, which is the primary match key for the SanGIS bulk
  // parcel file (_bbBuildParcelIndex matches APN first, then street+zip). Throwing it
  // away, as this used to, means every redacted parcel contributes nothing and the $30
  // county drive has far less to join against later. Captured here and returned even
  // when `owner` is null.
  let redactedApn = null, redactedVia = null;

  async function trySdParcels(qlat, qlng, tag) {
    for (const svc of SD_SERVICES) {
      const label = svc.name + '@' + tag;
      try {
        const headers = { 'Accept': 'application/json' };
        if (svc.referer) headers['Referer'] = svc.referer;
        const resp = await fetch(svc.url + 'where=1%3D1' + arcgisPointParams(qlat, qlng, svc.fields), { headers });
        if (!resp.ok) { tried.push(label + ':' + resp.status); continue; }
        const data = await resp.json();
        if (data.error) {
          tried.push(label + ':arcgis_err:' + data.error.code + ':' + String(data.error.message||'').slice(0,40));
        } else if (data.features && data.features.length) {
          const attr = data.features[0].attributes;
          const owner = parseSandagOwner(attr);
          if (owner) return { owner, apn: parseSandagApn(attr), lat: qlat, lng: qlng, source: svc.name };
          // Features returned but no owner field — that's the California owner-name
          // redaction (Gov Code 6254.21), not a coordinate problem. Log the field list
          // so it's distinguishable from a genuine miss, and KEEP the parcel number.
          const apn = parseSandagApn(attr);
          if (apn && !redactedApn) { redactedApn = apn; redactedVia = svc.name; }
          tried.push(label + ':ok_no_owner' + (apn ? ':apn=' + apn : '') + ':fields=' + Object.keys(attr).join(',').slice(0, 80));
        } else {
          tried.push(label + ':ok_no_data');
        }
      } catch(e) {
        tried.push(label + ':err:' + e.message);
      }
    }
    return null;
  }

  // ── 4. Parcel lookup — stored coords FIRST, Census only as a fallback ─────
  // The portal geocodes every lead through Google before this ever runs, and Google
  // returns rooftop-accurate points that land INSIDE the parcel polygon. The previous
  // version always re-geocoded through Census and let that result OVERRIDE the stored
  // coords — but Census returns street-interpolated points that frequently fall outside
  // the parcel, producing the census_geocode:no_match → sandag:ok_no_data chain seen in
  // production. Trying the stored coords first also skips the Census round-trip entirely
  // whenever they hit, which makes the whole run faster.
  let hit = null;
  if (lat != null && lng != null) {
    hit = await trySdParcels(lat, lng, 'geo');
  } else {
    tried.push('geo:no_stored_coords');
  }

  // Census fallback — only pay for it when the stored coords missed.
  // Permit addresses are stored as "CITY, CA, 92001" (extra comma before the zip);
  // the Census geocoder expects "CA 92001", so normalize first.
  if (!hit) {
    const censusAddress = address.replace(/, ([A-Z]{2}), (\d{5})/, ', $1 $2');
    let cLat = null, cLng = null;
    try {
      const geocodeUrl = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?'
        + 'address=' + encodeURIComponent(censusAddress)
        + '&benchmark=Public_AR_Current&format=json';
      const geocodeResp = await fetch(geocodeUrl, { headers: { 'Accept': 'application/json' } });
      if (geocodeResp.ok) {
        const geocodeData = await geocodeResp.json();
        const matches = geocodeData.result && geocodeData.result.addressMatches;
        if (Array.isArray(matches) && matches.length) {
          cLat = matches[0].coordinates.y;
          cLng = matches[0].coordinates.x;
          tried.push('census_geocode:ok:' + cLat.toFixed(4) + ',' + cLng.toFixed(4));
        } else {
          tried.push('census_geocode:no_match');
        }
      } else {
        tried.push('census_geocode:' + geocodeResp.status);
      }
    } catch(e) {
      tried.push('census_geocode:err:' + e.message);
    }
    // Only worth a second round of parcel queries if Census landed somewhere materially
    // different from the coords we already tried (~10m+).
    if (cLat != null && (lat == null || Math.abs(cLat - lat) > 0.0001 || Math.abs(cLng - lng) > 0.0001)) {
      hit = await trySdParcels(cLat, cLng, 'census');
    } else if (cLat != null) {
      tried.push('census_geocode:same_as_stored');
    }
  }

  // Last resort: SD City street-name LIKE match, which needs no coordinates at all.
  if (!hit) try {
    const url = 'https://webmaps.sandiego.gov/arcgis/rest/services/GeocoderMerged/MapServer/1/query?'
      + 'where=' + encodeURIComponent("SITUS_STREET LIKE '" + addrParts + "%'")
      + '&outFields=SITUS_STREET,OWN_NAME1,APN_8&f=json&resultRecordCount=1';
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (resp.ok) {
      const data = await resp.json();
      if (data.features && data.features.length && data.features[0].attributes.OWN_NAME1) {
        const attr = data.features[0].attributes;
        hit = { owner: attr.OWN_NAME1, apn: attr.APN_8 || null, lat: lat || null, lng: lng || null, source: 'sd_city_addr' };
      } else {
        tried.push('sd_city_addr:ok_no_data');
      }
    } else {
      tried.push('sd_city_addr:' + resp.status);
    }
  } catch(e) {
    tried.push('sd_city_addr:err:' + e.message);
  }

  if (hit) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
      owner: hit.owner, apn: hit.apn, assessed_value: null, tax_delinquent: null,
      lat: hit.lat, lng: hit.lng, source: hit.source
    }) };
  }

  // No owner name — but say WHY in a form the caller can act on, and hand back the APN
  // if we positively identified the parcel. "We found your house, the county just won't
  // publish the name" is a completely different problem from "we couldn't find it".
  console.error('regrid-lookup: no owner found for "' + address.slice(0, 60) + '" — tried: ' + tried.join(' | '));
  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({
    owner: null,
    apn: redactedApn,
    owner_redacted: !!redactedApn,
    redacted_via: redactedVia,
    regrid_key_set: !!key,
    debug: tried.join(' | ')
  }) };
};
