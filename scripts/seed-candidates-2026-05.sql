-- Seed: 17 Indeed applicants (May 29-31, 2026) for Solar Energy Consultant posting
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/kbtobyoumvbcxfbugsid/sql
-- Safe to run multiple times (no duplicate check — skip if already inserted)

INSERT INTO candidates (first_name, last_name, email, phone, sales_experience, status, source, notes, why_solar, created_at) VALUES

-- Tier 1: Full qualifications (DL + US Auth + Leadership + Sales) — Priority interviews
('Alwin',    'Jones',      NULL, NULL, 'some',  'applied', 'indeed', 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.',          NULL, '2026-05-31 12:00:00+00'),
('Manulito', 'Loman',      NULL, NULL, 'some',  'applied', 'indeed', 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.',          NULL, '2026-05-31 12:00:00+00'),
('Ivan',     'Yalda',      NULL, NULL, 'some',  'applied', 'indeed', 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.',          NULL, '2026-05-31 12:00:00+00'),
('Robert',   'Buller',     NULL, NULL, 'some',  'applied', 'indeed', 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.',          NULL, '2026-05-30 12:00:00+00'),
('Victor',   'Franchetti', NULL, NULL, 'some',  'applied', 'indeed', 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.',          NULL, '2026-05-30 12:00:00+00'),
('Carson',   'Pugh',       NULL, NULL, 'some',  'applied', 'indeed', 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.',          NULL, '2026-05-30 12:00:00+00'),
('Brett',    'Banaszak',   NULL, NULL, 'some',  'applied', 'indeed', 'Tier 1 — All 4 qualifications: DL ✓ US Auth ✓ Leadership ✓ Sales ✓. Priority interview.',          NULL, '2026-05-29 12:00:00+00'),

-- Tier 2: Standout backgrounds — CALL THESE FIRST
('James',    'Dragoo',     NULL, NULL, '3plus', 'applied', 'indeed', 'CALL FIRST — HP Sales Manager, managed 250+ employees. DL ✓ US Auth ✓ Sales ✓.',                   'As a sales manager at Hewlett Packard I managed over 250 employees. I was in charge of hiring, training. Coaching and inventory management. I am excellent at prosecuting and closing sales.', '2026-05-31 12:00:00+00'),
('Alana',    'Dixon',      NULL, NULL, 'solar', 'applied', 'indeed', 'CALL FIRST — Sales Manager at Krannich Solar. Direct solar industry experience. US Auth ✓ Sales ✓.', 'Sales Manager at Krannich Solar — direct solar industry background.', '2026-05-30 12:00:00+00'),

-- Tier 3: Partial qualifications — consider
('Caitlin',  'McLeod',     NULL, NULL, 'some',  'applied', 'indeed', 'Tier 3 — US Auth ✓ Leadership ✓ Sales ✓. No Driver License listed.',                              NULL, '2026-05-31 12:00:00+00'),
('Ukiah',    'Dublinski',  NULL, NULL, 'some',  'applied', 'indeed', 'Tier 3 — US Auth ✓ Leadership ✓ Sales ✓. No Driver License listed.',                              NULL, '2026-05-30 12:00:00+00'),
('Brian',    'Jordan',     NULL, NULL, 'some',  'applied', 'indeed', 'Tier 3 — DL ✓ US Auth ✓ Sales ✓. No Leadership badge.',                                            NULL, '2026-05-30 12:00:00+00'),
('Sarah',    'Glancy',     NULL, NULL, 'none',  'applied', 'indeed', 'Tier 3 — US Auth ✓ Leadership ✓. No Sales or Driver License. Lower priority.',                    NULL, '2026-05-30 12:00:00+00'),
('Jaymark',  'Liedle',     NULL, NULL, 'none',  'applied', 'indeed', 'Tier 3 — DL ✓ US Auth ✓ Leadership ✓. No Sales badge. Lower priority.',                           NULL, '2026-05-30 12:00:00+00'),

-- Tier 4: Weak fits — pass
('Robert',   'Shelton',    NULL, NULL, 'none',  'applied', 'indeed', 'Tier 4 — DL ✓ US Auth ✓ only. No Sales or Leadership. Pass.',                                    NULL, '2026-05-31 12:00:00+00'),
('Michael',  'McGlone',    NULL, NULL, 'none',  'applied', 'indeed', 'Tier 4 — US Auth ✓ only. No Sales, Leadership, or DL. Pass.',                                     NULL, '2026-05-30 12:00:00+00'),
('Fred',     'Havens',     'fredzhavens04@gmail.com', '760-473-9635', 'none', 'applied', 'indeed', 'Tier 4 — US Auth ✓ only. Background: Titan Fire deliveries, Legoland lifeguard. Pass.', NULL, '2026-05-31 12:00:00+00');
