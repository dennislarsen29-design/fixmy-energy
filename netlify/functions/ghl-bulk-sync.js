// Black Box Dialer — one-click bulk sync of Black Box leads into GHL as contacts,
// so GHL's Power Dialer (LC Phone) can call through them with no CSV import/export.
// Triggered from the portal's Dialer view ("Sync Queue to GHL" button).
//
// Upserts each lead (dedupes by phone/email via GHL's upsert endpoint) and applies
// the 'bb-dialer-lead' tag ONLY — deliberately distinct from workflow-trigger tags
// like 'send-diag-agreement' so bulk syncs never fire customer-facing automations.
//
// ENV vars required: SUPA_SERVICE_KEY, GHL_API_KEY

const SUPA_URL        = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const GHL_LOCATION_ID = 'gXWwbOVymY0iRfj7c1It';

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function toE164(raw) {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return '+' + digits;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  const GHL_API_KEY      = process.env.GHL_API_KEY;
  if (!SUPA_SERVICE_KEY || !GHL_API_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY / GHL_API_KEY not configured' }) };
  }

  const supaHeaders = {
    'apikey': SUPA_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    'Content-Type': 'application/json'
  };

  // Dialable Black Box leads: has phone, not DNC, quarantined or from the orphaned list
  const q = SUPA_URL + '/rest/v1/customers'
    + '?select=id,first_name,last_name,email,phone,address,installer'
    + '&or=(black_box.eq.true,lead_source.eq.orphaned_list)'
    + '&phone=not.is.null&phone=neq.'
    + '&or=(dnc.is.null,dnc.eq.false)'
    + '&limit=1000';
  const leadResp = await fetch(q, { headers: supaHeaders });
  const leads = await leadResp.json();
  if (!Array.isArray(leads)) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Supabase query failed', detail: leads }) };
  }

  const ghlHeaders = {
    'Authorization': 'Bearer ' + GHL_API_KEY,
    'Content-Type': 'application/json',
    'Version': '2021-07-28'
  };

  let synced = 0, failed = 0;
  const errors = [];

  for (const c of leads) {
    const body = {
      locationId: GHL_LOCATION_ID,
      phone:      toE164(c.phone),
      email:      (c.email && !c.email.endsWith('@pending.fixmy.energy')) ? c.email : undefined,
      firstName:  c.first_name || undefined,
      lastName:   c.last_name  || undefined,
      address1:   c.address    || undefined,
      source:     'Black Box Dialer',
      tags:       ['bb-dialer-lead']
    };
    try {
      const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
        method: 'POST', headers: ghlHeaders, body: JSON.stringify(body)
      });
      if (r.ok) { synced++; }
      else {
        failed++;
        if (errors.length < 5) errors.push({ id: c.id, status: r.status, detail: (await r.text()).slice(0, 200) });
      }
    } catch(e) {
      failed++;
      if (errors.length < 5) errors.push({ id: c.id, error: e.message });
    }
    await sleep(120); // stay well under GHL's 100-requests-per-10s burst limit
  }

  console.log('ghl-bulk-sync: total', leads.length, 'synced', synced, 'failed', failed);
  return { statusCode: 200, headers: cors, body: JSON.stringify({ total: leads.length, synced, failed, errors }) };
};
