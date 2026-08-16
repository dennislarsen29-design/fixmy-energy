// Meta Conversions API — server-side event forwarding.
// Mirrors the client-side fbq() events with hashed customer data so ad
// optimization survives ad-blockers / ITP / iOS signal loss, and so Purchase
// (the event that actually matters for ROAS) doesn't depend solely on a
// browser pixel firing.
//
// No-ops silently when META_PIXEL_ID / META_CAPI_TOKEN aren't set — same
// "degrades quietly" convention as REGRID_KEY, IG_ACCESS_TOKEN, etc.
// elsewhere in this repo. Get the token from Meta Events Manager → Data
// Sources → [pixel] → Settings → Conversions API → Generate Access Token.

const crypto = require('crypto');

function sha256(v) {
  if (v === undefined || v === null || v === '') return undefined;
  return crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
}

// Meta wants phone as country code + digits, no plus sign, no punctuation.
function normalizePhone(raw) {
  if (!raw) return undefined;
  var digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
  if (digits.length !== 10) return undefined;
  return '1' + digits;
}

async function sendMetaEvent(opts) {
  opts = opts || {};
  const pixelId = process.env.META_PIXEL_ID || '955546210177969';
  const token = process.env.META_CAPI_TOKEN;
  if (!token) {
    console.log('meta-capi: skipped (META_CAPI_TOKEN not set) —', opts.eventName);
    return { skipped: true };
  }

  const user_data = {
    em: opts.email ? [sha256(opts.email)] : undefined,
    ph: opts.phone ? [sha256(normalizePhone(opts.phone) || opts.phone)] : undefined,
    fn: opts.firstName ? [sha256(opts.firstName)] : undefined,
    ln: opts.lastName ? [sha256(opts.lastName)] : undefined,
    client_ip_address: opts.clientIp || undefined,
    client_user_agent: opts.userAgent || undefined,
    fbp: opts.fbp || undefined,
    fbc: opts.fbc || undefined,
  };
  Object.keys(user_data).forEach(function(k) { if (user_data[k] === undefined) delete user_data[k]; });

  const custom_data = Object.assign(
    {},
    opts.value != null ? { value: opts.value, currency: (opts.currency || 'USD').toUpperCase() } : {},
    opts.customData || {}
  );

  const payload = {
    data: [{
      event_name: opts.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: opts.eventId || undefined,
      event_source_url: opts.eventSourceUrl || undefined,
      action_source: 'website',
      user_data: user_data,
      custom_data: custom_data,
    }],
  };

  try {
    const resp = await fetch(
      'https://graph.facebook.com/v21.0/' + pixelId + '/events?access_token=' + encodeURIComponent(token),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const data = await resp.json().catch(function() { return {}; });
    if (!resp.ok) {
      console.warn('meta-capi: event failed', opts.eventName, resp.status, JSON.stringify(data).slice(0, 300));
    } else {
      console.log('meta-capi: sent', opts.eventName, 'events_received:', data.events_received);
    }
    return { ok: resp.ok, status: resp.status, data: data };
  } catch (e) {
    console.warn('meta-capi: fetch error', opts.eventName, e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendMetaEvent: sendMetaEvent, sha256: sha256, normalizePhone: normalizePhone };
