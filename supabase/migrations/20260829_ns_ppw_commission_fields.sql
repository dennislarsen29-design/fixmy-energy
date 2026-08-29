-- Axia/QCell PPW commission formula (2026-08-29, per Dennis): Base PPW − (Redline −
-- Domestic Content Bonus) = Net PPW, × System Size (Watts) = Gross Commission. These
-- three fields are entered manually per job on the Axia/QCell accounting panel, the
-- same "manual per-job field" pattern as FixMy's editable Dealer Cost.
alter table customers add column if not exists ns_base_ppw numeric;
alter table customers add column if not exists ns_redline_ppw numeric;
alter table customers add column if not exists ns_dc_bonus_ppw numeric;
