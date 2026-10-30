-- The S.U.N. queue saves snoozes/dismissals in pipeline_state key 'sun_snooze'. That table was read-only for the anon key, so every save failed silently.
create policy sun_snooze_anon_insert on pipeline_state for insert to anon with check (key = 'sun_snooze');
create policy sun_snooze_anon_update on pipeline_state for update to anon using (key = 'sun_snooze') with check (key = 'sun_snooze');
