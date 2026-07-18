-- Indeed applicants for "Solar Energy Consultant — Diagnostics & Battery Storage
-- Sales" (17 candidates, applied 2026-05-29 to 2026-05-31, sitting unread/
-- unprocessed in the info@fixmy.energy inbox) — imported into the Hiring
-- Pipeline (`candidates` table, Team & Hiring tab) so they show up alongside
-- careers-page applicants instead of only living in Gmail.
--
-- Run in the Supabase SQL Editor or via MCP (direct DB write wasn't available
-- in the build session — no Supabase MCP connected). Idempotent: guarded by
-- NOT EXISTS on email so re-running won't duplicate rows.
--
-- Email = the candidate's Indeed relay address (conversation-xxx@indeedemail.com)
-- — replying to it (or from the Hiring card's mailto: link) delivers through
-- Indeed Messaging to the real applicant, same as replying in the Indeed inbox.
--
-- Fit notes for Dennis (from what's visible in the notification emails —
-- full resumes/messages require opening each application in Indeed):
--   * Alana Dixon — "Sales Manager at Krannich Solar" per Indeed's relevant-
--     experience line. Direct solar-industry sales management background —
--     best fit of the batch for this role.
--   * James Dragoo — cover message: sales manager at Hewlett Packard, managed
--     250 employees, hiring/training/coaching/inventory management, describes
--     himself as strong at "prosecuting and closing sales." Strong general
--     sales-leadership background, no solar experience stated.
--   * Fred Havens — cover message: Titan Fire & Life Safety (deliveries around
--     San Diego County), Legoland California lifeguard (2 seasons + off-season,
--     guest-facing). No sales background stated; gave direct contact info
--     (760-473-9635, fredzhavens04@gmail.com) in the message.
--   * The remaining 14 only carry Indeed's auto-tagged qualification badges
--     (Driver's License / US work authorization / Leadership / Sales) with no
--     further detail in the notification email — reviewing them meaningfully
--     needs the full application/resume open in Indeed's employer portal.

insert into candidates (first_name, last_name, email, status, source, sales_experience, why_solar, notes, created_at)
select * from (values
  ('Robert', 'Shelton III', 'conversation-robertsheltoniii-82vwx@indeedemail.com', 'applied', 'indeed', null::text, null::text, 'Qualifications (Indeed): Driver''s License, US work authorization.', '2026-05-31T02:27:35Z'::timestamptz),
  ('Alwin', 'Jones', 'conversation-alwinjones-wryhu@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T02:25:01Z'),
  ('Caitlin', 'McLeod', 'conversation-caitlinmcleod-fixid@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): US work authorization, Leadership, Sales.', '2026-05-31T01:21:10Z'),
  ('Fred', 'Havens', 'conversation-fredhavensiv-4mdd0@indeedemail.com', 'applied', 'indeed', 'none', null, 'Qualifications (Indeed): US work authorization. Cover message: "I have most notably been employed at Titan Fire & Life Safety, where I worked and thrived in a fast-paced work space, where I executed deliveries around San Diego County and beyond in a company truck. I have also worked at Legoland California as a lifeguard for two full summer seasons plus off-seasons... consult guests and deliver a quality experience." Direct contact given: 760-473-9635 / fredzhavens04@gmail.com.', '2026-05-31T00:54:55Z'),
  ('Manulito', 'Loman', 'conversation-manulitoloman-5j5yt@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T00:27:50Z'),
  ('James', 'Dragoo', 'conversation-jamesdragoo-gojxf@indeedemail.com', 'applied', 'indeed', '3plus', null, 'Qualifications (Indeed): Driver''s License, US work authorization, Sales. Cover message: "As a sales manager at Hewlett Packard I managed over 250 employees. I was in charge of hiring, training. Coaching and inventory management. I am excellent at prosecuting and closing sales."', '2026-05-31T00:14:37Z'),
  ('Ivan', 'Yalda', 'conversation-ivanyalda-5bxs0@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Leadership, Sales.', '2026-05-31T00:06:12Z'),
  ('Ukiah', 'Dublinski', 'conversation-ukiahdublinski-5h3up@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): US work authorization, Leadership, Sales.', '2026-05-30T22:32:04Z'),
  ('Robert', 'Buller', 'conversation-robertbuller-3mmdi@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T16:03:57Z'),
  ('Brian', 'Jordan', 'conversation-brianjordan-4qky9@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Sales.', '2026-05-30T12:35:00Z'),
  ('Alana', 'Dixon', 'conversation-alanadixon-ms4q2@indeedemail.com', 'applied', 'indeed', 'solar', null, 'Indeed relevant-experience line: "Sales Manager at Krannich Solar." Qualifications: US work authorization, Sales. Best solar-industry fit in this batch.', '2026-05-30T06:53:11Z'),
  ('Sarah', 'Glancy', 'conversation-sarahglancy-u7p0n@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): US work authorization, Leadership.', '2026-05-30T04:57:20Z'),
  ('Victor', 'Franchetti', 'conversation-victorfranchetti-8had6@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T04:05:01Z'),
  ('Michael', 'McGlone', 'conversation-michaelmcglone-55nlu@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): US work authorization only.', '2026-05-30T03:56:33Z'),
  ('Carson', 'Pugh', 'conversation-carsonpugh-0vi72@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Leadership, Sales.', '2026-05-30T02:56:56Z'),
  ('Jaymark', 'Liedle', 'conversation-jaymarkliedle-lq60j@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Leadership.', '2026-05-30T00:48:58Z'),
  ('Brett', 'Banaszak', 'conversation-brettbanaszak-inoiz@indeedemail.com', 'applied', 'indeed', null, null, 'Qualifications (Indeed): Driver''s License, US work authorization, Leadership, Sales.', '2026-05-29T23:56:35Z')
) as v(first_name, last_name, email, status, source, sales_experience, why_solar, notes, created_at)
where not exists (
  select 1 from candidates c where c.email = v.email
);
