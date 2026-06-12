// GHL Calendar Slot Fetcher — returns next 5 available slots from the evaluation calendar.
// GET /.netlify/functions/ghl-slots
// GET /.netlify/functions/ghl-slots?debug=1  — returns raw GHL response for diagnosis
// 60-second server-side cache to avoid rate-limiting GHL.

const CALENDAR_ID   = process.env.GHL_CALENDAR_ID || 'UjlvHxE8AlyhG5frBkqr';
const SLOT_DURATION = 120; // minutes — matches GHL calendar's 2hr appointment duration
const GHL_BASE      = 'https://services.leadconnectorhq.com';

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

  const debug = (event.queryStringParameters || {}).debug === '1';

  if (!debug && _cache && (Date.now() - _cacheAt) < CACHE_TTL)
    return { statusCode: 200, headers: cors, body: JSON.stringify(_cache) };

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Missing GHL_API_KEY' }) };

  // Query next 14 days — GHL expects Unix timestamps in milliseconds
  const now       = new Date();
  const startDate = now.getTime();
  const endDate   = now.getTime() + 14 * 24 * 60 * 60 * 1000;
  const url = `${GHL_BASE}/calendars/${CALENDAR_ID}/free-slots?startDate=${startDate}&endDate=${endDate}&timezone=America%2FLos_Angeles`;
  console.log('GHL slots: calendarId=', CALENDAR_ID, 'url=', url);

  let raw;
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28' },
    });
    raw = await resp.json();
    console.log('GHL slots raw:', JSON.stringify(raw).slice(0, 800));
    if (!resp.ok) {
      console.error('GHL slots error', resp.status, JSON.stringify(raw).slice(0, 300));
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL error', status: resp.status, detail: raw }) };
    }
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'GHL fetch failed', detail: e.message }) };
  }

  // Return raw response in debug mode
  if (debug) return { statusCode: 200, headers: cors, body: JSON.stringify({ raw, calendarId: CALENDAR_ID }) };

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

      // Use GHL's actual slot duration for display; customer sees the full window
      const endDt        = new Date(startDt.getTime() + SLOT_DURATION * 60 * 1000);
      const displayEndDt = new Date(startDt.getTime() + (SLOT_DURATION + 60) * 60 * 1000);

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
