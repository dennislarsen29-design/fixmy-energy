-- Diagnostic outcome + follow-up tracking (2026-11-23, per Dennis — Cynthia Castillo warranty exchange).
-- { outcome: 'rma'|'repair'|'upgrade'|'nothing', set_at, set_by, rma_filed_at, part_arrived_at, swap_booked_at, work_done_at }
alter table customers add column if not exists dx_outcome jsonb;
