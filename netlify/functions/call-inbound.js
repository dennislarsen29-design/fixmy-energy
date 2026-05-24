// call-inbound.js — receives Smith.ai webhooks + /check page form submissions
// Uses Supabase REST API directly (no SDK) to match other functions in this project

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const GHL_API  = 'https://services.leadconnectorhq.com';

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return digits.length > 6 ? '+' + digits : null;
}

function supaHeaders(key) {
  return { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };
}

async function supaGet(key, phone) {
  const url = SUPA_URL + '/rest/v1/customers?phone=eq.' + encodeURIComponent(phone) +
              '&select=id,first_name,last_name,notes&limit=1';
  const res = await fetch(url, { headers: supaHeaders(key) });
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function supaUpdate(key, id, updates) {
  await fetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id, {
    method: 'PATCH',
    headers: { ...supaHeaders(key), 'Prefer': 'return=minimal' },
    body: JSON.stringify(updates),
  });
}

async function supaInsert(key, row) {
  const res = await fetch(SUPA_URL + '/rest/v1/customers', {
    method: 'POST',
    headers: { ...supaHeaders(key), 'Prefer': 'return=minimal' },
    body: JSON.stringify(row),
  });
  return res.ok;
}

async function upsertGhlContact(phone, firstName, lastName, tags) {
  const key = process.env.GHL_API_KEY;
  const loc  = process.env.GHL_LOCATION_ID;
  if (!key || !phone) return;
  try {
    const search = await fetch(`${GHL_API}/contacts/?locationId=${loc}&query=${encodeURIComponent(phone)}`, {
      headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28' },
    });
    const sd = await search.json();
    const existing = sd.contacts && sd.contacts[0];
    if (existing) {
      await fetch(`${GHL_API}/contacts/${existing.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Version: '2021-07-28' },
        body: JSON.stringify({ tags }),
      });
    } else {
      await fetch(`${GHL_API}/contacts/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Version: '2021-07-28' },
        body: JSON.stringify({ locationId: loc, phone, firstName: firstName || 'Unknown', lastName: lastName || 'Caller', tags }),
      });
    }
  } catch (e) { console.warn('GHL upsert failed', e.message); }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const key = process.env.SUPA_SERVICE_KEY;
  if (!key) return { statusCode: 500, body: 'Missing SUPA_SERVICE_KEY' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  const isCheckPage = body.source === 'check_page';

  // Parse phone + caller info
  const rawPhone = isCheckPage ? body.phone : (body.caller_id || body.CallerID || body.from || body.caller_phone || body.phone);
  const phone = normalizePhone(rawPhone);
  if (!phone) return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'no phone' }) };

  const rawName  = isCheckPage ? body.name : (body.caller_name || body.CallerName || body.name || '');
  const parts    = (rawName || '').trim().split(/\s+/);
  const firstName = parts[0] || 'Unknown';
  const lastName  = parts.slice(1).join(' ') || 'Caller';

  const noteEntry = `[${new Date().toISOString().slice(0,16).replace('T',' ')}] ` +
    (isCheckPage
      ? `Check page submission — installer: ${body.installer || 'unknown'}${body.install_year ? ' (' + body.install_year + ')' : ''}`
      : `Inbound call (Smith.AI): ${body.status || body.event || 'received'}`) +
    (body.notes || body.call_summary || body.transcript ? '\n' + (body.notes || body.call_summary || body.transcript) : '');

  // Check for existing lead
  const existing = await supaGet(key, phone);

  if (existing) {
    const updatedNotes = [existing.notes, noteEntry].filter(Boolean).join('\n\n');
    await supaUpdate(key, existing.id, { notes: updatedNotes });
  } else {
    const row = {
      first_name:    firstName,
      last_name:     lastName,
      phone:         phone,
      lead_category: 'fixmy',
      lead_source:   isCheckPage ? 'orphaned_list' : 'inbound_web',
      step:          1,
      notes:         noteEntry,
      created_at:    new Date().toISOString(),
    };
    if (isCheckPage && body.address)   row.address = body.address;
    if (isCheckPage && body.installer) row.original_installer = body.installer;
    await supaInsert(key, row);
  }

  // GHL tags
  const tags = isCheckPage
    ? ['orphaned-installer-lead', body.installer ? `installer-${body.installer}` : 'installer-unknown']
    : ['inbound-call-received'];
  await upsertGhlContact(phone, firstName, lastName, tags);

  return { statusCode: 200, body: JSON.stringify({ ok: true, phone }) };
};
