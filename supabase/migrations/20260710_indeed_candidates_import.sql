-- Imports the 17 Indeed applicants for "Solar Energy Consultant — Diagnostics &
-- Battery Storage Sales" (applied 2026-05-29 to 2026-05-31, never triaged) into
-- the candidates table so they show up in Admin -> Team & Hiring -> Hiring Pipeline.
-- Contact email is the Indeed conversation relay (works for replying via Indeed
-- Messaging); full resumes/real contact info require logging into the Indeed
-- employer account (employers.indeed.com) to view each application.
-- Idempotent: skips rows that already exist by email.

insert into candidates (first_name, last_name, email, phone, sales_experience, why_solar, status, source, notes, created_at)
select v.first_name, v.last_name, v.email, v.phone, v.sales_experience, v.why_solar, 'applied', 'indeed', v.notes, v.created_at
from (values
  ('Robert',   'Shelton III', 'conversation-robertsheltoniii-82vwx@indeedemail.com', null, null, null, 'Qualifications: Driver''s License, US work authorization.', '2026-05-31T02:27:35Z'::timestamptz),
  ('alwin',    'jones',       'conversation-alwinjones-wryhu@indeedemail.com',       null, null, null, 'Qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T02:25:01Z'::timestamptz),
  ('Caitlin',  'McLeod',      'conversation-caitlinmcleod-fixid@indeedemail.com',    null, null, null, 'Qualifications: US work authorization, Leadership, Sales.', '2026-05-31T01:21:10Z'::timestamptz),
  ('Fred',     'Havens',      'conversation-fredhavensiv-4mdd0@indeedemail.com',     '760-473-9635', null, null, 'Qualifications: US work authorization. Cover message: worked at Titan Fire & Life Safety (deliveries around San Diego County in a company truck); Legoland California lifeguard for two full summer seasons plus off-seasons. Alt contact: fredzhavens04@gmail.com.', '2026-05-30T23:54:55-01:00'::timestamptz),
  ('Manulito', 'Loman',       'conversation-manulitoloman-5j5yt@indeedemail.com',    null, null, null, 'Qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T00:27:50Z'::timestamptz),
  ('James',    'Dragoo',      'conversation-jamesdragoo-gojxf@indeedemail.com',      null, '3plus', null, 'Qualifications: Driver''s License, US work authorization, Sales. Cover message: "As a sales manager at Hewlett Packard I managed over 250 employees. I was in charge of hiring, training, coaching and inventory management. I am excellent at prospecting and closing sales." STRONG FIT — sales management background, large team, hiring/training experience.', '2026-05-31T00:14:37Z'::timestamptz),
  ('Ivan',     'Yalda',       'conversation-ivanyalda-5bxs0@indeedemail.com',        null, null, null, 'Qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T00:06:12Z'::timestamptz),
  ('Ukiah',    'Dublinski',   'conversation-ukiahdublinski-5h3up@indeedemail.com',   null, null, null, 'Qualifications: US work authorization, Leadership, Sales.', '2026-05-30T22:32:04Z'::timestamptz),
  ('Robert',   'Buller',      'conversation-robertbuller-3mmdi@indeedemail.com',     null, null, null, 'Qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T16:03:57Z'::timestamptz),
  ('Brian',    'Jordan',      'conversation-brianjordan-4qky9@indeedemail.com',      null, null, null, 'Qualifications: Driver''s License, US work authorization, Sales.', '2026-05-30T12:35:00Z'::timestamptz),
  ('Alana',    'Dixon',       'conversation-alanadixon-ms4q2@indeedemail.com',       null, 'solar', null, 'Relevant experience (per Indeed): Sales Manager at Krannich Solar. Qualifications: US work authorization, Sales. STRONG FIT — direct solar industry sales management experience.', '2026-05-30T06:53:11Z'::timestamptz),
  ('Sarah',    'Glancy',      'conversation-sarahglancy-u7p0n@indeedemail.com',      null, null, null, 'Qualifications: US work authorization, Leadership.', '2026-05-30T04:57:20Z'::timestamptz),
  ('Victor',   'Franchetti',  'conversation-victorfranchetti-8had6@indeedemail.com', null, null, null, 'Qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T04:05:01Z'::timestamptz),
  ('michael',  'mcglone',     'conversation-michaelmcglone-55nlu@indeedemail.com',   null, null, null, 'Qualifications: US work authorization.', '2026-05-30T03:56:33Z'::timestamptz),
  ('Carson',   'Pugh',        'conversation-carsonpugh-0vi72@indeedemail.com',       null, null, null, 'Qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T02:56:56Z'::timestamptz),
  ('Jaymark',  'Liedle',      'conversation-jaymarkliedle-lq60j@indeedemail.com',    null, null, null, 'Qualifications: Driver''s License, US work authorization, Leadership.', '2026-05-30T00:48:58Z'::timestamptz),
  ('Brett',    'Banaszak',    'conversation-brettbanaszak-inoiz@indeedemail.com',    null, null, null, 'Qualifications: Driver''s License, US work authorization, Leadership, Sales.', '2026-05-29T23:56:35Z'::timestamptz)
) as v(first_name, last_name, email, phone, sales_experience, why_solar, notes, created_at)
where not exists (
  select 1 from candidates c where c.email = v.email
);
