-- Referral program (2026-11-03, per Dennis): customers refer friends/family, paid over 3 levels once
-- Solar Review has collected cash on the referred customer's job. No existing column is changed.
alter table customers add column if not exists referral_code text;
create unique index if not exists customers_referral_code_uq on customers (referral_code) where referral_code is not null;
alter table customers add column if not exists referred_by_customer_id uuid;
create index if not exists customers_referred_by_cid on customers (referred_by_customer_id) where referred_by_customer_id is not null;
-- {status:'linked'|'needs_review'|'unmatched', raw:'what was typed', candidates:[ids], at:'...'}
alter table customers add column if not exists referral_match jsonb;

create table if not exists referral_payouts (
  id uuid primary key default gen_random_uuid(),
  referred_customer_id uuid not null,
  beneficiary_customer_id uuid not null,
  level int not null check (level between 1 and 3),
  tier text not null check (tier in ('service','battery','system')),
  amount numeric not null check (amount > 0),
  status text not null default 'owed' check (status in ('owed','paid','void')),
  earned_at timestamptz not null default now(),
  paid_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (referred_customer_id, beneficiary_customer_id, level, tier)
);
create index if not exists referral_payouts_ben on referral_payouts (beneficiary_customer_id);
create index if not exists referral_payouts_status on referral_payouts (status);
alter table referral_payouts enable row level security;
-- Same trust model as commissions: the portal reads/writes with the anon key.
drop policy if exists referral_payouts_anon_all on referral_payouts;
create policy referral_payouts_anon_all on referral_payouts for all to anon using (true) with check (true);
