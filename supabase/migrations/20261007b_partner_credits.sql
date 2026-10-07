-- Ledger of credits held with Ops partners (e.g. Cosmic). + earned, - applied. Balance = sum(amount).
create table if not exists partner_credits (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null,
  amount numeric not null,
  kind text not null check (kind in ('earned','applied')),
  origin_customer_id uuid,
  applied_customer_id uuid,
  job_cost_id uuid,
  note text,
  created_at timestamptz not null default now()
);
alter table partner_credits enable row level security;
create policy "anon all partner_credits" on partner_credits for all to anon using (true) with check (true);
