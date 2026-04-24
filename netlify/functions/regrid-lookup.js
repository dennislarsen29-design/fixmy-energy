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

  let address;
  try { address = JSON.parse(event.body).address; } catch(e) {}
  if (!address) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'address required' })
    };
  }

  const ok = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const empty = { statusCode: 200, headers: ok, body: JSON.stringify({ owner: null, apn: null }) };

  // ── 1. Regrid v2 (primary) ────────────────────────────────────────────────
  try {
    const url = 'https://app.regrid.com/api/v2/typeahead.json?query=' +
      encodeURIComponent(address) + '&limit=3';
    const resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
    });
    if (resp.ok) {
      const data = await resp.json();
      const results = data.results || data.parcels || [];
      const feat = Array.isArray(results) ? results[0] : null;
      if (feat) {
        const f = (feat.properties && feat.properties.fields) || feat.fields || {};
        const owner = f.owner || f.owner2 || f.mail_name || null;
        const apn   = f.parcelnumb || f.parcelnumb_formatted || f.apn || null;
        if (owner) {
          return { statusCode: 200, headers: ok, body: JSON.stringify({ owner, apn, source: 'regrid_v2' }) };
        }
      }
    }
  } catch(e) { console.error('Regrid v2 error:', e.message); }

  // ── 2. Regrid v1 (fallback) ───────────────────────────────────────────────
  try {
    const url = 'https://app.regrid.com/api/v1/typeahead.json?query=' +
      encodeURIComponent(address) + '&token=' + key + '&limit=3';
    const resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (resp.ok) {
      const data = await resp.json();
      const results = data.results || [];
      const feat = Array.isArray(results) ? results[0] : null;
      if (feat) {
        const f = (feat.properties && feat.properties.fields) || feat.fields || {};
        const owner = f.owner || f.owner2 || f.mail_name || null;
        const apn   = f.parcelnumb || f.apn || null;
        if (owner) {
          return { statusCode: 200, headers: ok, body: JSON.stringify({ owner, apn, source: 'regrid_v1' }) };
        }
      }
    }
  } catch(e) { console.error('Regrid v1 error:', e.message); }

  // ── 3. SD County Assessor — SANDAG ArcGIS (server-side, avoids CORS) ─────
  try {
    const addrUpper = address.toUpperCase().replace(/,.*/, '').trim();
    const parts = addrUpper.split(' ').slice(0, 3).join(' ');
    const sanUrl = 'https://arcgis.sandag.org/sdgis/rest/services/REGIS/Parcels/MapServer/0/query?where=' +
      encodeURIComponent("SITEADDR LIKE '" + parts + "%'") +
      '&outFields=SITEADDR,OWNER,OWNADDR,APN&f=json&resultRecordCount=1';
    const sanResp = await fetch(sanUrl);
    if (sanResp.ok) {
      const sanData = await sanResp.json();
      if (sanData.features && sanData.features.length) {
        const attr = sanData.features[0].attributes;
        const owner = attr.OWNER || null;
        const apn   = attr.APN   || null;
        if (owner) {
          return { statusCode: 200, headers: ok, body: JSON.stringify({ owner, apn, source: 'sandag' }) };
        }
      }
    }
  } catch(e) { console.error('SANDAG error:', e.message); }

  // ── 4. SD County GIS alternative endpoint ────────────────────────────────
  try {
    const addrUpper = address.toUpperCase().replace(/,.*/, '').trim();
    const parts = addrUpper.split(' ').slice(0, 3).join(' ');
    const sdUrl = 'https://sdgis.sandiegocounty.gov/arcgis/rest/services/SDGIS/SDCoAssessor/MapServer/0/query?where=' +
      encodeURIComponent("SITUS_ADDR LIKE '" + parts + "%'") +
      '&outFields=SITUS_ADDR,OWNER_NAME,APN&f=json&resultRecordCount=1';
    const sdResp = await fetch(sdUrl);
    if (sdResp.ok) {
      const sdData = await sdResp.json();
      if (sdData.features && sdData.features.length) {
        const attr = sdData.features[0].attributes;
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
