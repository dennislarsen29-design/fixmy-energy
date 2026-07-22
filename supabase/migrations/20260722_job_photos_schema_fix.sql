-- ═══ Fix job_photos schema mismatch: legacy quoted "Path"/"Label" vs the
-- lowercase path/label every app code path actually writes to (2026-07-22) ═══
--
-- portal.html's uploadPhotos() / handleUpload() / loadJobPhotos() storage-fallback
-- all insert { path: ..., label: ... } (lowercase, unquoted). The live job_photos
-- table only has quoted mixed-case "Path"/"Label" columns — confirmed via a direct
-- INSERT test that fails outright with:
--   ERROR: column "path" of relation "job_photos" does not exist
-- Every DB-record save for an uploaded photo has therefore been failing at this
-- step: the file lands in Storage, Quoya even labels it client-side, but the
-- row insert to job_photos silently errors and the photo never actually saves.
-- This is very likely the real cause behind "uploads failing" reports — a
-- separate, more fundamental bug than the AI-call-blocking-the-upload issue
-- also being fixed alongside this (see 20260722_quoya_async_sync.sql).
--
-- Fix: rename the legacy columns to the lowercase names the app expects.
-- Non-destructive — any historical data in "Path"/"Label" is preserved under
-- the new names, just reachable by the column name the app already uses.
-- Wrapped in existence checks so it's safe to run more than once.

do $$
begin
  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'job_photos' and column_name = 'Path'
     )
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'job_photos' and column_name = 'path'
     )
  then
    alter table public.job_photos rename column "Path" to path;
  end if;

  if exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'job_photos' and column_name = 'Label'
     )
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'job_photos' and column_name = 'label'
     )
  then
    alter table public.job_photos rename column "Label" to label;
  end if;
end $$;
