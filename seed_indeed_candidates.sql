-- Indeed Candidates — Applied May 29–31 2026
-- Solar Energy Consultant — Diagnostics & Battery Storage Sales
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/kbtobyoumvbcxfbugsid/sql
-- Safe to re-run: ON CONFLICT DO NOTHING skips duplicates

INSERT INTO candidates (first_name, last_name, email, status, source, sales_experience, notes)
VALUES
  ('Brett',    'Banaszak',    'conversation-brettbanaszak@indeedemail.com',    'applied', 'indeed', 'Yes', 'Applied May 29. Indeed badges: Driver''s License, US Work Authorization, Leadership, Sales.'),
  ('Jaymark',  'Liedle',      'conversation-jaymarkliedle@indeedemail.com',    'applied', 'indeed', 'No',  'Applied May 30. Indeed badges: Driver''s License, US Work Authorization, Leadership.'),
  ('Carson',   'Pugh',        'conversation-carsonpugh@indeedemail.com',       'applied', 'indeed', 'Yes', 'Applied May 30. Indeed badges: Driver''s License, US Work Authorization, Leadership, Sales.'),
  ('Michael',  'McGlone',     'conversation-michaelmcglone@indeedemail.com',   'applied', 'indeed', 'No',  'Applied May 30. Indeed badges: US Work Authorization only.'),
  ('Victor',   'Franchetti',  'conversation-victorfranchetti@indeedemail.com', 'applied', 'indeed', 'Yes', 'Applied May 30. Indeed badges: Driver''s License, US Work Authorization, Leadership, Sales.'),
  ('Sarah',    'Glancy',      'conversation-sarahglancy@indeedemail.com',      'applied', 'indeed', 'No',  'Applied May 30. Indeed badges: US Work Authorization, Leadership.'),
  ('Alana',    'Dixon',       'conversation-alanadixon@indeedemail.com',       'applied', 'indeed', 'Yes', 'Applied May 30. TOP CANDIDATE — Sales Manager at Krannich Solar (direct solar industry experience). Indeed badges: US Work Authorization, Sales. PRIORITY CONTACT.'),
  ('Brian',    'Jordan',      'conversation-brianjordan@indeedemail.com',      'applied', 'indeed', 'Yes', 'Applied May 30. Indeed badges: Driver''s License, US Work Authorization, Sales.'),
  ('Robert',   'Buller',      'conversation-robertbuller@indeedemail.com',     'applied', 'indeed', 'Yes', 'Applied May 30. Indeed badges: Driver''s License, US Work Authorization, Leadership, Sales.'),
  ('Ukiah',    'Dublinski',   'conversation-ukiahdublinski@indeedemail.com',   'applied', 'indeed', 'Yes', 'Applied May 30. Indeed badges: US Work Authorization, Leadership, Sales.'),
  ('Ivan',     'Yalda',       'conversation-ivanyalda@indeedemail.com',        'applied', 'indeed', 'Yes', 'Applied May 31. Indeed badges: Driver''s License, US Work Authorization, Leadership, Sales.'),
  ('James',    'Dragoo',      'conversation-jamesdragoo@indeedemail.com',      'applied', 'indeed', 'Yes', 'Applied May 31. TOP CANDIDATE — Sales Manager at HP, managed 250+ employees. Strong sales leadership background. Indeed badges: Driver''s License, US Work Authorization, Sales. PRIORITY CONTACT.'),
  ('Manulito', 'Loman',       'conversation-manulitoloman@indeedemail.com',    'applied', 'indeed', 'Yes', 'Applied May 31. Indeed badges: Driver''s License, US Work Authorization, Leadership, Sales.'),
  ('Fred',     'Havens',      'conversation-fredhavens@indeedemail.com',       'applied', 'indeed', 'No',  'Applied May 31. WEAK FIT — Background in fire/life safety delivery (Titan Fire) and lifeguard (Legoland). No sales or solar experience. Indeed badges: US Work Authorization only.'),
  ('Caitlin',  'McLeod',      'conversation-caitlinmcleod@indeedemail.com',    'applied', 'indeed', 'Yes', 'Applied May 31. Indeed badges: US Work Authorization, Leadership, Sales.'),
  ('Alwin',    'Jones',       'conversation-alwinjones@indeedemail.com',       'applied', 'indeed', 'Yes', 'Applied May 31. Indeed badges: Driver''s License, US Work Authorization, Leadership, Sales.'),
  ('Robert',   'Shelton',     'conversation-robertshelton@indeedemail.com',    'applied', 'indeed', 'No',  'Applied May 31. Full name: Robert Shelton III. Indeed badges: Driver''s License, US Work Authorization.')
ON CONFLICT (email) DO NOTHING;
