-- Adds a position field to candidates so the careers page can capture which
-- role an applicant is applying for (Solar Energy Consultant vs. the new
-- Setter / Black Box Dialer role). Non-destructive — existing rows land
-- NULL, which the portal's Hiring Pipeline treats as "Consultant" (the only
-- role that existed before this migration).
alter table public.candidates add column if not exists position text;
