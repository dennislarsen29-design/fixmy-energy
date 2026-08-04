-- Indeed applicants — "Solar Repair Appointment Setter — Phone, San Diego, CA"
-- 14 applications received 2026-08-01 (03:06–04:28 UTC), pulled from the
-- info@fixmy.energy "[Action required] New application..." Indeed emails.
--
-- Run in Supabase SQL Editor or via MCP (direct network access to Supabase
-- was blocked from the sandbox this was authored in — same limitation noted
-- elsewhere in this repo for other seed files).
--
-- Data limitation: Indeed's email only exposes the candidate's name, a relay
-- address (conversation-<name>-xxxx@indeedemail.com — NOT their real email;
-- real contact info requires logging into employers.indeed.com to view the
-- full application), and generic "Qualifications" tags. Two applicants
-- included freeform cover-letter/experience text; the rest did not — no
-- resume content is available without an Indeed login. `notes` records
-- exactly what was visible in each email plus a fit read where the content
-- supports one.
--
-- Idempotent: matches on (email, source) so re-running does not duplicate.

insert into candidates
  (first_name, last_name, email, position, sales_experience, status, source, notes, created_at)
select v.first_name, v.last_name, v.email, v.position, v.sales_experience, v.status, v.source, v.notes, v.created_at
from (values
  ('Melissa',  'Martinez',
   'conversation-melissamartinez-fm9jt@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, Telemarketing, English. No resume/cover letter text visible — full application requires Indeed login.',
   timestamptz '2026-08-01 04:28:11+00'),

  ('Ayla',     'White',
   'conversation-aylawhite-ks52g@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 04:25:15+00'),

  ('Mariah',   'Atkins',
   'conversation-mariahatkins-f0eqi@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, Telemarketing, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 04:22:42+00'),

  ('Fernando', 'Saucedo',
   'conversation-fernandosaucedo-mryi0@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, Telemarketing, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 04:18:47+00'),

  ('Jason',    'Reeder-Perry',
   'conversation-dqr56pg@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, Telemarketing, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 04:13:11+00'),

  ('Cesar Adrian', 'Contreras Aguilar',
   'conversation-cesaradriancontrerasag-nskgr@indeedemail.com', 'setter', 'none', 'applied', 'indeed',
   'Indeed-listed experience: "Inbound Stower, picking at Amazon Warehouse." Qualifications: Mobile devices, Telemarketing, English, Transcription. Warehouse background, not phone-sales — no direct appointment-setting/sales experience shown.',
   timestamptz '2026-08-01 03:59:00+00'),

  ('Cloretta', 'Banks',
   'conversation-clorettabanks-wx1rh@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, Telemarketing, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 03:58:51+00'),

  ('Dwayne',   'Beacham',
   'conversation-dwaynebeacham-0u51j@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, Telemarketing, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 03:43:37+00'),

  ('Hannah',   'Linn',
   'conversation-hannahlinn-drokg@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, Telemarketing, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 03:32:48+00'),

  ('Robert',   'Marquez',
   'conversation-robertmarquez-dvtn6@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, Telemarketing, English. No resume/cover letter text visible.',
   timestamptz '2026-08-01 03:27:52+00'),

  ('Dierra',   'White',
   'conversation-dierrawhite-waqo0@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 03:24:21+00'),

  ('Morgan',   'Anderson',
   'conversation-morgananderson-9vafs@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'Indeed qualifications: Mobile devices, English, Transcription. No resume/cover letter text visible.',
   timestamptz '2026-08-01 03:09:02+00'),

  ('Jose',     'Preciado',
   'conversation-josepreciado-9djv0@indeedemail.com', 'setter', 'solar', 'applied', 'indeed',
   'STRONG FIT — Indeed-listed experience: "Retail Sales Associate at Sunrun." Direct solar-industry sales background, unlike the rest of this batch. Qualifications: Mobile devices, Telemarketing, English. Recommend prioritizing for a screen.',
   timestamptz '2026-08-01 03:06:33+00'),

  ('David',    'McGruder',
   'conversation-davidmcgruder-b56gd@indeedemail.com', 'setter', 'some', 'applied', 'indeed',
   'WEAK FIT — attached cover letter is a generic form letter addressed to a "remote Reservation Agent position" (not this role — this is an in-office/phone Appointment Setter job, not remote) and signed with a different reply address (davidmcgruder.clientrep@gmail.com). Reads as a mass-application template, not tailored to Solar Review. 20+ years hospitality/sales background per the letter, but the mismatch is a real flag on genuine interest.',
   timestamptz '2026-08-01 02:35:39+00')
) as v(first_name, last_name, email, position, sales_experience, status, source, notes, created_at)
where not exists (
  select 1 from candidates c where c.email = v.email and c.source = 'indeed'
);
