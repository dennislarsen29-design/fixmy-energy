-- ═══ Import 17 unactioned Indeed applicants into the Hiring pipeline ═══
-- All 17 applied 2026-05-29/31 for "Solar Energy Consultant — Diagnostics &
-- Battery Storage Sales" (2 locations) and sat untouched in the info@fixmy.energy
-- inbox for 5+ weeks — none were ever added to the candidates table.
--
-- IMPORTANT: Indeed's "New application" relay email does NOT include the
-- candidate's real email/phone/resume — only a name and a link into Indeed's
-- employer dashboard (login required). So email/phone/sales_experience/why_solar
-- are left NULL here. Before contacting anyone, open each candidate in Indeed
-- (employers.indeed.com → Candidates) to pull real contact info + resume,
-- then fill in email/phone via the Hiring Pipeline UI or a follow-up update.
--
-- ⚠️ Must be run manually in Supabase (SQL Editor or MCP) — not applied by the app.

insert into public.candidates (first_name, last_name, status, source, notes, created_at)
select v.first_name, v.last_name, 'applied', 'indeed', v.notes, v.created_at
from (values
  ('Robert',   'Shelton III',  'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-31T02:27:35Z'),
  ('Alwin',    'Jones',        'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-31T02:25:01Z'),
  ('Caitlin',  'McLeod',       'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-31T01:21:10Z'),
  ('Fred',     'Havens IV',    'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-31T00:54:55Z'),
  ('Manulito', 'Loman',        'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-31T00:27:50Z'),
  ('James',    'Dragoo',       'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-31T00:14:37Z'),
  ('Ivan',     'Yalda',        'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-31T00:06:12Z'),
  ('Ukiah',    'Dublinski',    'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T22:32:04Z'),
  ('Robert',   'Buller',       'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T16:03:57Z'),
  ('Brian',    'Jordan',       'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T12:35:00Z'),
  ('Alana',    'Dixon',        'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T06:53:11Z'),
  ('Sarah',    'Glancy',       'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T04:57:20Z'),
  ('Victor',   'Franchetti',   'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T04:05:01Z'),
  ('Michael',  'McGlone',      'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T03:56:33Z'),
  ('Carson',   'Pugh',         'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T02:56:56Z'),
  ('Jaymark',  'Liedle',       'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-30T00:48:58Z'),
  ('Brett',    'Banaszak',     'Applied via Indeed for Solar Energy Consultant — Diagnostics & Battery Storage Sales. No email/phone/resume in relay email — pull from Indeed employer dashboard.', timestamptz '2026-05-29T23:56:35Z')
) as v(first_name, last_name, notes, created_at)
where not exists (
  select 1 from public.candidates c
  where c.first_name = v.first_name and c.last_name = v.last_name and c.source = 'indeed'
);
