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

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  let address;
  try { address = JSON.parse(event.body).address; } catch(e) {}
  if (!address) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'address required' }) };
  }

  // ── 1. Regrid v1 typeahead ─────────────────────────────────────────────────
  const key = process.env.REGRID_KEY;
  if (key) {
    try {
      const url = 'https://app.regrid.com/api/v1/typeahead.json?query=' +
        encodeURIComponent(address) + '&token=' + key + '&limit=3';
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        const results = data.results || [];
        const feat = Array.isArray(results) ? results[0] : null;
        if (feat) {
          const f = (feat.properties && feat.properties.fields) || feat.fields || {};
          const owner = f.owner || f.owner2 || f.mail_name || null;
          if (owner) {
            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify({ owner, apn: f.parcelnumb || f.apn || null, source: 'Regrid' })
            };
          }
        }
      }
    } catch(e) {}
  }

  // ── 2. SD County Assessor via SANDAG ArcGIS (no CORS restriction server-side) ──
  try {
    const streetPart = address.toUpperCase().replace(/,.*/, '').trim().split(' ').slice(0, 4).join(' ');
    const sanUrl = 'https://arcgis.sandag.org/sdgis/rest/services/REGIS/Parcels/MapServer/0/query' +
      '?where=' + encodeURIComponent("SITEADDR LIKE '" + streetPart + "%'") +
      '&outFields=SITEADDR,OWNER,APN&f=json&resultRecordCount=1';
    const sanResp = await fetch(sanUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (sanResp.ok) {
      const sanData = await sanResp.json();
      if (sanData.features && sanData.features.length) {
        const attr = sanData.features[0].attributes;
        if (attr.OWNER) {
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ owner: attr.OWNER, apn: attr.APN || null, source: 'SD County Assessor' })
          };
        }
      }
    }
  } catch(e) {}

  // ── Nothing found ─────────────────────────────────────────────────────────
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ owner: null, apn: null, source: null })
  };
};
