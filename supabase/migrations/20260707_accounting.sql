-- ═══ Accounting rebuild — job costs (sub sheet) + commissions ═══
-- Per the 2026-07-07 SOPs in CLAUDE.md:
--   FixMy: rep commission = 40% of (collected revenue − job costs); none when
--          Dennis (tech4) sold. Costs are per-job line items, pending → paid.
--   Top Tier / New Solar: sold commissions entered manually per deal.
--   Overrides: income TO Solar Review Corp (1099 from providers) — tracked as
--          receivables (sold → paid means received).
--   Travel reimbursements: Top Tier only, owed to the rep.

do $$
declare idtype text;
begin
  select data_type into idtype
    from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'id';

  if idtype is null then
    raise exception 'customers table not found';
  end if;

  execute format($f$
    create table if not exists public.job_costs (
      id          uuid primary key default gen_random_uuid(),
      customer_id %1$s not null references public.customers(id) on delete cascade,
      label       text not null,            -- e.g. 'Cosmic payout', 'Equipment', 'Permit'
      amount      numeric not null,
      status      text not null default 'pending',  -- pending | paid
      paid_at     timestamptz,
      created_at  timestamptz not null default now(),
      created_by  text
    )
  $f$, case when idtype = 'uuid' then 'uuid' when idtype = 'bigint' then 'bigint' else 'text' end);

  execute format($f$
    create table if not exists public.commissions (
      id          uuid primary key default gen_random_uuid(),
      customer_id %1$s references public.customers(id) on delete set null,
      line        text not null,            -- fixmy | top_tier | new_solar
      kind        text not null,            -- rep_commission | override | travel_reimbursement
      payee       text not null,            -- rep_id (e.g. tech2) or 'solar_review_corp' for overrides
      payee_name  text,
      amount      numeric not null,
      status      text not null default 'sold',     -- sold | paid  (for overrides: paid = received)
      sold_at     timestamptz not null default now(),
      paid_at     timestamptz,
      note        text,
      created_at  timestamptz not null default now()
    )
  $f$, case when idtype = 'uuid' then 'uuid' when idtype = 'bigint' then 'bigint' else 'text' end);
end $$;

create index if not exists job_costs_customer_idx on public.job_costs (customer_id);
create index if not exists commissions_customer_idx on public.commissions (customer_id);
create index if not exists commissions_payee_idx on public.commissions (payee, status);

alter table public.job_costs enable row level security;
alter table public.commissions enable row level security;

-- Portal uses the anon key (same trust model as customers): read, add, update.
drop policy if exists "job_costs read" on public.job_costs;
create policy "job_costs read" on public.job_costs for select using (true);
drop policy if exists "job_costs insert" on public.job_costs;
create policy "job_costs insert" on public.job_costs for insert with check (true);
drop policy if exists "job_costs update" on public.job_costs;
create policy "job_costs update" on public.job_costs for update using (true);
drop policy if exists "job_costs delete" on public.job_costs;
create policy "job_costs delete" on public.job_costs for delete using (true);

drop policy if exists "commissions read" on public.commissions;
create policy "commissions read" on public.commissions for select using (true);
drop policy if exists "commissions insert" on public.commissions;
create policy "commissions insert" on public.commissions for insert with check (true);
drop policy if exists "commissions update" on public.commissions;
create policy "commissions update" on public.commissions for update using (true);
drop policy if exists "commissions delete" on public.commissions;
create policy "commissions delete" on public.commissions for delete using (true);
