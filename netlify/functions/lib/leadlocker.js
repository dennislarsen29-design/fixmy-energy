// Lead Locker Room (getleads.leadlockerroom.com) — inbound webhook helpers (2026-10-07, per Dennis).
// A purchased lead arrives as JSON; we create a customers row (company lead, Axia/QCells pipeline),
// text the homeowner a "confirm your roof" message with a satellite image, and let the Dialer + Doors
// surface it first. Pure helpers live here so they can be tested without a network.
const notify = require('./notify');

const MAPS_KEY = process.env.GOOGLE_MAPS_KEY || 'AIzaSyBedpPe3461c1mYiD8yxjDMkYvrJ4MQQpc'; // same public client key portal.html ships
const SMS_FROM_HOUR = 8, SMS_TO_HOUR = 20; // Pacific — never text a homeowner outside these hours

function titleCase(s) { return String(s || '').trim().toLowerCase().replace(/(^|[\s\-'])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
function digits(p) { return String(p || '').replace(/\D/g, ''); }

// Lead Locker's "Test Webhook" button sends the documentation sample — acknowledge it, create nothing.
function isTestPayload(b) {
  return !!b && String(b.email || '').toLowerCase() === 'john.doe@example.com' && String(b.last_name || '') === 'Doe' && String(b.address || '') === '123 Main St';
}

function mapPayload(b) {
  const street = String(b.address || '').trim();
  const city = String(b.city || '').trim(), state = String(b.state || 'CA').trim(), zip = String(b.zip_code || b.zip || '').trim();
  const parts = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean);
  const phone10 = digits(b.phone).slice(-10);
  return {
    first_name: titleCase(b.first_name), last_name: titleCase(b.last_name),
    email: String(b.email || '').trim().toLowerCase() || null,
    phone: phone10.length === 10 ? phone10 : (digits(b.phone) || null),
    phone10: phone10.length === 10 ? phone10 : null,
    address: parts.join(', '),
    meta: {
      lead_id: b.id != null ? String(b.id) : null, consent: b.consent || null, trusted_form_url: b.trusted_form_url || null,
      utility_provider: b.utility_provider || null, amount_paid: b.amount_paid != null ? Number(b.amount_paid) : null,
      creative_sub_id: b.creative_sub_id != null ? String(b.creative_sub_id) : null, vertical: b.vertical || null, lead_created_at: b.created_at || null
    }
  };
}

function ptHour(now) {
  return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false }).format(now || new Date()), 10) % 24;
}
function inSmsWindow(now) { const h = ptHour(now); return h >= SMS_FROM_HOUR && h < SMS_TO_HOUR; }

function satelliteUrl(address) {
  return 'https://maps.googleapis.com/maps/api/staticmap?center=' + encodeURIComponent(address) + '&zoom=20&size=640x640&scale=2&maptype=satellite&markers=color:red%7C' + encodeURIComponent(address) + '&key=' + MAPS_KEY;
}

function smsText(first) {
  return 'Hi ' + (first || 'there') + ', it’s Dennis with Solar Review. I got your information and I’m working on applying for your solar project and designing your system. Can you confirm this is your roof (pic attached)? Just reply YES, or tell me if it’s off. Reply STOP to opt out.';
}

// Census geocoder (free, no key) so the lead can appear on the Doors map/route.
async function geocode(address, doFetch) {
  try {
    const ctl = new AbortController(); const t = setTimeout(function () { ctl.abort(); }, 4000);
    const r = await doFetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(address), { signal: ctl.signal });
    clearTimeout(t);
    const j = await r.json();
    const m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
    return m && m.coordinates ? { lat: m.coordinates.y, lng: m.coordinates.x } : null;
  } catch (e) { return null; }
}

// Send the "confirm your roof" text. Never throws; returns {status, reason}.
async function sendLeadSms(c, address, doFetch) {
  if (!c.phone) return { status: 'skipped', reason: 'no_phone' };
  const msg = smsText(c.first_name);
  let r = await notify.sendSms(c, msg, doFetch, [satelliteUrl(address)]);
  if (!r.ok && /ghl_sms_http_4/.test(r.reason || '')) r = await notify.sendSms(c, msg.replace(' (pic attached)', ''), doFetch); // image rejected -> text only
  if (r.ok) await copyToOwner(c, msg, doFetch);
  return r.ok ? { status: 'sent' } : { status: 'failed', reason: r.reason };
}

// Best-effort copy of the outgoing text to Dennis (tech4) so he can see exactly what went out.
// Never throws and never affects the lead's own send status.
async function copyToOwner(c, msg, doFetch) {
  try {
    const KEY = process.env.SUPA_SERVICE_KEY;
    if (!KEY) return;
    const r = await doFetch('https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1/team_members?id=eq.tech4&select=name,phone&limit=1', { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    const tm = ((await r.json().catch(function () { return []; })) || [])[0];
    if (!tm || !tm.phone) return;
    const who = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'new lead';
    await notify.sendSms({ phone: tm.phone, first_name: tm.name }, 'Lead Locker text sent to ' + who + ' (' + (c.phone || '') + '):\n\n' + msg.replace(/ Reply STOP to opt out\.$/, ''), doFetch);
  } catch (e) { /* ignore */ }
}

module.exports = { titleCase, isTestPayload, mapPayload, inSmsWindow, ptHour, satelliteUrl, smsText, geocode, sendLeadSms };
