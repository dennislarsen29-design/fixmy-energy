-- "Save closing roles" (Team tab) writes pipeline_state key 'closers' from the browser; no policy allowed it,
-- so it failed with a row-level security error. Same narrow, key-scoped pattern as sun_snooze.
create policy closers_anon_insert on pipeline_state for insert to anon with check (key = 'closers');
create policy closers_anon_update on pipeline_state for update to anon using (key = 'closers') with check (key = 'closers');
