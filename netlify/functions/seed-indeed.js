// One-time seed function: inserts 10 Indeed applicants from May 30–31 2026
// Trigger via GET https://<deploy>.netlify.app/.netlify/functions/seed-indeed?key=seed2026
// Delete this file after running.

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const CANDIDATES = [
  { first_name: 'Brian',    last_name: 'Jordan',      sales_experience: 'Driver License, US work auth, Sales',                    why_solar: null },
  { first_name: 'Robert',   last_name: 'Buller',      sales_experience: 'Driver License, US work auth, Leadership, Sales',        why_solar: null },
  { first_name: 'Ukiah',    last_name: 'Dublinski',   sales_experience: 'US work auth, Leadership, Sales',                       why_solar: null },
  { first_name: 'Ivan',     last_name: 'Yalda',       sales_experience: 'Driver License, US work auth, Leadership, Sales',        why_solar: null },
  { first_name: 'James',    last_name: 'Dragoo',      sales_experience: 'Driver License, US work auth, Sales',                    why_solar: 'Sales manager at Hewlett Packard, managed 250+ employees, hiring, training, coaching, inventory. Excellent at closing sales.' },
  { first_name: 'Manulito', last_name: 'Loman',       sales_experience: 'Driver License, US work auth, Leadership, Sales',        why_solar: null },
  { first_name: 'Fred',     last_name: 'Havens',      sales_experience: 'US work auth only — no sales/leadership qualifications', why_solar: 'Titan Fire & Life Safety truck delivery, Legoland lifeguard. No sales background.', phone: '7604739635', email: 'fredzhavens04@gmail.com' },
  { first_name: 'Caitlin',  last_name: 'McLeod',      sales_experience: 'US work auth, Leadership, Sales',                       why_solar: null },
  { first_name: 'Alwin',    last_name: 'Jones',       sales_experience: 'Driver License, US work auth, Leadership, Sales',        why_solar: null },
  { first_name: 'Robert',   last_name: 'Shelton III', sales_experience: 'Driver License, US work auth',                          why_solar: null },
];

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  if ((event.queryStringParameters || {}).key !== 'seed2026') {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Missing or invalid key' }) };
  }

  const SUPA_SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
  if (!SUPA_SERVICE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not configured' }) };
  }

  const supaHeaders = {
    'apikey': SUPA_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPA_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  const records = CANDIDATES.map(c => ({
    ...c,
    status: 'applied',
    source: 'indeed',
  }));

  const resp = await fetch(SUPA_URL + '/rest/v1/candidates', {
    method: 'POST',
    headers: supaHeaders,
    body: JSON.stringify(records),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase insert failed', detail: err }) };
  }

  const inserted = await resp.json();
  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ success: true, inserted: inserted.length, names: inserted.map(r => r.first_name + ' ' + r.last_name) }),
  };
};
