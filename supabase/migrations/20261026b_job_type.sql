-- 2026-10-26: optional explicit job type for the unified pipeline (type is derived when null).
alter table customers add column if not exists job_type text;
