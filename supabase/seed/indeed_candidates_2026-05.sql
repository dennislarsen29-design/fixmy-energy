-- Indeed applicants — "Solar Energy Consultant — Diagnostics & Battery Storage
-- Sales" (2 locations), applied 2026-05-29 through 2026-05-31 via Indeed. Pulled
-- from the 17 "[Action required] New application..." notification emails sitting
-- in info@fixmy.energy (all already-read, non-actionable until this import —
-- flagged during the 2026-07-17 briefing).
--
-- Direct network access to Supabase was blocked in this session (proxy policy
-- denial on kbtobyoumvbcxfbugsid.supabase.co), so this could not be inserted
-- live via MCP/REST — same blocker noted elsewhere in CLAUDE.md for other
-- pending migrations/seeds. Run this once in the Supabase SQL Editor (or via
-- MCP) to land it. Idempotent: skips any (first_name, last_name, source
-- 'indeed') pair that's already present, so re-running is safe.
--
-- Caveats: Indeed's notification email format does not surface an applicant's
-- real email or phone (their reply-to is a proxied conversation-*@indeedemail.com
-- alias) or a cover letter — only self-reported qualification checkboxes (e.g.
-- "Driver's License", "US work authorization", "Leadership", "Sales") and a
-- "View resume" link that requires logging into the Indeed employer dashboard
-- (not accessible from here). email/phone/city/zip/why_solar are left NULL;
-- the qualification badges are captured in `notes`. To reach a candidate or see
-- their resume, log into Indeed → Employers → this job posting → search by name.
--
-- created_at is backdated to the actual Indeed application timestamp so the
-- Hiring Pipeline sub-tab (Team & Hiring → Hiring Pipeline) sorts/reports them
-- correctly rather than showing them as freshly applied today.

insert into candidates (first_name, last_name, source, status, sales_experience, notes, created_at)
select v.first_name, v.last_name, 'indeed', 'applied', v.sales_experience, v.notes, v.applied_at
from (values
  ('Robert',   'Shelton III', null::text, 'Indeed qualifications: Driver''s License, US work authorization.', '2026-05-31T02:27:35Z'::timestamptz),
  ('Alwin',    'Jones',       'some',     'Indeed qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T02:25:01Z'::timestamptz),
  ('Caitlin',  'McLeod',      'some',     'Indeed qualifications: US work authorization, Leadership, Sales.', '2026-05-31T01:21:10Z'::timestamptz),
  ('Fred',     'Havens',      null,       'Indeed qualifications: US work authorization.', '2026-05-31T00:54:55Z'::timestamptz),
  ('Manulito', 'Loman',       'some',     'Indeed qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T00:27:50Z'::timestamptz),
  ('James',    'Dragoo',      'some',     'Indeed qualifications: Driver''s License, US work authorization, Sales.', '2026-05-31T00:14:37Z'::timestamptz),
  ('Ivan',     'Yalda',       'some',     'Indeed qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T00:06:12Z'::timestamptz),
  ('Ukiah',    'Dublinski',   'some',     'Indeed qualifications: US work authorization, Leadership, Sales.', '2026-05-30T22:32:04Z'::timestamptz),
  ('Robert',   'Buller',      'some',     'Indeed qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T16:03:57Z'::timestamptz),
  ('Brian',    'Jordan',      'some',     'Indeed qualifications: Driver''s License, US work authorization, Sales.', '2026-05-30T12:35:00Z'::timestamptz),
  ('Alana',    'Dixon',       'some',     'Indeed qualifications: US work authorization, Sales.', '2026-05-30T06:53:11Z'::timestamptz),
  ('Sarah',    'Glancy',      null,       'Indeed qualifications: US work authorization, Leadership.', '2026-05-30T04:57:20Z'::timestamptz),
  ('Victor',   'Franchetti',  'some',     'Indeed qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T04:05:01Z'::timestamptz),
  ('Michael',  'Mcglone',     null,       'Indeed qualifications: US work authorization.', '2026-05-30T03:56:33Z'::timestamptz),
  ('Carson',   'Pugh',        'some',     'Indeed qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T02:56:56Z'::timestamptz),
  ('Jaymark',  'Liedle',      null,       'Indeed qualifications: Driver''s License, US work authorization, Leadership.', '2026-05-30T00:48:58Z'::timestamptz),
  ('Brett',    'Banaszak',    'some',     'Indeed qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-29T23:56:35Z'::timestamptz)
) as v(first_name, last_name, sales_experience, notes, applied_at)
where not exists (
  select 1 from candidates c
  where c.first_name = v.first_name and c.last_name = v.last_name and c.source = 'indeed'
);
