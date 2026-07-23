-- 17 Indeed applicants for "Solar Energy Consultant — Diagnostics & Battery Storage Sales"
-- Applied 2026-05-29 through 2026-05-31 (never triaged into the Hiring tab).
--
-- Source data is limited: Indeed's "New Application" notification emails only expose the
-- candidate's name, a masked conversation@indeedemail.com reply address, and a handful of
-- self-reported "Qualifications" screener badges (Driver's License / US work authorization /
-- Leadership / Sales). No real email, phone, city, or resume text is available without logging
-- into the Indeed employer dashboard — so email/phone/city/sales_experience/why_solar are left
-- NULL here. Dennis should open each candidate in Indeed to pull real contact info + resume
-- before reaching out; this seed just gets them onto the Hiring Pipeline board so they aren't
-- lost, with the qualification badges preserved in notes as a rough first-pass filter.
--
-- Ranked by badge match against the role (Driver's License + US work auth + Leadership + Sales
-- all present = closest fit on paper) — NOT a substitute for reading the actual resume.
--   Tier 1 (all 4 badges):      Alwin Jones, Manulito Loman, Ivan Yalda, Robert Buller,
--                                Victor Franchetti, Carson Pugh, Brett Banaszak
--   Tier 2 (Sales + 2 of 3):    James Dragoo, Ukiah Dublinski, Brian Jordan, Alana Dixon,
--                                Caitlin McLeod
--   Tier 3 (no Sales badge):    Robert Shelton III, Fred Havens, Sarah Glancy,
--                                Jaymark Liedle, michael mcglone
--
-- Idempotent: guards on existing (first_name, last_name, source='indeed') rows.

do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('Alwin',     'Jones',        'Driver''s License, US work authorization, Leadership, Sales', timestamptz '2026-05-31 02:25:01+00'),
      ('Manulito',  'Loman',        'Driver''s License, US work authorization, Leadership, Sales', timestamptz '2026-05-31 00:27:50+00'),
      ('Ivan',      'Yalda',        'Driver''s License, US work authorization, Leadership, Sales', timestamptz '2026-05-31 00:06:12+00'),
      ('Robert',    'Buller',       'Driver''s License, US work authorization, Leadership, Sales', timestamptz '2026-05-30 16:03:57+00'),
      ('Victor',    'Franchetti',   'Driver''s License, US work authorization, Leadership, Sales', timestamptz '2026-05-30 04:05:01+00'),
      ('Carson',    'Pugh',         'Driver''s License, US work authorization, Leadership, Sales', timestamptz '2026-05-30 02:56:56+00'),
      ('Brett',     'Banaszak',     'Driver''s License, US work authorization, Leadership, Sales', timestamptz '2026-05-29 23:56:35+00'),
      ('James',     'Dragoo',       'Driver''s License, US work authorization, Sales',              timestamptz '2026-05-31 00:14:37+00'),
      ('Ukiah',     'Dublinski',    'US work authorization, Leadership, Sales',                      timestamptz '2026-05-30 22:32:04+00'),
      ('Brian',     'Jordan',       'Driver''s License, US work authorization, Sales',              timestamptz '2026-05-30 12:35:00+00'),
      ('Alana',     'Dixon',        'US work authorization, Sales',                                  timestamptz '2026-05-30 06:53:11+00'),
      ('Caitlin',   'McLeod',       'US work authorization, Leadership, Sales',                      timestamptz '2026-05-31 01:21:10+00'),
      ('Robert',    'Shelton III',  'Driver''s License, US work authorization',                     timestamptz '2026-05-31 02:27:35+00'),
      ('Fred',      'Havens',       'US work authorization',                                         timestamptz '2026-05-30 00:54:55+00'),
      ('Sarah',     'Glancy',       'US work authorization, Leadership',                             timestamptz '2026-05-30 04:57:20+00'),
      ('Jaymark',   'Liedle',       'Driver''s License, US work authorization, Leadership',         timestamptz '2026-05-30 00:48:58+00'),
      ('michael',   'mcglone',      'US work authorization',                                         timestamptz '2026-05-30 03:56:33+00')
    ) as t(first_name, last_name, quals, applied_at)
  loop
    if not exists (
      select 1 from public.candidates
      where first_name = rec.first_name and last_name = rec.last_name and source = 'indeed'
    ) then
      insert into public.candidates
        (first_name, last_name, status, source, notes, created_at)
      values
        (rec.first_name, rec.last_name, 'applied', 'indeed',
         'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. '
         || 'Indeed screener qualifications: ' || rec.quals || '. '
         || 'Contact info/resume not in the email notification — open in Indeed employer dashboard to get real email/phone and resume before reaching out.',
         rec.applied_at);
    end if;
  end loop;
end $$;
