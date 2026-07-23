-- ═══ Include Financial Coach reports in the daily agent-report email digest ═══
-- (2026-07-23)
-- personal_coach_reports is a private service-role-only table (net-worth
-- specifics), kept out of the anon-readable business inbox. But Dennis wants
-- the Financial Coach's reports in his daily email too — it's his own data
-- going to his own inbox. agent-report-digest.js now reads this table as a
-- second source; this column lets it mark each coach report emailed exactly
-- once, same as agent_reports.
alter table public.personal_coach_reports add column if not exists emailed_at timestamptz;
