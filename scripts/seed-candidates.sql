-- Indeed applicants — May 29–31 2026 batch (17 candidates)
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/kbtobyoumvbcxfbugsid/sql
-- Emails are Indeed conversation aliases; contact via those aliases or reply through Indeed.
-- status defaults to 'applied'. notes column is internal admin only.

INSERT INTO candidates (first_name, last_name, email, sales_experience, why_solar, source, status, notes)
VALUES

-- TIER 1: Strongest fits — prioritize outreach
('Alana',   'Dixon',        'conversation-alanadixon-ms4q2@indeedemail.com',
 'solar',   NULL,
 'Indeed',  'applied',
 'TIER 1 — Indeed match: Sales Manager at Krannich Solar (real solar industry background). Qualifications: US work auth ✓, Sales ✓.'),

('James',   'Dragoo',       'conversation-jamesdragoo-gojxf@indeedemail.com',
 '3plus',   'As a sales manager at Hewlett Packard I managed over 250 employees. I was in charge of hiring, training. Coaching and inventory management. I am excellent at prosecuting and closing sales.',
 'Indeed',  'applied',
 'TIER 1 — HP sales manager, 250+ reports. Strong cover letter. Qualifications: DL ✓, US work auth ✓, Sales ✓.'),

-- TIER 2: Full qualifier set (DL + US auth + Leadership + Sales)
('Alwin',   'Jones',        'conversation-alwinjones-wryhu@indeedemail.com',
 '3plus',   NULL,
 'Indeed',  'applied',
 'TIER 2 — Full qualifier set. Qualifications: DL ✓, US work auth ✓, Leadership ✓, Sales ✓.'),

('Manulito','Loman',        'conversation-manulitoloman-5j5yt@indeedemail.com',
 '3plus',   NULL,
 'Indeed',  'applied',
 'TIER 2 — Full qualifier set. Qualifications: DL ✓, US work auth ✓, Leadership ✓, Sales ✓.'),

('Ivan',    'Yalda',        'conversation-ivanyalda-5bxs0@indeedemail.com',
 '3plus',   NULL,
 'Indeed',  'applied',
 'TIER 2 — Full qualifier set. Qualifications: DL ✓, US work auth ✓, Leadership ✓, Sales ✓.'),

('Robert',  'Buller',       'conversation-robertbuller-3mmdi@indeedemail.com',
 '3plus',   NULL,
 'Indeed',  'applied',
 'TIER 2 — Full qualifier set. Qualifications: DL ✓, US work auth ✓, Leadership ✓, Sales ✓.'),

('Victor',  'Franchetti',   'conversation-victorfranchetti-8had6@indeedemail.com',
 '3plus',   NULL,
 'Indeed',  'applied',
 'TIER 2 — Full qualifier set. Qualifications: DL ✓, US work auth ✓, Leadership ✓, Sales ✓.'),

('Carson',  'Pugh',         'conversation-carsonpugh-0vi72@indeedemail.com',
 '3plus',   NULL,
 'Indeed',  'applied',
 'TIER 2 — Full qualifier set. Qualifications: DL ✓, US work auth ✓, Leadership ✓, Sales ✓.'),

('Brett',   'Banaszak',     'conversation-brettbanaszak-inoiz@indeedemail.com',
 '3plus',   NULL,
 'Indeed',  'applied',
 'TIER 2 — Full qualifier set. Qualifications: DL ✓, US work auth ✓, Leadership ✓, Sales ✓.'),

-- TIER 3: Partial qualifiers
('Caitlin', 'McLeod',       'conversation-caitlinmcleod-fixid@indeedemail.com',
 '3plus',   NULL,
 'Indeed',  'applied',
 'TIER 3 — Missing Driver''s License. Qualifications: US work auth ✓, Leadership ✓, Sales ✓.'),

('Brian',   'Jordan',       'conversation-brianjordan-4qky9@indeedemail.com',
 'some',    NULL,
 'Indeed',  'applied',
 'TIER 3 — Missing Leadership badge. Qualifications: DL ✓, US work auth ✓, Sales ✓.'),

('Ukiah',   'Dublinski',    'conversation-ukiahdublinski-5h3up@indeedemail.com',
 'some',    NULL,
 'Indeed',  'applied',
 'TIER 3 — Missing Driver''s License. Qualifications: US work auth ✓, Leadership ✓, Sales ✓.'),

('Jaymark', 'Liedle',       'conversation-jaymarkliedle-lq60j@indeedemail.com',
 'some',    NULL,
 'Indeed',  'applied',
 'TIER 3 — Missing Sales badge. Qualifications: DL ✓, US work auth ✓, Leadership ✓.'),

('Sarah',   'Glancy',       'conversation-sarahglancy-u7p0n@indeedemail.com',
 'some',    NULL,
 'Indeed',  'applied',
 'TIER 3 — Missing Sales and Driver''s License. Qualifications: US work auth ✓, Leadership ✓.'),

('Robert',  'Shelton III',  'conversation-robertsheltoniii-82vwx@indeedemail.com',
 'some',    NULL,
 'Indeed',  'applied',
 'TIER 3 — Basic qualifications only. Qualifications: DL ✓, US work auth ✓.'),

-- TIER 4: Weakest qualifiers
('Michael', 'McGlone',      'conversation-michaelmcglone-55nlu@indeedemail.com',
 'none',    NULL,
 'Indeed',  'applied',
 'TIER 4 — US work auth only. No sales or leadership badges.'),

('Fred',    'Havens IV',    'conversation-fredhavensiv-4mdd0@indeedemail.com',
 'some',    'Background in fire safety (Titan Fire & Life Safety) and field routes across SD County. Also worked at Legoland CA.',
 'Indeed',  'applied',
 'TIER 4 — US work auth only. Field/route experience. Direct: fredzhavens04@gmail.com, 760-473-9635.');
