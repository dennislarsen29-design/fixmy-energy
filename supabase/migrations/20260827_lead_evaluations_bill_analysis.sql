-- Quoya Assist bill analysis (2026-08-27, per Dennis): once a rep uploads the Utility
-- Bill during the Guided Solar Evaluation, Quoya reads it and fills in annual kWh
-- consumption, blended avg rate per kWh, CARE/FERA/Medical Baseline discount status,
-- and monthly/annual dollars paid. Stored alongside the existing hardware diagnosis on
-- the same lead_evaluations row (one row per lead, unique on customer_id already).
alter table lead_evaluations add column if not exists bill_analysis jsonb;
