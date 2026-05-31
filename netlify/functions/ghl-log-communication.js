// ghl-log-communication.js
// Called by GHL workflows after every outbound SMS/Email send, and by the
// Customer Reply workflow for inbound messages.
//
// POST body (all fields optional except direction + at least phone or email):
//   phone          — customer phone (used to look up record)
//   email          — customer email (fallback lookup)
//   direction      — 'outbound' | 'inbound'
//   channel        — 'sms' | 'email' | 'call'
//   automation     — human-readable automation name, e.g. "Confirmed Reminder"
//   message        — message body / subject (truncated to 300 chars in log)
//   timestamp      — ISO string (defaults to now)

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = process.env.SUPA_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_KEY = process.env.SUPA_SERVICE_KEY;

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!SUPA_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { phone, email, direction, channel, automation, message, timestamp } = body;

  if (!direction) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'direction required' }) };
  if (!phone && !email) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'phone or email required' }) };

  const supabase = createClient(SUPA_URL, SUPA_KEY);

  // Find the customer — try phone first, then email
  let customer = null;
  if (phone) {
    const normalized = phone.replace(/\D/g, '');
    // Try exact match first, then last-10-digits match
    const { data } = await supabase
      .from('customers')
      .select('id, notes')
      .or(`phone.eq.${phone},phone.eq.+${normalized},phone.eq.${normalized}`)
      .limit(1);
    if (data && data.length) customer = data[0];

    if (!customer && normalized.length >= 10) {
      const last10 = normalized.slice(-10);
      const { data: d2 } = await supabase
        .from('customers')
        .select('id, notes')
        .ilike('phone', `%${last10}`)
        .limit(1);
      if (d2 && d2.length) customer = d2[0];
    }
  }

  if (!customer && email && !email.includes('@pending.fixmy.energy')) {
    const { data } = await supabase
      .from('customers')
      .select('id, notes')
      .ilike('email', email.trim())
      .limit(1);
    if (data && data.length) customer = data[0];
  }

  if (!customer) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, note: 'Customer not found — log entry skipped' }) };
  }

  // Build log line
  const ts = timestamp ? new Date(timestamp) : new Date();
  const dateStr = ts.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', timeZone: 'America/Los_Angeles' });
  const timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });

  const icon = direction === 'inbound' ? '📥' : (channel === 'email' ? '📧' : '📤');
  const dirLabel = direction === 'inbound' ? 'Customer Reply' : `${(channel || 'sms').toUpperCase()} Sent`;
  const autoLabel = automation ? ` — ${automation}` : '';
  const msgSnippet = message ? `: "${message.trim().slice(0, 300)}${message.length > 300 ? '…' : ''}"` : '';

  const logLine = `[${dateStr} ${timeStr}] ${icon} ${dirLabel}${autoLabel}${msgSnippet}`;

  // Prepend to existing notes (newest first)
  const existing = (customer.notes || '').trim();
  const newNotes = existing ? `${logLine}\n${existing}` : logLine;

  const { error } = await supabase
    .from('customers')
    .update({ notes: newNotes })
    .eq('id', customer.id);

  if (error) {
    console.error('Supabase update error:', error);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, customer_id: customer.id }) };
};
