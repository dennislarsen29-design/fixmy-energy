// call-inbound.js — receives inbound call webhooks from Grasshopper (via Zapier) or Smith.ai
// On missed call / call completion: upserts lead in Supabase + fires GHL callback tag

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const GHL_API  = 'https://services.leadconnectorhq.com';
const GHL_LOC  = process.env.GHL_LOCATION_ID;

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return '+' + digits;
}

// Parse caller info from multiple possible webhook shapes:
// Grasshopper (via Zapier), Smith.ai, or generic
function parsePayload(body) {
  // Smith.ai format
  if (body.call_id || body.caller_name) {
    return {
      source:    'smith_ai',
      phone:     normalizePhone(body.caller_phone || body.phone),
      name:      body.caller_name || body.name || null,
      summary:   body.call_summary || body.transcript || body.notes || null,
      event:     body.status || 'completed',
    };
  }
  // Grasshopper via Zapier — typical fields
  if (body.caller_id || body.CallerID || body.from) {
    return {
      source:    'grasshopper',
      phone:     normalizePhone(body.caller_id || body.CallerID || body.from),
      name:      body.caller_name || body.CallerName || null,
      summary:   body.transcription || body.message || null,
      event:     body.event_type || body.type || 'missed_call',
    };
  }
  // Generic fallback
  return {
    source:  'inbound_call',
    phone:   normalizePhone(body.phone || body.from || body.caller),
    name:    body.name || body.caller_name || null,
    summary: body.notes || body.summary || null,
    event:   body.event || 'inbound',
  };
}

async function upsertGhlContact(phone, firstName, lastName, tags) {
  const key = process.env.GHL_API_KEY;
  if (!key || !phone) return null;

  // Search for existing contact
  const search = await fetch(`${GHL_API}/contacts/?locationId=${GHL_LOC}&query=${encodeURIComponent(phone)}`, {
    headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28' }
  });
  const sData = await search.json();
  const existing = sData.contacts && sData.contacts[0];

  const payload = {
    locationId: GHL_LOC,
    phone,
    firstName: firstName || 'Unknown',
    lastName:  lastName  || 'Caller',
    tags,
  };

  if (existing) {
    await fetch(`${GHL_API}/contacts/${existing.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Version: '2021-07-28' },
      body: JSON.stringify({ tags }),
    });
    return existing.id;
  } else {
    const res = await fetch(`${GHL_API}/contacts/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Version: '2021-07-28' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    return d.contact && d.contact.id;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  // Check page submission (orphaned installer lead)
  const isCheckPage = body.source === 'check_page';

  const parsed = isCheckPage
    ? { source: 'check_page', phone: normalizePhone(body.phone), name: body.name || null,
        summary: body.notes || null, event: 'check_page_submit',
        address: body.address || null, installer: body.installer || null, install_year: body.install_year || null }
    : parsePayload(body);

  if (!parsed.phone) return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'no phone' }) };

  const supa = createClient(SUPA_URL, process.env.SUPA_SERVICE_KEY);

  // Check if lead already exists
  const { data: existing } = await supa
    .from('customers')
    .select('id, first_name, last_name, step, sold_type, notes')
    .eq('phone', parsed.phone)
    .maybeSingle();

  const nameParts = (parsed.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Unknown';
  const lastName  = nameParts.slice(1).join(' ') || 'Caller';

  const noteEntry = `[${new Date().toISOString().slice(0,16).replace('T',' ')}] Inbound call (${parsed.source}): ${parsed.event}` +
                    (parsed.summary ? '\n' + parsed.summary : '');

  if (existing) {
    const updatedNotes = [existing.notes, noteEntry].filter(Boolean).join('\n\n');
    await supa.from('customers').update({ notes: updatedNotes }).eq('id', existing.id);
    console.log('Updated existing lead', existing.id, parsed.phone);
  } else {
    const insertPayload = {
      first_name:    firstName,
      last_name:     lastName,
      phone:         parsed.phone,
      lead_category: 'fixmy',
      lead_source:   isCheckPage ? 'orphaned_list' : 'inbound_web',
      step:          1,
      notes:         noteEntry,
      created_at:    new Date().toISOString(),
    };
    if (isCheckPage && parsed.address)      insertPayload.address         = parsed.address;
    if (isCheckPage && parsed.installer)    insertPayload.original_installer = parsed.installer;
    const { error } = await supa.from('customers').insert(insertPayload);
    if (error) console.error('Supabase insert error:', error);
    else console.log('Created new lead for', parsed.phone, isCheckPage ? '(check page)' : '');
  }

  // Fire GHL tag
  const ghlTags = isCheckPage
    ? ['orphaned-installer-lead', parsed.installer ? `installer-${parsed.installer}` : 'installer-unknown'].filter(Boolean)
    : ['inbound-call-received'];

  await upsertGhlContact(parsed.phone, firstName, lastName, ghlTags);

  return { statusCode: 200, body: JSON.stringify({ ok: true, phone: parsed.phone, source: parsed.source }) };
};
