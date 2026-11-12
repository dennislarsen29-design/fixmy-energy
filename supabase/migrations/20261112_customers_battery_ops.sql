-- Second Ops partner on a job: assigned_ops = diagnostic/service partner, battery_ops = battery install partner.
alter table customers add column if not exists battery_ops text;
