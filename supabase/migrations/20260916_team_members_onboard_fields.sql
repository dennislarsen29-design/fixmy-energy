-- rep-onboard.js has always written market/role_type/source/ec_name/ec_phone on
-- the primary team_members insert, but none of these columns ever existed on the
-- live table -- every real onboarding has been silently falling through to the
-- function's own minimal-fields retry (id/name/email/code/role/active only),
-- losing market, role type, and emergency contact info with no visible error.
-- Non-destructive; existing rows land NULL.
alter table public.team_members add column if not exists market text;
alter table public.team_members add column if not exists role_type text;
alter table public.team_members add column if not exists source text;
alter table public.team_members add column if not exists ec_name text;
alter table public.team_members add column if not exists ec_phone text;
