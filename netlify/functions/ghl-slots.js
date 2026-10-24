// GHL Calendar Slot Fetcher — returns next 5 available slots from the evaluation calendar.
// GET /.netlify/functions/ghl-slots
// GET /.netlify/functions/ghl-slots?debug=1  — returns raw GHL response for diagnosis
// 60-second server-side cache to avoid rate-limiting GHL.

// "Evaluation" calendar — the initial Tech visit booked from /book (NOT the post-payment Diagnostic visit).
const CALENDAR_ID   = process.env.GHL_EVAL_CALENDAR_ID || 'UjlvHxE8AlyhG5frBkqr';
const SLOT_DURATION = 120; // minutes — matches GHL calendar's 2hr appointment duration
const GHL_BASE      = 'https://services.leadconnectorhq.com';

const VIRTUAL_DURATION = 45; // minutes — Virtual Solar Evaluations are exact 45-min Google Meet calls
let _cache    = {};   // keyed by mode ('in_person' | 'virtual')
let _cacheAt  = {};
const CACHE_TTL = 60 * 1000;

const cors = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const qs      = event.queryStringParameters || {};
  const debug   = qs.debug === '1';
  const virtual = qs.virtual === '1';
  const mode    = virtual ? 'virtual' : 'in_person';
  const duration = virtual ? VIRTUAL_DURATION : SLOT_DURATION;

  if (!debug && _cache[mode] && (Date.now() - (_cacheAt[mode] || 0)) < CACHE_TTL)
    return { statusCode: 200, headers: cors, body: JSON.stringify(_cache[mode]) };

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

  // GHL returns { "YYYY-MM-DD": { slots: ["ISO-string", ...] }, traceId: "..." }
  // (also handles legacy format: { data: { "YYYY-MM-DD": [{ startTime }] } })
  const slots   = [];
  const dateMap = raw.data || raw;
  for (const [dateKey, dayObj] of Object.entries(dateMap)) {
    if (dateKey === 'traceId') continue;
    // Normalize: new format has { slots: [...] }, old format has [{ startTime }]
    const daySlots = Array.isArray(dayObj) ? dayObj : (dayObj && Array.isArray(dayObj.slots) ? dayObj.slots : null);
    if (!daySlots) continue;
    for (const slot of daySlots) {
      // New format: slot is an ISO string; old format: slot is { startTime, endTime }
      const startISO = typeof slot === 'string' ? slot : (slot.startTime || slot.time);
      if (!startISO) continue;
      const startDt = new Date(startISO);
      if (startDt <= now) continue;

      const endDt = new Date(startDt.getTime() + duration * 60 * 1000);

      slots.push({
        startISO: startDt.toISOString(),
        endISO:   endDt.toISOString(),
        label:    virtual ? formatVirtualLabel(startDt, endDt) : formatLabel(startDt, endDt),
      });
    }
  }

  slots.sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  _cache[mode]   = { slots: slots.slice(0, 20), virtual, durationMin: duration, fetchedAt: new Date().toISOString() };
  _cacheAt[mode] = Date.now();

  return { statusCode: 200, headers: cors, body: JSON.stringify(_cache[mode]) };
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

// Virtual calls start at an exact time (we plan them), so the label shows the real start–end, not a window.
function formatVirtualLabel(start, end) {
  const opts = { timeZone: 'America/Los_Angeles' };
  const dayStr = start.toLocaleDateString('en-US', { ...opts, weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d) => d.toLocaleTimeString('en-US', { ...opts, hour: 'numeric', minute: '2-digit' });
  return `${dayStr} · ${t(start)} – ${t(end)}`;
}
