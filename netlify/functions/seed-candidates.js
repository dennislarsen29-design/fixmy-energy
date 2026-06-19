// One-time seed function: imports 17 Indeed applicants from May 2026 wave
// Call once at /.netlify/functions/seed-candidates to insert all candidates
// Idempotent: skips any candidate whose first+last name already exists

const { createClient } = require('@supabase/supabase-js');

const CANDIDATES = [
  {
    first_name: 'Robert', last_name: 'Shelton III',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026. Qualifications: Driver\'s License, US work auth.'
  },
  {
    first_name: 'Alwin', last_name: 'Jones',
    sales_experience: true, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026. Qualifications: Driver\'s License, US work auth, Leadership, Sales.'
  },
  {
    first_name: 'Caitlin', last_name: 'McLeod',
    sales_experience: true, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026. Qualifications: US work auth, Leadership, Sales.'
  },
  {
    first_name: 'Fred', last_name: 'Havens',
    phone: '760-473-9635',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026. Background: Titan Fire & Life Safety (delivery), Legoland lifeguard. Included phone in application message.'
  },
  {
    first_name: 'Manulito', last_name: 'Loman',
    sales_experience: true, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026. Qualifications: Driver\'s License, US work auth, Leadership, Sales.'
  },
  {
    first_name: 'James', last_name: 'Dragoo',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Ivan', last_name: 'Yalda',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Ukiah', last_name: 'Dublinski',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Robert', last_name: 'Buller',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Brian', last_name: 'Jordan',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Alana', last_name: 'Dixon',
    sales_experience: true, source: 'indeed', status: 'applied',
    why_solar: 'Relevant experience: Sales Manager at Krannich Solar',
    notes: 'Indeed application May 2026. TOP CANDIDATE — Sales Manager at Krannich Solar (direct solar industry experience). Qualifications: US work auth, Sales.'
  },
  {
    first_name: 'Sarah', last_name: 'Glancy',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Victor', last_name: 'Franchetti',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Michael', last_name: 'McGlone',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Carson', last_name: 'Pugh',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Jaymark', last_name: 'Liedle',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  },
  {
    first_name: 'Brett', last_name: 'Banaszak',
    sales_experience: false, source: 'indeed', status: 'applied',
    notes: 'Indeed application May 2026.'
  }
];

exports.handler = async (event) => {
  const supabase = createClient(
    'https://kbtobyoumvbcxfbugsid.supabase.co',
    process.env.SUPA_SERVICE_KEY
  );

  // Fetch existing indeed candidates to avoid duplicates
  const { data: existing } = await supabase
    .from('candidates')
    .select('first_name, last_name')
    .eq('source', 'indeed');

  const existingNames = new Set(
    (existing || []).map(c => `${c.first_name.toLowerCase()}|${c.last_name.toLowerCase()}`)
  );

  const toInsert = CANDIDATES.filter(c =>
    !existingNames.has(`${c.first_name.toLowerCase()}|${c.last_name.toLowerCase()}`)
  );

  if (toInsert.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'All candidates already exist — nothing inserted.', skipped: CANDIDATES.length })
    };
  }

  const { data, error } = await supabase.from('candidates').insert(toInsert).select();

  if (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Inserted ${data.length} candidates, skipped ${CANDIDATES.length - toInsert.length} duplicates.`,
      inserted: data.map(c => `${c.first_name} ${c.last_name}`)
    })
  };
};
