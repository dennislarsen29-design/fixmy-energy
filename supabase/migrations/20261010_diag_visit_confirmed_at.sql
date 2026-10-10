-- Diagnostic jobs: the Cosmic visit date is only real once someone confirms it (the evaluation slot lives in the same diagnostic_date column).
alter table customers add column if not exists diag_visit_confirmed_at timestamptz;
