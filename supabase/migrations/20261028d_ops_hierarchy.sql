-- Ops company hierarchy (design-ahead, nothing reads these yet).
-- A person row with parent_ops_id set is an electrician/member UNDER that company's owner row
-- (e.g. Hector = owner row; his electricians point at his id). Notifications and logins will use this later.
alter table team_members add column if not exists parent_ops_id text;
alter table team_members add column if not exists org_role text;  -- 'owner' | 'electrician'
create index if not exists team_members_parent_ops_idx on team_members(parent_ops_id);
