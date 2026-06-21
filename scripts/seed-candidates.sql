-- Run this in Supabase → SQL Editor to load Indeed candidates into the Hiring tab
-- 17 applicants from May 29–31, 2026 for Solar Energy Consultant role

INSERT INTO candidates (first_name, last_name, status, source, sales_experience, created_at, notes) VALUES
  ('Brett',     'Banaszak',    'applied', 'indeed', 'some',  '2026-05-29T12:00:00Z', 'Indeed badges: Drivers License, US Work Auth, Leadership, Sales. All 4 qualification badges.'),
  ('Jaymark',   'Liedle',      'applied', 'indeed', 'none',  '2026-05-30T00:48:00Z', 'Indeed badges: Drivers License, US Work Auth, Leadership. Missing Sales badge.'),
  ('Carson',    'Pugh',        'applied', 'indeed', 'some',  '2026-05-30T02:56:00Z', 'Indeed badges: Drivers License, US Work Auth, Leadership, Sales. All 4 qualification badges.'),
  ('Michael',   'McGlone',     'applied', 'indeed', 'none',  '2026-05-30T03:56:00Z', 'Indeed badges: US Work Auth only. Entry-level profile — weak match.'),
  ('Victor',    'Franchetti',  'applied', 'indeed', 'some',  '2026-05-30T04:05:00Z', 'Indeed badges: Drivers License, US Work Auth, Leadership, Sales. All 4 qualification badges.'),
  ('Sarah',     'Glancy',      'applied', 'indeed', 'none',  '2026-05-30T04:57:00Z', 'Indeed badges: US Work Auth, Leadership. No Drivers License, no Sales badge.'),
  ('Alana',     'Dixon',       'applied', 'indeed', 'solar', '2026-05-30T06:53:00Z', 'Indeed badges: US Work Auth, Sales. PRIORITY: Sales Manager at Krannich Solar — direct solar industry experience. Strong candidate despite missing Drivers License badge.'),
  ('Brian',     'Jordan',      'applied', 'indeed', 'some',  '2026-05-30T12:35:00Z', 'Indeed badges: Drivers License, US Work Auth, Sales. Missing Leadership badge.'),
  ('Robert',    'Buller',      'applied', 'indeed', 'some',  '2026-05-30T14:00:00Z', 'Indeed badges: Drivers License, US Work Auth, Leadership, Sales. All 4 qualification badges.'),
  ('Ukiah',     'Dublinski',   'applied', 'indeed', 'some',  '2026-05-30T16:00:00Z', 'Indeed badges: US Work Auth, Leadership, Sales. Strong — missing Drivers License only.'),
  ('Ivan',      'Yalda',       'applied', 'indeed', 'some',  '2026-05-31T08:00:00Z', 'Indeed badges: Drivers License, US Work Auth, Leadership, Sales. All 4 qualification badges.'),
  ('James',     'Dragoo',      'applied', 'indeed', '3plus', '2026-05-31T09:00:00Z', 'Indeed badges: Drivers License, US Work Auth, Sales. PRIORITY: Former HP Sales Manager, managed 250+ employees. Top candidate — extensive senior sales leadership background.'),
  ('Manulito',  'Loman',       'applied', 'indeed', 'some',  '2026-05-31T10:00:00Z', 'Indeed badges: Drivers License, US Work Auth, Leadership, Sales. All 4 qualification badges.'),
  ('Fred',      'Havens',      'applied', 'indeed', 'none',  '2026-05-31T11:00:00Z', 'Indeed badges: US Work Auth only. Background: delivery driver + Legoland lifeguard. Weak match — pass.'),
  ('Caitlin',   'McLeod',      'applied', 'indeed', 'some',  '2026-05-31T12:00:00Z', 'Indeed badges: US Work Auth, Leadership, Sales. Strong — missing Drivers License only.'),
  ('Alwin',     'Jones',       'applied', 'indeed', 'some',  '2026-05-31T13:00:00Z', 'Indeed badges: Drivers License, US Work Auth, Leadership, Sales. All 4 qualification badges.'),
  ('Robert',    'Shelton III', 'applied', 'indeed', 'none',  '2026-05-31T14:00:00Z', 'Indeed badges: Drivers License, US Work Auth. Missing Leadership and Sales badges. Weaker profile.');
