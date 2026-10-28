-- Ops partner notification checkboxes (2026-10-28). Null = nothing is sent (opt-in).
alter table team_members add column if not exists notify_prefs jsonb;
