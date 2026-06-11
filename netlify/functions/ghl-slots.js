// GHL Calendar Slot Fetcher — returns next 5 available slots from the diagnostic calendar.
// GET /.netlify/functions/ghl-slots
// 60-second server-side cache to avoid rate-limiting GHL.

const CALENDAR_ID = process.env.GHL_CALENDAR_ID || 'UjlvHxE8AlyhG5frBkqr';
const GHL_BASE    = 'https://services.leadconnectorhq.com';

let _cache    = null;
let _cacheAt  = 0;
const CACHE_TTL = 60 * 1000;

const cors = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  if (_cache && (Date.now() - _cacheAt) < CACHE_TTL)
    return { statusCode: 200, headers: cors, body: JSON.stringify(_cache) };

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Missing GHL_API_KEY' }) };

  // Query next 7 days — GHL expects Unix timestamps in milliseconds
  const now       = new Date();
  const startDate = now.getTime();
  const endDate   = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  const url = `${GHL_BASE}/calendars/${CALENDAR_ID}/free-slots?startDate=${startDate}&endDate=${endDate}&timezone=America%2FLos_Angeles`;

  let raw;
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-04-15' },
    });
    raw = await resp.json();
    if (!resp.ok) {
      console.error('GHL slots error', resp.status, JSON.stringify(raw).slice(0, 300));
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL error', status: resp.status }) };
    }
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL fetch failed', detail: e.message }) };
  }

  // GHL returns { data: { "YYYY-MM-DD": [ { startTime, endTime } ] } }
  const slots   = [];
  const dateMap = raw.data || raw;
  for (const [, daySlots] of Object.entries(dateMap)) {
    if (!Array.isArray(daySlots)) continue;
    for (const slot of daySlots) {
      const startISO = slot.startTime || slot.time;
      if (!startISO) continue;
      const startDt = new Date(startISO);
      if (startDt <= now) continue;

      // GHL slot = 1hr; customer sees 2hr window
      const endDt        = new Date(startDt.getTime() + 60 * 60 * 1000);
      const displayEndDt = new Date(startDt.getTime() + 2 * 60 * 60 * 1000);

      slots.push({
        startISO: startDt.toISOString(),
        endISO:   endDt.toISOString(),
        label:    formatLabel(startDt, displayEndDt),
      });
    }
  }

  slots.sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  _cache   = { slots: slots.slice(0, 5), fetchedAt: new Date().toISOString() };
  _cacheAt = Date.now();

  return { statusCode: 200, headers: cors, body: JSON.stringify(_cache) };
};

function formatLabel(start, end) {
  const opts  = { timeZone: 'America/Los_Angeles' };
  const dayStr   = start.toLocaleDateString('en-US', { ...opts, weekday: 'short', month: 'short', day: 'numeric' });
  const startStr = start.toLocaleTimeString('en-US', { ...opts, hour: 'numeric', minute: '2-digit' });
  const endStr   = end.toLocaleTimeString('en-US',   { ...opts, hour: 'numeric', minute: '2-digit' });

  // Drop duplicate AM/PM from the start half (e.g. "9:00 – 11:00 AM" instead of "9:00 AM – 11:00 AM")
  const sMatch = startStr.match(/^(.+?)\s*(AM|PM)$/i);
  const eMatch = endStr.match(/^(.+?)\s*(AM|PM)$/i);
  const startLabel = (sMatch && eMatch && sMatch[2] === eMatch[2]) ? sMatch[1] : startStr;

  return `${dayStr} · ${startLabel} – ${endStr}`;
}
