-- Indeed Candidates Import — Run in Supabase SQL Editor
-- 17 applicants for "Solar Energy Consultant — Diagnostics & Battery Storage Sales"
-- Applied May 29–31, 2026 via Indeed
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste this → Run
-- The indeedemail.com addresses are Indeed relay emails — you can reply
-- to them and the message goes through to the candidate via Indeed.
-- Fred Havens provided his direct email/phone.

INSERT INTO candidates (first_name, last_name, email, phone, status, source, notes, created_at)
VALUES
  ('Robert',   'Shelton III',  'conversation-robertsheltoniii-82vwx@indeedemail.com', NULL,         'applied', 'indeed', 'Qualifications: Driver''s License, US work auth. Applied 2026-05-31.',                  '2026-05-31T02:27:35Z'),
  ('Alwin',    'Jones',        'conversation-alwinjones-wryhu@indeedemail.com',        NULL,         'applied', 'indeed', 'Applied 2026-05-31. View full app on Indeed employer dashboard.',                    '2026-05-31T02:25:01Z'),
  ('Caitlin',  'McLeod',       'conversation-caitlinmcleod-fixid@indeedemail.com',     NULL,         'applied', 'indeed', 'Qualifications: US work auth, Leadership, Sales. STRONG FIT — sales background tagged.', '2026-05-31T01:21:10Z'),
  ('Fred',     'Havens',       'fredzhavens04@gmail.com',                              '7604739635', 'applied', 'indeed', 'Qualifications: US work auth. Background: Titan Fire & Life Safety (SD County deliveries), Legoland lifeguard 2 seasons. Proactive — wrote cover letter, provided direct contact.', '2026-05-31T00:54:55Z'),
  ('Manulito', 'Loman',        'conversation-manulitoloman-5j5yt@indeedemail.com',     NULL,         'applied', 'indeed', 'Applied 2026-05-31. View full app on Indeed employer dashboard.',                    '2026-05-31T00:27:50Z'),
  ('James',    'Dragoo',       'conversation-jamesdragoo-gojxf@indeedemail.com',       NULL,         'applied', 'indeed', 'Applied 2026-05-31. View full app on Indeed employer dashboard.',                    '2026-05-31T00:14:37Z'),
  ('Ivan',     'Yalda',        'conversation-ivanyalda-5bxs0@indeedemail.com',         NULL,         'applied', 'indeed', 'Applied 2026-05-31. View full app on Indeed employer dashboard.',                    '2026-05-31T00:06:12Z'),
  ('Ukiah',    'Dublinski',    'conversation-ukiahdublinski-5h3up@indeedemail.com',    NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T22:32:04Z'),
  ('Robert',   'Buller',       'conversation-robertbuller-3mmdi@indeedemail.com',      NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T16:03:57Z'),
  ('Brian',    'Jordan',       'conversation-brianjordan-4qky9@indeedemail.com',       NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T12:35:00Z'),
  ('Alana',    'Dixon',        'conversation-alanadixon-ms4q2@indeedemail.com',        NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T06:53:11Z'),
  ('Sarah',    'Glancy',       'conversation-sarahglancy-u7p0n@indeedemail.com',       NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T04:57:20Z'),
  ('Victor',   'Franchetti',   'conversation-victorfranchetti-8had6@indeedemail.com',  NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T04:05:01Z'),
  ('Michael',  'McGlone',      'conversation-michaelmcglone-55nlu@indeedemail.com',    NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T03:56:33Z'),
  ('Carson',   'Pugh',         'conversation-carsonpugh-0vi72@indeedemail.com',        NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T02:56:56Z'),
  ('Jaymark',  'Liedle',       'conversation-jaymarkliedle-lq60j@indeedemail.com',     NULL,         'applied', 'indeed', 'Applied 2026-05-30. View full app on Indeed employer dashboard.',                    '2026-05-30T00:48:58Z'),
  ('Brett',    'Banaszak',     'conversation-brettbanaszak-inoiz@indeedemail.com',     NULL,         'applied', 'indeed', 'Applied 2026-05-29. View full app on Indeed employer dashboard.',                    '2026-05-29T23:56:35Z')
ON CONFLICT DO NOTHING;
