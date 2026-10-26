-- 2026-10-26: "Ask for referral" close-out step on completed jobs (Jobs tab "Completed" rule).
alter table customers add column if not exists referral_asked_at timestamptz;
