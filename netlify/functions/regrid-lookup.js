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

  const key = process.env.REGRID_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'REGRID_KEY env var not set' })
    };
  }

  let address, lat, lng;
  try {
    const body = JSON.parse(event.body);
    address = body.address;
    lat = body.lat;
    lng = body.lng;
  } catch(e) {}
  if (!address) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'address required' })
    };
  }

  const ok = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const empty = { statusCode: 200, headers: ok, body: JSON.stringify({ owner: null, apn: null }) };

  const regridHeaders = { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' };

  function parseRegridFeature(feat) {
    if (!feat) return null;
    const f = (feat.properties && feat.properties.fields) || feat.fields || {};
    const owner = f.owner || f.owner2 || f.mail_name || null;
    const apn   = f.parcelnumb || f.parcelnumb_formatted || f.apn || null;
    return owner ? { owner, apn } : null;
  }

  // ── 1. Regrid search by lat/lon — most precise, skips string matching ────
  if (lat != null && lng != null) {
    try {
      const url = 'https://app.regrid.com/api/v1/search.json?lat=' + lat +
        '&lon=' + lng + '&radius=0&token=' + encodeURIComponent(key);
      const resp = await fetch(url, { headers: regridHeaders });
      if (resp.ok) {
        const data = await resp.json();
        const features = (data.parcels && data.parcels.features) ||
                         (data.results && data.results.features) ||
                         data.results || data.features || [];
        const parsed = parseRegridFeature(Array.isArray(features) ? features[0] : null);
        if (parsed) {
          return { statusCode: 200, headers: ok, body: JSON.stringify({ ...parsed, source: 'regrid_latlon' }) };
        }
      } else {
        console.error('Regrid lat/lon HTTP', resp.status, await resp.text().catch(()=>''));
      }
    } catch(e) { console.error('Regrid lat/lon error:', e.message); }
  }

  // ── 2. Regrid search by address ───────────────────────────────────────────
  try {
    const url = 'https://app.regrid.com/api/v1/search.json?query=' +
      encodeURIComponent(address) + '&token=' + encodeURIComponent(key) + '&limit=3';
    const resp = await fetch(url, { headers: regridHeaders });
    if (resp.ok) {
      const data = await resp.json();
      const features = (data.parcels && data.parcels.features) ||
                       (data.results && data.results.features) ||
                       data.results || data.features || [];
      const parsed = parseRegridFeature(Array.isArray(features) ? features[0] : null);
      if (parsed) {
        return { statusCode: 200, headers: ok, body: JSON.stringify({ ...parsed, source: 'regrid_search' }) };
      }
    } else {
      console.error('Regrid search HTTP', resp.status, await resp.text().catch(()=>''));
    }
  } catch(e) { console.error('Regrid search error:', e.message); }

  // ── 3. Regrid typeahead fallback ──────────────────────────────────────────
  try {
    const url = 'https://app.regrid.com/api/v1/typeahead.json?query=' +
      encodeURIComponent(address) + '&token=' + encodeURIComponent(key) + '&limit=3';
    const resp = await fetch(url, { headers: regridHeaders });
    if (resp.ok) {
      const data = await resp.json();
      const results = data.results || [];
      const parsed = parseRegridFeature(Array.isArray(results) ? results[0] : null);
      if (parsed) {
        return { statusCode: 200, headers: ok, body: JSON.stringify({ ...parsed, source: 'regrid_typeahead' }) };
      }
    }
  } catch(e) { console.error('Regrid typeahead error:', e.message); }

  // ── 3. SANDAG ArcGIS Parcels ──────────────────────────────────────────────
  try {
    const addrUpper = address.toUpperCase().replace(/,.*/, '').trim();
    const parts = addrUpper.split(' ').slice(0, 3).join(' ');
    const url = 'https://geo.sandag.org/server/rest/services/Hosted/Parcels/FeatureServer/0/query?where=' +
      encodeURIComponent("SITUS_ADDRESS LIKE '" + parts + "%'") +
      '&outFields=SITUS_ADDRESS,OWNER_NAME,ASSESSOR_PARCEL_NUMBER&f=json&resultRecordCount=1';
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (resp.ok) {
      const data = await resp.json();
      if (data.features && data.features.length) {
        const attr = data.features[0].attributes;
        const owner = attr.OWNER_NAME || null;
        const apn   = attr.ASSESSOR_PARCEL_NUMBER || null;
        if (owner) {
          return { statusCode: 200, headers: ok, body: JSON.stringify({ owner, apn, source: 'sandag' }) };
        }
      }
    }
  } catch(e) { console.error('SANDAG error:', e.message); }

  // ── 4. SD County public parcels (fallback) ────────────────────────────────
  try {
    const addrUpper = address.toUpperCase().replace(/,.*/, '').trim();
    const parts = addrUpper.split(' ').slice(0, 3).join(' ');
    const url = 'https://gis-public.sandiegocounty.gov/arcgis/rest/services/sdep_warehouse/PARCELS_ALL/MapServer/0/query?where=' +
      encodeURIComponent("SITUS_ADDR LIKE '" + parts + "%'") +
      '&outFields=SITUS_ADDR,OWNER_NAME,APN&f=json&resultRecordCount=1';
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (resp.ok) {
      const data = await resp.json();
      if (data.features && data.features.length) {
        const attr = data.features[0].attributes;
        const owner = attr.OWNER_NAME || null;
        const apn   = attr.APN       || null;
        if (owner) {
          return { statusCode: 200, headers: ok, body: JSON.stringify({ owner, apn, source: 'sd_county' }) };
        }
      }
    }
  } catch(e) { console.error('SD County GIS error:', e.message); }

  return empty;
};
