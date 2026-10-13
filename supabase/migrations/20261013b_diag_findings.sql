-- Electrician's Diagnostic Findings (Ops portal form). Internal only, no prices.
alter table customers add column if not exists diag_findings jsonb;
