-- Shared exits for both pipelines (Paused / Not interested / Dead) + gentle recapture state.
-- Purely additive; every existing step / solar_status value is untouched.
alter table customers add column if not exists disposition_exit text;        -- 'paused' | 'not_interested' | 'dead' | null
alter table customers add column if not exists pause_reason text;
alter table customers add column if not exists paused_until timestamptz;     -- when a Paused lead should come back
alter table customers add column if not exists recapture_next_at timestamptz; -- next touch due (null = none scheduled)
alter table customers add column if not exists recapture_touches int not null default 0;
alter table customers add column if not exists recapture_sensitive boolean not null default false; -- hardship/medical/family: tone-only, 2 touches max
alter table customers add column if not exists recapture_last_at timestamptz;
create index if not exists customers_recapture_due_idx on customers (recapture_next_at) where recapture_next_at is not null;
