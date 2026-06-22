// One-shot seeder: inserts 17 Indeed applicants into candidates table.
// Trigger once: GET /.netlify/functions/seed-candidates?key=fixmy-seed-2026
// Safe to re-call — skips any first_name+last_name already in the table.
exports.handler = async (event) => {
  if ((event.queryStringParameters || {}).key !== 'fixmy-seed-2026') {
    return { statusCode: 403, body: 'Forbidden' };
  }

  const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
  const SUPA_KEY = process.env.SUPA_SERVICE_KEY;
  if (!SUPA_KEY) return { statusCode: 500, body: 'SUPA_SERVICE_KEY not set' };

  // sales_experience enum: none | some | 1-2yr | 3plus | solar
  const candidates = [
    // ----- May 31 batch (newest) -----
    { first_name:'Robert',   last_name:'Shelton III',
      sales_experience:'none',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers met: DL, US work auth.' },
    { first_name:'Alwin',    last_name:'Jones',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers met: DL, US auth, Leadership, Sales.' },
    { first_name:'Caitlin',  last_name:'McLeod',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers met: US auth, Leadership, Sales. No DL listed.' },
    { first_name:'Fred',     last_name:'Havens',
      phone:'760-473-9635',
      sales_experience:'none',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers met: US auth only. Background: Titan Fire, Legoland. Weakest qualifier set in this batch.' },
    { first_name:'Manulito', last_name:'Loman',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers met: DL, US auth, Leadership, Sales.' },
    { first_name:'James',    last_name:'Dragoo',
      sales_experience:'3plus', status:'applied', source:'indeed',
      why_solar:'Sales Manager at Hewlett Packard, managed 250+ employees, hiring/training/coaching/inventory management.',
      notes:'STANDOUT — Enterprise sales management at HP (250+ direct reports). Applied via Indeed 5/31. Qualifiers met: DL, US auth, Sales.' },
    { first_name:'Ivan',     last_name:'Yalda',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers met: DL, US auth, Leadership, Sales.' },
    // ----- May 30 batch -----
    { first_name:'Ukiah',    last_name:'Dublinski',
      sales_experience:'none',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers met: US auth, Leadership. No sales qualifier.' },
    { first_name:'Robert',   last_name:'Buller',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers met: DL, US auth, Leadership, Sales.' },
    { first_name:'Brian',    last_name:'Jordan',
      email:'conversation-brianjordan-4qky9@indeedemail.com',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers met: DL, US auth, Sales. No leadership listed.' },
    { first_name:'Alana',    last_name:'Dixon',
      email:'conversation-alanadixon-ms4q2@indeedemail.com',
      sales_experience:'solar', status:'applied', source:'indeed',
      why_solar:'Sales Manager at Krannich Solar — direct solar industry sales management experience.',
      notes:'TOP PICK — Solar industry: Sales Manager at Krannich Solar. Applied via Indeed 5/30. Qualifiers met: US auth, Sales.' },
    { first_name:'Sarah',    last_name:'Glancy',
      email:'conversation-sarahglancy-u7p0n@indeedemail.com',
      sales_experience:'none',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers met: US auth, Leadership. No sales qualifier.' },
    { first_name:'Victor',   last_name:'Franchetti',
      email:'conversation-victorfranchetti-8had6@indeedemail.com',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers met: DL, US auth, Leadership, Sales.' },
    { first_name:'Michael',  last_name:'McGlone',
      email:'conversation-michaelmcglone-55nlu@indeedemail.com',
      sales_experience:'none',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers met: US auth only. Weakest qualifier set.' },
    { first_name:'Carson',   last_name:'Pugh',
      email:'conversation-carsonpugh-0vi72@indeedemail.com',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers met: DL, US auth, Leadership, Sales.' },
    { first_name:'Jaymark',  last_name:'Liedle',
      email:'conversation-jaymarkliedle-lq60j@indeedemail.com',
      sales_experience:'none',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers met: DL, US auth, Leadership. No sales qualifier.' },
    { first_name:'Brett',    last_name:'Banaszak',
      email:'conversation-brettbanaszak-inoiz@indeedemail.com',
      sales_experience:'some',  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/29. Qualifiers met: DL, US auth, Leadership, Sales.' },
  ];

  // Fetch existing to skip duplicates
  const existResp = await fetch(
    `${SUPA_URL}/rest/v1/candidates?select=first_name,last_name`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const existing = await existResp.json();
  const existSet = new Set((existing || []).map(r => `${r.first_name}|${r.last_name}`));

  const toInsert = candidates.filter(c => !existSet.has(`${c.first_name}|${c.last_name}`));
  if (!toInsert.length) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'All 17 candidates already in table — nothing to insert.', skipped: 17 }),
    };
  }

  const resp = await fetch(`${SUPA_URL}/rest/v1/candidates`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(toInsert),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { statusCode: 500, body: `Supabase error ${resp.status}: ${err}` };
  }

  const inserted = await resp.json();
  return {
    statusCode: 200,
    body: JSON.stringify({
      inserted: inserted.length,
      skipped: 17 - toInsert.length,
      names: inserted.map(r => `${r.first_name} ${r.last_name}`),
    }),
  };
};
