-- ═══ Agent report email digest — track which reports have been emailed ═══
-- (2026-07-23)
-- The daily digest (netlify/functions/agent-report-digest.js) emails every
-- agent_reports row that hasn't been sent yet, then stamps emailed_at so it
-- never re-sends. Using a marker column (rather than a time window) means a
-- missed/failed digest day still catches up — nothing is silently dropped.
alter table public.agent_reports add column if not exists emailed_at timestamptz;
