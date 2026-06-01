// ghl-log-communication.js
// Called by GHL workflows after every outbound SMS/Email/Call send,
// and by the Customer Reply workflow for inbound messages.
// Uses Supabase REST API directly (no SDK) to avoid package dependency issues.
//
// POST body:
//   phone      — customer phone (primary lookup)
//   email      — customer email (fallback lookup)
//   direction  — 'outbound' | 'inbound'
//   channel    — 'sms' | 'email' | 'call'
//   automation — e.g. "Missed Appt — Day 1 SMS"
//   message    — message body (truncated to 300 chars in log)
//   timestamp  — ISO string (defaults to now)

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const supaKey = process.env.SUPA_SERVICE_KEY;
  if (!supaKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { phone, email, direction, channel, automation, message, timestamp } = body;
  if (!direction) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'direction required' }) };
  if (!phone && !email) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'phone or email required' }) };

  const supaHeaders = {
    'apikey': supaKey,
    'Authorization': 'Bearer ' + supaKey,
    'Content-Type': 'application/json',
  };

  // Find customer by phone first, then email
  let customer = null;

  if (phone) {
    const normalized = phone.replace(/\D/g, '');
    const withPlus = '+' + normalized;
    // Try OR across common phone formats
    const phoneFilter = `or=(phone.eq.${encodeURIComponent(phone)},phone.eq.${encodeURIComponent(withPlus)},phone.eq.${encodeURIComponent(normalized)})`;
    const r = await fetch(`${SUPA_URL}/rest/v1/customers?${phoneFilter}&select=id,notes&limit=1`, { headers: supaHeaders });
    if (r.ok) {
      const rows = await r.json();
      if (rows && rows.length) customer = rows[0];
    }

    // Fallback: last-10-digit ilike match
    if (!customer && normalized.length >= 10) {
      const last10 = normalized.slice(-10);
      const r2 = await fetch(`${SUPA_URL}/rest/v1/customers?phone=ilike.*${last10}&select=id,notes&limit=1`, { headers: supaHeaders });
      if (r2.ok) {
        const rows2 = await r2.json();
        if (rows2 && rows2.length) customer = rows2[0];
      }
    }
  }

  if (!customer && email && !email.includes('@pending.fixmy.energy')) {
    const r = await fetch(`${SUPA_URL}/rest/v1/customers?email=ilike.${encodeURIComponent(email.trim())}&select=id,notes&limit=1`, { headers: supaHeaders });
    if (r.ok) {
      const rows = await r.json();
      if (rows && rows.length) customer = rows[0];
    }
  }

  if (!customer) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, note: 'Customer not found — log entry skipped' }) };
  }

  // Build timestamped log line
  const ts = timestamp ? new Date(timestamp) : new Date();
  const dateStr = ts.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', timeZone: 'America/Los_Angeles' });
  const timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });

  const icon = direction === 'inbound' ? '📥' : (channel === 'email' ? '📧' : channel === 'call' ? '📞' : '📤');
  const dirLabel = direction === 'inbound' ? 'Customer Reply' : `${(channel || 'sms').toUpperCase()} Sent`;
  const autoLabel = automation ? ` — ${automation}` : '';
  const msgSnippet = message ? `: "${message.trim().slice(0, 300)}${message.length > 300 ? '…' : ''}"` : '';
  const logLine = `[${dateStr} ${timeStr}] ${icon} ${dirLabel}${autoLabel}${msgSnippet}`;

  // Prepend to notes (newest first)
  const existing = (customer.notes || '').trim();
  const newNotes = existing ? `${logLine}\n${existing}` : logLine;

  const updateResp = await fetch(`${SUPA_URL}/rest/v1/customers?id=eq.${customer.id}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ notes: newNotes }),
  });

  if (!updateResp.ok) {
    const errText = await updateResp.text().catch(() => '');
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase update failed: ' + errText.slice(0, 200) }) };
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, customer_id: customer.id }) };
};
