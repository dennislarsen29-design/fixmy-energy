const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const GKEY = process.env.GOOGLE_MAPS_KEY;
  if (!GKEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GOOGLE_MAPS_KEY env var not set in Netlify' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { address } = body;
  if (!address) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'address required' }) };
  }

  try {
    // Geocode address → lat/lng
    const geoResp = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GKEY}`
    );
    const geoData = await geoResp.json();
    const loc = geoData.results?.[0]?.geometry?.location;
    if (!loc) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Address not found — check the address on this customer record' }) };
    }

    // Google Solar API — building insights
    const solarResp = await fetch(
      `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${loc.lat}&location.longitude=${loc.lng}&requiredQuality=MEDIUM&key=${GKEY}`
    );
    const solarData = await solarResp.json();

    if (solarData.error) {
      // Solar API enabled but no data for this location
      return {
        statusCode: 422, headers: CORS,
        body: JSON.stringify({
          error: solarData.error.message || 'Solar API error',
          lat: loc.lat, lng: loc.lng
        })
      };
    }

    const sp = solarData.solarPotential || {};
    const allPanels = sp.solarPanels || [];
    const configs = sp.solarPanelConfigs || [];
    const bestConfig = configs.length ? configs[configs.length - 1] : null;
    // Use the panel count from the best (maximum) config
    const panelCount = bestConfig ? bestConfig.panelsCount : Math.min(allPanels.length, 40);
    const usePanels = allPanels.slice(0, panelCount);

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: loc.lat,
        lng: loc.lng,
        maxPanelCount: sp.maxArrayPanelsCount || 0,
        roofAreaMeters2: Math.round(sp.wholeRoofStats?.areaMeters2 || 0),
        maxSunshineHours: Math.round(sp.maxSunshineHoursPerYear || 0),
        panelCapacityWatts: sp.panelCapacityWatts || 400,
        annualSunshineKwh: bestConfig ? Math.round(bestConfig.yearlyEnergyDcKwh) : null,
        panels: usePanels.map(function(p) {
          return { lat: p.center.latitude, lng: p.center.longitude, orientation: p.orientation };
        }),
        imageryDate: solarData.imageryDate
          ? `${solarData.imageryDate.year}-${String(solarData.imageryDate.month).padStart(2, '0')}`
          : null
      })
    };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message || 'Internal error' }) };
  }
};
