-- 2026-09-18, security fix (companion to netlify/functions/rep-onboard.js's new
-- approval gate). The anon_insert policy on candidates previously had no
-- restriction at all (check_expr = true), so the public anon key -- shipped
-- in plain sight in portal.html/careers.html -- could insert a candidates row
-- with status='hired' directly via a raw PostgREST call. rep-onboard.js's own
-- new gate checks for a status='hired' row before creating a team_members
-- account, so without this fix an attacker could self-insert a fake 'hired'
-- row for their own email and walk straight back through that gate. This
-- restricts anon INSERT to status='applied' (or NULL, which defaults to
-- 'applied') only -- matching exactly what careers-apply.js has always
-- inserted -- so status can only ever become 'hired' via a service-role
-- write (an admin action or rep-onboard.js's own post-creation mark-hired
-- step), never a public client.
drop policy if exists anon_insert on candidates;
create policy anon_insert on candidates
  for insert
  with check (status is null or status = 'applied');
