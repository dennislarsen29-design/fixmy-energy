-- ═══ Decouple Quoya AI photo categorization from upload (2026-07-22) ═══
-- Uploads were blocking on a synchronous Claude vision call per photo (quoyaAutoAssess /
-- quoyaAssessPhoto in portal.html), which made multi-photo uploads slow and prone to
-- failing outright on a single flaky AI call. Photos now save instantly with
-- quoya_status='pending'; categorization happens afterward via a manual "Sync with
-- Quoya" button (netlify/functions/quoya-sync.js, scoped to one lead) or the nightly
-- sweep (netlify/functions/quoya-sync-background.js, see netlify.toml).
--
-- ⚠️ Run 20260722_job_photos_schema_fix.sql FIRST (renames legacy "Label" → label).
-- This migration references the lowercase name and will error on `column "label"
-- does not exist` if the schema fix hasn't been applied yet.

-- Existing already-labeled rows are considered done; existing unlabeled rows (from
-- prior failed/partial uploads) are marked pending so the nightly sweep picks them up.
alter table public.job_photos add column if not exists quoya_status text not null default 'done';
alter table public.job_photos add column if not exists quoya_attempts int not null default 0;
alter table public.job_photos add column if not exists quoya_synced_at timestamptz;
-- Known target category at upload time (customer portal upload cards know this
-- up front — Utility Bill / Inverter / Main Panel — so labeling doesn't need to
-- wait on AI; Quoya only needs to do the quality check pass for those).
alter table public.job_photos add column if not exists expected_label text;

update public.job_photos
   set quoya_status = 'pending'
 where quoya_status = 'done'
   and (label is null or label = '');
