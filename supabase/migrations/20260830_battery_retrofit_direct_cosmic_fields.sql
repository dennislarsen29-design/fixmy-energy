-- Battery Retrofit deals now route straight through Cosmic (2026-08-30, per Dennis):
-- Cosmic collects the customer's payment directly and Solar Review carries no COGS, so
-- there's no real payments/job_costs data to sum for commission math on these jobs
-- anymore. Revenue (sold amount, before Participate) and Redline are flat manual dollar
-- fields instead — same "manual per-job field" pattern as Axia's PPW fields.
alter table customers add column if not exists br_revenue numeric;
alter table customers add column if not exists br_redline numeric;
