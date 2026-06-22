// One-shot seeder: inserts 17 Indeed applicants into candidates table.
// Trigger once: GET /.netlify/functions/seed-candidates?key=fixmy-seed-2026
// Safe to call again — inserts are skipped if first_name+last_name already exists.
exports.handler = async (event) => {
  if ((event.queryStringParameters || {}).key !== 'fixmy-seed-2026') {
    return { statusCode: 403, body: 'Forbidden' };
  }

  const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
  const SUPA_KEY = process.env.SUPA_SERVICE_KEY;
  if (!SUPA_KEY) return { statusCode: 500, body: 'SUPA_SERVICE_KEY not set' };

  const candidates = [
    // May 31 batch
    { first_name:'Robert',  last_name:'Shelton III',  sales_experience:false, status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers: DL, US auth.' },
    { first_name:'Alwin',   last_name:'Jones',         sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers: DL, US auth, Leadership, Sales.' },
    { first_name:'Caitlin', last_name:'McLeod',        sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers: US auth, Leadership, Sales.' },
    { first_name:'Fred',    last_name:'Havens',        phone:'760-473-9635',   sales_experience:false, status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers: US auth only. Background: Titan Fire, Legoland.' },
    { first_name:'Manulito',last_name:'Loman',         sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers: DL, US auth, Leadership, Sales.' },
    { first_name:'James',   last_name:'Dragoo',        sales_experience:true,  status:'applied', source:'indeed',
      why_solar:'Sales Manager at Hewlett Packard, managed 250+ employees, hiring/training/coaching/inventory management.',
      notes:'STANDOUT — HP Sales Manager 250+ employees. Applied via Indeed 5/31. Qualifiers: DL, US auth, Sales.' },
    { first_name:'Ivan',    last_name:'Yalda',         sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/31. Qualifiers: DL, US auth, Leadership, Sales.' },
    // May 30 batch (no-email group)
    { first_name:'Ukiah',   last_name:'Dublinski',     sales_experience:false, status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers: US auth, Leadership.' },
    { first_name:'Robert',  last_name:'Buller',        sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers: DL, US auth, Leadership, Sales.' },
    // May 30 batch (Indeed relay emails available)
    { first_name:'Brian',   last_name:'Jordan',        email:'conversation-brianjordan-4qky9@indeedemail.com',
      sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers: DL, US auth, Sales.' },
    { first_name:'Alana',   last_name:'Dixon',         email:'conversation-alanadixon-ms4q2@indeedemail.com',
      sales_experience:true,  status:'applied', source:'indeed',
      why_solar:'Sales Manager at Krannich Solar — direct solar industry sales management experience.',
      notes:'STANDOUT — Solar industry: Sales Manager at Krannich Solar. Applied via Indeed 5/30. Qualifiers: US auth, Sales.' },
    { first_name:'Sarah',   last_name:'Glancy',        email:'conversation-sarahglancy-u7p0n@indeedemail.com',
      sales_experience:false, status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers: US auth, Leadership.' },
    { first_name:'Victor',  last_name:'Franchetti',    email:'conversation-victorfranchetti-8had6@indeedemail.com',
      sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers: DL, US auth, Leadership, Sales.' },
    { first_name:'Michael', last_name:'McGlone',       email:'conversation-michaelmcglone-55nlu@indeedemail.com',
      sales_experience:false, status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers: US auth only. Weakest qualifier set.' },
    { first_name:'Carson',  last_name:'Pugh',          email:'conversation-carsonpugh-0vi72@indeedemail.com',
      sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers: DL, US auth, Leadership, Sales.' },
    { first_name:'Jaymark', last_name:'Liedle',        email:'conversation-jaymarkliedle-lq60j@indeedemail.com',
      sales_experience:false, status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/30. Qualifiers: DL, US auth, Leadership.' },
    { first_name:'Brett',   last_name:'Banaszak',      email:'conversation-brettbanaszak-inoiz@indeedemail.com',
      sales_experience:true,  status:'applied', source:'indeed',
      notes:'Applied via Indeed 5/29. Qualifiers: DL, US auth, Leadership, Sales.' },
  ];

  // Fetch existing candidates to skip duplicates
  const existResp = await fetch(
    `${SUPA_URL}/rest/v1/candidates?select=first_name,last_name`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const existing = await existResp.json();
  const existSet = new Set((existing || []).map(r => `${r.first_name}|${r.last_name}`));

  const toInsert = candidates.filter(c => !existSet.has(`${c.first_name}|${c.last_name}`));
  if (!toInsert.length) {
    return { statusCode: 200, body: JSON.stringify({ message: 'All candidates already exist — nothing to insert.', skipped: candidates.length }) };
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
    return { statusCode: 500, body: `Supabase error: ${err}` };
  }

  const inserted = await resp.json();
  return {
    statusCode: 200,
    body: JSON.stringify({
      inserted: inserted.length,
      skipped: candidates.length - toInsert.length,
      names: inserted.map(r => `${r.first_name} ${r.last_name}`),
    }),
  };
};
