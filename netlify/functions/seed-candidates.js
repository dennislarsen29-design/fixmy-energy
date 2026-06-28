// One-shot function to insert 17 Indeed applicants collected May 29-31, 2026.
// Call once: GET /.netlify/functions/seed-candidates?secret=fixmy2026seed
// Delete this file after use.
const { createClient } = require('@supabase/supabase-js');

const CANDIDATES = [
  { first_name: 'Brett',     last_name: 'Banaszak',     status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-29T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Leadership, Sales' },
  { first_name: 'Jaymark',   last_name: 'Liedle',       status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-30T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Leadership' },
  { first_name: 'Carson',    last_name: 'Pugh',         status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-30T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Leadership, Sales' },
  { first_name: 'Michael',   last_name: 'McGlone',      status: 'applied', source: 'indeed', sales_experience: 'none',  created_at: '2026-05-30T00:00:00Z', notes: 'Indeed badges: US Work Auth only' },
  { first_name: 'Victor',    last_name: 'Franchetti',   status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-30T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Leadership, Sales' },
  { first_name: 'Sarah',     last_name: 'Glancy',       status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-30T00:00:00Z', notes: 'Indeed badges: US Work Auth, Leadership' },
  { first_name: 'Alana',     last_name: 'Dixon',        status: 'applied', source: 'indeed', sales_experience: 'solar', created_at: '2026-05-30T00:00:00Z', notes: 'Sales Manager at Krannich Solar — direct solar industry experience. Indeed badges: US Work Auth, Sales. TOP CANDIDATE.' },
  { first_name: 'Brian',     last_name: 'Jordan',       status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-30T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Sales' },
  { first_name: 'Robert',    last_name: 'Buller',       status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-30T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Leadership, Sales' },
  { first_name: 'Ukiah',     last_name: 'Dublinski',    status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-30T00:00:00Z', notes: 'Indeed badges: US Work Auth, Leadership, Sales' },
  { first_name: 'Ivan',      last_name: 'Yalda',        status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-31T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Leadership, Sales' },
  { first_name: 'James',     last_name: 'Dragoo',       status: 'applied', source: 'indeed', sales_experience: '3plus', created_at: '2026-05-31T00:00:00Z', notes: 'Former HP Sales Manager — managed 250+ employees. Cover letter: excellent at closing sales. Indeed badges: Driver License, US Work Auth, Sales. TOP CANDIDATE.' },
  { first_name: 'Manulito',  last_name: 'Loman',        status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-31T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Leadership, Sales' },
  { first_name: 'Fred',      last_name: 'Havens',       status: 'applied', source: 'indeed', sales_experience: 'none',  created_at: '2026-05-31T00:00:00Z', notes: 'Background: delivery driver (Titan Fire & Life Safety), lifeguard (Legoland). Indeed badges: US Work Auth only. Weak fit.' },
  { first_name: 'Caitlin',   last_name: 'McLeod',       status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-31T00:00:00Z', notes: 'Indeed badges: US Work Auth, Leadership, Sales' },
  { first_name: 'Alwin',     last_name: 'Jones',        status: 'applied', source: 'indeed', sales_experience: 'some',  created_at: '2026-05-31T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth, Leadership, Sales' },
  { first_name: 'Robert',    last_name: 'Shelton III',  status: 'applied', source: 'indeed', sales_experience: 'none',  created_at: '2026-05-31T00:00:00Z', notes: 'Indeed badges: Driver License, US Work Auth only' },
];

exports.handler = async (event) => {
  if (event.queryStringParameters?.secret !== 'fixmy2026seed') {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const client = createClient(
    'https://kbtobyoumvbcxfbugsid.supabase.co',
    process.env.SUPA_SERVICE_KEY
  );

  const { data, error } = await client
    .from('candidates')
    .insert(CANDIDATES)
    .select('id, first_name, last_name');

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ inserted: data.length, candidates: data }),
  };
};
