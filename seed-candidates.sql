-- Indeed applicants from May 29–31 2026. Paste this into the Supabase SQL editor and run once.
-- All 17 candidates added with status='applied', source='indeed'

INSERT INTO candidates (first_name, last_name, status, source, sales_experience, phone, notes)
VALUES
  -- TOP PICKS
  ('James',    'Dragoo',      'applied', 'indeed', '3plus', NULL,           'DL ✓ | US Work Auth ✓ | Sales ✓ | Applied May 31. Cover: Former HP Sales Manager managing 250+ employees — hiring, training, coaching, inventory. Self-described as excellent at closing. STRONGEST cover letter of all applicants.'),
  ('Alana',    'Dixon',       'applied', 'indeed', 'solar', NULL,           'US Work Auth ✓ | Sales ✓ | Applied May 30. Relevant experience: Sales Manager at Krannich Solar. ONLY candidate with direct solar industry experience.'),

  -- FULL 4/4 QUALIFICATIONS (DL + US Work Auth + Leadership + Sales)
  ('Alwin',    'Jones',       'applied', 'indeed', 'some',  NULL,           'DL ✓ | US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 31. Full 4/4 qualifications. No cover message.'),
  ('Manulito', 'Loman',       'applied', 'indeed', 'some',  NULL,           'DL ✓ | US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 31. Full 4/4 qualifications. No cover message.'),
  ('Ivan',     'Yalda',       'applied', 'indeed', 'some',  NULL,           'DL ✓ | US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 31. Full 4/4 qualifications. No cover message.'),
  ('Robert',   'Buller',      'applied', 'indeed', 'some',  NULL,           'DL ✓ | US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 30. Full 4/4 qualifications. No cover message.'),
  ('Victor',   'Franchetti',  'applied', 'indeed', 'some',  NULL,           'DL ✓ | US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 30. Full 4/4 qualifications. No cover message.'),
  ('Carson',   'Pugh',        'applied', 'indeed', 'some',  NULL,           'DL ✓ | US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 30. Full 4/4 qualifications. No cover message.'),
  ('Brett',    'Banaszak',    'applied', 'indeed', 'some',  NULL,           'DL ✓ | US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 29. Full 4/4 qualifications. No cover message.'),

  -- 3/4 QUALIFICATIONS
  ('Brian',    'Jordan',      'applied', 'indeed', 'some',  NULL,           'DL ✓ | US Work Auth ✓ | Sales ✓ | Applied May 30. Missing Leadership tag. No cover message.'),
  ('Caitlin',  'McLeod',      'applied', 'indeed', 'some',  NULL,           'US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 31. No DL listed. No cover message.'),
  ('Ukiah',    'Dublinski',   'applied', 'indeed', 'some',  NULL,           'US Work Auth ✓ | Leadership ✓ | Sales ✓ | Applied May 30. No DL listed. No cover message.'),
  ('Jaymark',  'Liedle',      'applied', 'indeed', 'none',  NULL,           'DL ✓ | US Work Auth ✓ | Leadership ✓ | Applied May 30. No Sales tag. No cover message.'),

  -- 2/4 QUALIFICATIONS
  ('Robert',   'Shelton III', 'applied', 'indeed', 'none',  NULL,           'DL ✓ | US Work Auth ✓ | Applied May 31. No Leadership or Sales tags. No cover message.'),
  ('Sarah',    'Glancy',      'applied', 'indeed', 'none',  NULL,           'US Work Auth ✓ | Leadership ✓ | Applied May 30. No DL or Sales tags. No cover message.'),

  -- WEAK FIT
  ('Fred',     'Havens',      'applied', 'indeed', 'none',  '760-473-9635', 'US Work Auth ✓ only. Applied May 31. Background: Titan Fire deliveries (SD County), Legoland lifeguard. Weak fit for sales role.'),
  ('Michael',  'McGlone',     'applied', 'indeed', 'none',  NULL,           'US Work Auth ✓ only. Applied May 30. No other qualifications listed. Weak fit.');
