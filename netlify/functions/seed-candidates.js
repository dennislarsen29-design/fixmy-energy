// One-time seed: inserts 17 Indeed applicants (May 29-31, 2026) into the candidates table.
// GET /.netlify/functions/seed-candidates?token=seed2026fix
// After use, this function can be deleted or left in place (re-running is safe — no duplicates by default).

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

const CANDIDATES = [
  // Tier 1 — Full qualifications (DL + US Auth + Leadership + Sales)
  { first_name: 'Alwin',    last_name: 'Jones',      sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.', created_at: '2026-05-31T12:00:00Z' },
  { first_name: 'Manulito', last_name: 'Loman',      sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.', created_at: '2026-05-31T12:00:00Z' },
  { first_name: 'Ivan',     last_name: 'Yalda',      sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.', created_at: '2026-05-31T12:00:00Z' },
  { first_name: 'Robert',   last_name: 'Buller',     sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.', created_at: '2026-05-30T12:00:00Z' },
  { first_name: 'Victor',   last_name: 'Franchetti', sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.', created_at: '2026-05-30T12:00:00Z' },
  { first_name: 'Carson',   last_name: 'Pugh',       sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.', created_at: '2026-05-30T12:00:00Z' },
  { first_name: 'Brett',    last_name: 'Banaszak',   sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.', created_at: '2026-05-29T12:00:00Z' },
  // Tier 2 — Standout backgrounds (call these)
  { first_name: 'James',    last_name: 'Dragoo',     sales_experience: '3plus', status: 'applied', source: 'indeed', notes: 'CALL FIRST — HP Sales Manager, managed 250+ employees. DL ✓ US Auth ✓ Sales ✓.', why_solar: 'As a sales manager at Hewlett Packard I managed over 250 employees. I was in charge of hiring, training. Coaching and inventory management. I am excellent at prosecuting and closing sales.', created_at: '2026-05-31T12:00:00Z' },
  { first_name: 'Alana',    last_name: 'Dixon',      sales_experience: 'solar', status: 'applied', source: 'indeed', notes: 'CALL FIRST — Sales Manager at Krannich Solar. Direct solar industry experience. US Auth ✓ Sales ✓.', why_solar: 'Sales Manager at Krannich Solar — direct solar industry background.', created_at: '2026-05-30T12:00:00Z' },
  // Tier 3 — Partial qualifications (consider)
  { first_name: 'Caitlin',  last_name: 'McLeod',     sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 3 — US Auth ✓ Leadership ✓ Sales ✓. No Driver License listed.', created_at: '2026-05-31T12:00:00Z' },
  { first_name: 'Ukiah',    last_name: 'Dublinski',  sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 3 — US Auth ✓ Leadership ✓ Sales ✓. No Driver License listed.', created_at: '2026-05-30T12:00:00Z' },
  { first_name: 'Brian',    last_name: 'Jordan',     sales_experience: 'some',  status: 'applied', source: 'indeed', notes: 'Tier 3 — DL ✓ US Auth ✓ Sales ✓. No Leadership badge.', created_at: '2026-05-30T12:00:00Z' },
  { first_name: 'Sarah',    last_name: 'Glancy',     sales_experience: 'none',  status: 'applied', source: 'indeed', notes: 'Tier 3 — US Auth ✓ Leadership ✓. No Sales or Driver License. Lower priority.', created_at: '2026-05-30T12:00:00Z' },
  { first_name: 'Jaymark',  last_name: 'Liedle',     sales_experience: 'none',  status: 'applied', source: 'indeed', notes: 'Tier 3 — DL ✓ US Auth ✓ Leadership ✓. No Sales badge. Lower priority.', created_at: '2026-05-30T12:00:00Z' },
  // Tier 4 — Weak fits (pass)
  { first_name: 'Robert',   last_name: 'Shelton',    sales_experience: 'none',  status: 'applied', source: 'indeed', notes: 'Tier 4 — DL ✓ US Auth ✓ only. No Sales or Leadership. Pass.', created_at: '2026-05-31T12:00:00Z' },
  { first_name: 'Michael',  last_name: 'McGlone',    sales_experience: 'none',  status: 'applied', source: 'indeed', notes: 'Tier 4 — US Auth ✓ only. No Sales, Leadership, or DL. Pass.', created_at: '2026-05-30T12:00:00Z' },
  { first_name: 'Fred',     last_name: 'Havens',     email: 'fredzhavens04@gmail.com', phone: '760-473-9635', sales_experience: 'none', status: 'applied', source: 'indeed', notes: 'Tier 4 — US Auth ✓ only. Background: Titan Fire deliveries, Legoland lifeguard. Pass.', created_at: '2026-05-31T12:00:00Z' }
];

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS, body: 'GET only' };

  const params = event.queryStringParameters || {};
  if (params.token !== 'seed2026fix') {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized — add ?token=seed2026fix' }) };
  }

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  if (!SUPA_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set in env' }) };
  }

  const results = [];
  for (const candidate of CANDIDATES) {
    const resp = await fetch(SUPA_URL + '/rest/v1/candidates', {
      method: 'POST',
      headers: {
        'apikey': SUPA_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(candidate)
    });
    const text = resp.ok ? '' : await resp.text();
    results.push({ name: candidate.first_name + ' ' + candidate.last_name, ok: resp.ok, httpStatus: resp.status, error: text || undefined });
  }

  const inserted = results.filter(r => r.ok).length;
  const failed   = results.filter(r => !r.ok).length;
  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ inserted, failed, results }, null, 2)
  };
};
