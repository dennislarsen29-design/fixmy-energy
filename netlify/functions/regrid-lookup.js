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
  const regridHeaders = { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' };

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
        '&lon=' + lng + '&radius=0';
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
      encodeURIComponent(address) + '&limit=3';
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
      encodeURIComponent(address) + '&limit=3';
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

  // ── 3.5. Census Bureau geocoder — always run for SANDAG spatial accuracy ────
  // Input lat/lng may be Google Maps street-centerline coords (from permit import).
  // Street-centerline points fall OUTSIDE parcel polygons → SANDAG spatial query misses.
  // Census Bureau geocoder returns address-matched coordinates that land inside parcels.
  // Always geocode fresh; fall back to input coords only if Census can't resolve.
  //
  // Permit addresses are stored as "123 MAIN ST, CITY, CA, 92001" (comma before zip).
  // Census geocoder expects "CA 92001" (no comma before zip) — normalize before calling.
  const censusAddress = address.replace(/, ([A-Z]{2}), (\d{5})/, ', $1 $2');
  let resolvedLat = null, resolvedLng = null;
  try {
    const geocodeUrl = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?'
      + 'address=' + encodeURIComponent(censusAddress)
      + '&benchmark=Public_AR_Current&format=json';
    const geocodeResp = await fetch(geocodeUrl, { headers: { 'Accept': 'application/json' } });
    if (geocodeResp.ok) {
      const geocodeData = await geocodeResp.json();
      const matches = geocodeData.result && geocodeData.result.addressMatches;
      if (Array.isArray(matches) && matches.length) {
        resolvedLat = matches[0].coordinates.y;
        resolvedLng = matches[0].coordinates.x;
        tried.push('census_geocode:ok:' + resolvedLat.toFixed(4) + ',' + resolvedLng.toFixed(4));
      } else {
        tried.push('census_geocode:no_match');
      }
    } else {
      tried.push('census_geocode:' + geocodeResp.status);
    }
  } catch(e) {
    tried.push('census_geocode:err:' + e.message);
  }
  // Fall back to caller-supplied coords only when Census can't resolve
  if (resolvedLat == null) { resolvedLat = lat; resolvedLng = lng; }

  // ── 4. SANDAG geo.sandag.org — spatial only (text fallback removed: field name unknown) ─
  if (resolvedLat == null || resolvedLng == null) tried.push('sandag:skip_no_coords');
  if (resolvedLat != null && resolvedLng != null) try {
    const baseUrl = 'https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0/query?';
    const query = 'where=1%3D1' + arcgisPointParams(resolvedLat, resolvedLng, 'OWN_NAME1,APN_8');
    const resp = await fetch(baseUrl + query, {
      headers: { 'Accept': 'application/json', 'Referer': 'https://sdgis.sandag.org/' }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.error) {
        tried.push('sandag:arcgis_err:' + data.error.code + ':' + String(data.error.message||'').slice(0,40));
      } else if (data.features && data.features.length) {
        const attr = data.features[0].attributes;
        const owner = attr.OWN_NAME1 || null;
        const apn   = attr.APN_8 || null;
        if (owner) {
          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ owner, apn, assessed_value: null, tax_delinquent: null, lat: resolvedLat, lng: resolvedLng, source: 'sandag' }) };
        }
        tried.push('sandag:ok_no_owner');
      } else {
        tried.push('sandag:ok_no_data');
      }
    } else {
      tried.push('sandag:' + resp.status);
    }
  } catch(e) {
    tried.push('sandag:err:' + e.message);
    console.error('SANDAG error:', e.message);
  }

  // ── 5. SANDAG Parcels_South — spatial only ───────────────────────────────
  if (resolvedLat != null && resolvedLng != null) try {
    const baseUrl = 'https://geo.sandag.org/server/rest/services/Hosted/Parcels_South/FeatureServer/0/query?';
    const query = 'where=1%3D1' + arcgisPointParams(resolvedLat, resolvedLng, 'OWN_NAME1,APN_8');
    const resp = await fetch(baseUrl + query, {
      headers: { 'Accept': 'application/json', 'Referer': 'https://sdgis.sandag.org/' }
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.error) {
        tried.push('sandag_south:arcgis_err:' + data.error.code + ':' + String(data.error.message||'').slice(0,40));
      } else if (data.features && data.features.length) {
        const attr = data.features[0].attributes;
        const owner = attr.OWN_NAME1 || null;
        const apn   = attr.APN_8 || null;
        if (owner) {
          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ owner, apn, assessed_value: null, tax_delinquent: null, lat: resolvedLat, lng: resolvedLng, source: 'sandag_south' }) };
        }
        tried.push('sandag_south:ok_no_owner');
      } else {
        tried.push('sandag_south:ok_no_data');
      }
    } else {
      tried.push('sandag_south:' + resp.status);
    }
  } catch(e) {
    tried.push('sandag_south:err:' + e.message);
  }

  // ── 6. City of SD — webmaps.sandiego.gov GeocoderMerged — spatial if lat/lng ──
  try {
    const baseUrl = 'https://webmaps.sandiego.gov/arcgis/rest/services/GeocoderMerged/MapServer/1/query?';
    const query = (resolvedLat != null && resolvedLng != null)
      ? 'where=1%3D1' + arcgisPointParams(resolvedLat, resolvedLng, 'SITUS_STREET,OWN_NAME1,APN_8')
      : 'where=' + encodeURIComponent("SITUS_STREET LIKE '" + addrParts + "%'") + '&outFields=SITUS_STREET,OWN_NAME1,APN_8&f=json&resultRecordCount=1';
    const url = baseUrl + query;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (resp.ok) {
      const data = await resp.json();
      if (data.error) {
        tried.push('sd_city:arcgis_err:' + data.error.code + ':' + String(data.error.message||'').slice(0,40));
      } else if (data.features && data.features.length) {
        const attr = data.features[0].attributes;
        const owner = attr.OWN_NAME1 || null;
        const apn   = attr.APN_8 || null;
        if (owner) {
          return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ owner, apn, assessed_value: null, tax_delinquent: null, lat: resolvedLat, lng: resolvedLng, source: 'sd_city' }) };
        }
        tried.push('sd_city:ok_no_owner');
      } else {
        tried.push('sd_city:ok_no_data');
      }
    } else {
      tried.push('sd_city:' + resp.status);
    }
  } catch(e) {
    tried.push('sd_city:err:' + e.message);
    console.error('SD City GIS error:', e.message);
  }

  console.error('regrid-lookup: no owner found for "' + address.slice(0, 60) + '" — tried: ' + tried.join(' | '));
  return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ owner: null, apn: null, debug: tried.join(' | ') }) };
};
