// Black Box Dialer — receives GHL workflow webhooks after a dialer call is dispositioned
// and mirrors the outcome + note into Supabase (lead_activity row + customers.notes feed entry)
// so door knockers see phone-setter activity on the same lead, and vice versa.
//
// Wire up in GHL: Automations → workflow triggered on call disposition / manual action →
// Webhook action POSTing to https://fixmy.energy/.netlify/functions/ghl-dialer-sync with:
//   { phone: {{contact.phone}}, outcome: <disposition>, note: <call notes>, rep_name: {{user.name}} }
//
// ENV vars required: SUPA_SERVICE_KEY

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

// Map common GHL call-status / disposition values onto Black Box outcome keys
const OUTCOME_MAP = {
  no_answer: 'no_answer', 'no answer': 'no_answer', busy: 'no_answer', failed: 'no_answer',
  voicemail: 'left_vm', 'left voicemail': 'left_vm', left_vm: 'left_vm', vm: 'left_vm',
  callback: 'callback', 'call back': 'callback',
  warm: 'warm', interested: 'warm',
  booked: 'booked', appointment: 'booked', 'appointment booked': 'booked',
  not_interested: 'not_interested', 'not interested': 'not_interested',
  dnc: 'dnc', 'do not call': 'dnc', 'do not contact': 'dnc',
  wrong_number: 'wrong_number', 'wrong number': 'wrong_number',
  answered: 'contacted', completed: 'contacted', connected: 'contacted'
};

const OUTCOME_LABEL = {
  no_answer: 'No Answer', left_vm: 'Left Voicemail', callback: 'Callback Scheduled',
  warm: 'Warm — Interested', booked: 'Booked!', not_interested: 'Not Interested',
  dnc: 'Do Not Contact', wrong_number: 'Wrong Number', contacted: 'Contacted'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  if (!SUPA_SERVICE_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not configured' }) };
  }

  let p;
  try { p = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // GHL webhook payload shapes vary by workflow config — accept the common ones
  const rawPhone = p.phone || p.contact_phone || (p.contact && p.contact.phone)
    || (p.customData && p.customData.phone) || '';
  const digits = String(rawPhone).replace(/\D/g, '');
  const d10 = digits.length >= 10 ? digits.slice(-10) : null;
  if (!d10) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No usable phone in payload' }) };
  }

  const rawOutcome = String(p.outcome || p.disposition || p.call_status || p.status || '').toLowerCase().trim();
  const outcome = OUTCOME_MAP[rawOutcome] || (rawOutcome ? 'contacted' : null);
  const note = (p.note || p.notes || p.call_notes || p.body || '').toString().trim();
  const repName = (p.rep_name || p.user_name || (p.user && p.user.name) || 'GHL Dialer').toString();
  const callDuration = parseInt(p.call_duration || p.duration, 10) || null;
  const recordingUrl = p.recording_url || p.recordingUrl || null;

  const supaHeaders = {
    'apikey': SUPA_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    'Content-Type': 'application/json'
  };

  // Match customer by last-10-digits of phone (stored as plain 10 digits by imports)
  const findResp = await fetch(SUPA_URL + '/rest/v1/customers?select=id,first_name,last_name,notes,dial_attempts&phone=like.*' + d10 + '&limit=1', { headers: supaHeaders });
  const rows = await findResp.json();
  const c = Array.isArray(rows) && rows[0];
  if (!c) {
    console.log('ghl-dialer-sync: no customer matches phone', d10);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ matched: false, phone: d10 }) };
  }

  // 1. Structured activity row (non-fatal if lead_activity table not created yet)
  try {
    const actResp = await fetch(SUPA_URL + '/rest/v1/lead_activity', {
      method: 'POST',
      headers: { ...supaHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        customer_id: c.id, channel: 'dialer', outcome: outcome, note: note || null,
        rep_id: 'ghl', rep_name: repName,
        call_duration: callDuration, recording_url: recordingUrl
      })
    });
    if (!actResp.ok) console.warn('lead_activity insert failed:', actResp.status, await actResp.text());
  } catch(e) { console.warn('lead_activity insert error (non-fatal):', e.message); }

  // 2. Human-readable entry in the shared customers.notes feed (same JSON format as _appendNote in portal.html)
  let entries = [];
  if (c.notes) {
    if (c.notes.trim().charAt(0) === '[') { try { entries = JSON.parse(c.notes); } catch(e) { entries = [{ ts: null, by: 'Legacy', text: c.notes }]; } }
    else entries = [{ ts: null, by: 'Legacy', text: c.notes }];
  }
  const label = OUTCOME_LABEL[outcome] || (rawOutcome || 'Call');
  entries.push({
    ts: new Date().toISOString(),
    by: '📞 Dialer — ' + repName,
    text: label + (note ? ': ' + note : '')
  });

  const updates = {
    notes: JSON.stringify(entries),
    dial_status: outcome || 'contacted',
    dialed_at: new Date().toISOString(),
    dial_attempts: (c.dial_attempts || 0) + 1
  };
  if (outcome === 'dnc') updates.dnc = true;

  let patchResp = await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, {
    method: 'PATCH', headers: { ...supaHeaders, 'Prefer': 'return=minimal' }, body: JSON.stringify(updates)
  });
  if (!patchResp.ok) {
    // dialer columns may not exist yet — retry with notes (+dnc) only
    const fallback = { notes: updates.notes };
    if (updates.dnc) fallback.dnc = true;
    patchResp = await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + c.id, {
      method: 'PATCH', headers: { ...supaHeaders, 'Prefer': 'return=minimal' }, body: JSON.stringify(fallback)
    });
  }

  console.log('ghl-dialer-sync:', c.first_name, c.last_name, '(', c.id, ') →', outcome, 'by', repName);
  return {
    statusCode: 200, headers: cors,
    body: JSON.stringify({ matched: true, customerId: c.id, outcome: outcome, patched: patchResp.ok })
  };
};
