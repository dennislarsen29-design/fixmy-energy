-- eval-analysis-background.js needs somewhere to write a failure reason (rate limit,
-- credit balance, upstream error) so the wizard can distinguish "still running" from
-- "genuinely failed" while polling, and so an admin can see the real cause.
alter table public.lead_evaluations add column if not exists error text;
