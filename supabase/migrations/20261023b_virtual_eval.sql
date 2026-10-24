-- Virtual (self-service) evaluation: auto-flag leads 50+ miles from every Tech home base.
alter table customers add column if not exists eval_mode text;            -- 'local' | 'virtual' (null = not decided)
alter table customers add column if not exists eval_mode_manual boolean default false; -- true = admin override, never auto-changed
alter table customers add column if not exists eval_distance_mi numeric;
alter table team_members add column if not exists home_zip text;
alter table team_members add column if not exists home_lat numeric;
alter table team_members add column if not exists home_lng numeric;
update team_members set home_zip='92026', home_lat=33.1192, home_lng=-117.0864 where id='tech4';
update team_members set home_zip='92058', home_lat=33.1959, home_lng=-117.3795 where id='tech5';
