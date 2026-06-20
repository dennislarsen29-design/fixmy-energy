-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Inserts 17 Indeed applicants for "Solar Energy Consultant — Diagnostics & Battery Storage Sales"
-- Applied May 29–31, 2026

INSERT INTO candidates (first_name, last_name, email, phone, status, sales_experience, source, notes, created_at)
VALUES
  -- MAY 29
  ('Brett',    'Banaszak',   NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: Driver''s License, US work auth, Leadership, Sales. Applied May 29.',          '2026-05-29T00:00:00Z'),

  -- MAY 30
  ('Ukiah',    'Dublinski',  NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: US work auth, Leadership, Sales. No Driver''s License tag.',                   '2026-05-30T00:00:00Z'),
  ('Robert',   'Buller',     NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: Driver''s License, US work auth, Leadership, Sales.',                          '2026-05-30T01:00:00Z'),
  ('Brian',    'Jordan',     NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: Driver''s License, US work auth, Sales. No Leadership tag.',                   '2026-05-30T02:00:00Z'),
  ('Alana',    'Dixon',      NULL, NULL, 'applied', 'solar',  'indeed', 'TOP PICK — Sales Manager at Krannich Solar (direct solar industry experience). Indeed tags: US work auth, Sales. No Driver''s License tag.', '2026-05-30T03:00:00Z'),
  ('Sarah',    'Glancy',     NULL, NULL, 'applied', 'none',   'indeed', 'Indeed tags: US work auth, Leadership. No Sales tag.',                                      '2026-05-30T04:00:00Z'),
  ('Victor',   'Franchetti', NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: Driver''s License, US work auth, Leadership, Sales.',                          '2026-05-30T05:00:00Z'),
  ('Michael',  'McGlone',    NULL, NULL, 'applied', 'none',   'indeed', 'Indeed tags: US work auth only. Minimal qualifications.',                                   '2026-05-30T06:00:00Z'),
  ('Carson',   'Pugh',       NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: Driver''s License, US work auth, Leadership, Sales.',                          '2026-05-30T07:00:00Z'),
  ('Jaymark',  'Liedle',     NULL, NULL, 'applied', 'none',   'indeed', 'Indeed tags: Driver''s License, US work auth, Leadership. No Sales tag.',                   '2026-05-30T08:00:00Z'),

  -- MAY 31
  ('Robert',   'Shelton',    NULL, NULL, 'applied', 'none',   'indeed', 'Indeed tags: Driver''s License, US work auth only. No Sales or Leadership tag.',            '2026-05-31T00:00:00Z'),
  ('Alwin',    'Jones',      NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: Driver''s License, US work auth, Leadership, Sales.',                          '2026-05-31T01:00:00Z'),
  ('Caitlin',  'McLeod',     NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: US work auth, Leadership, Sales. No Driver''s License tag.',                   '2026-05-31T02:00:00Z'),
  ('Fred',     'Havens',     'fredzhavens04@gmail.com', '760-473-9635', 'applied', 'none', 'indeed', 'Indeed tags: US work auth only. Cover letter: delivery driver (Titan Fire & Life Safety) + lifeguard (Legoland). Entry-level, likely young applicant.',  '2026-05-31T03:00:00Z'),
  ('Manulito', 'Loman',      NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: Driver''s License, US work auth, Leadership, Sales.',                          '2026-05-31T04:00:00Z'),
  ('James',    'Dragoo',     NULL, NULL, 'applied', '3plus',  'indeed', 'TOP PICK — Sales Manager at Hewlett Packard managing 250+ employees (hiring, training, inventory). Indeed tags: Driver''s License, US work auth, Sales.',  '2026-05-31T05:00:00Z'),
  ('Ivan',     'Yalda',      NULL, NULL, 'applied', 'some',   'indeed', 'Indeed tags: Driver''s License, US work auth, Leadership, Sales.',                          '2026-05-31T06:00:00Z');
