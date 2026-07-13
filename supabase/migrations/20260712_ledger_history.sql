-- ═══ ledger_history — prior-year (CPA) actuals folded into the live P&L ═══
-- Holds the CPA's authoritative per-account totals for closed years (2025 from
-- the ABMG General Ledger). Kept source-isolated so it never touches the live
-- 2026 payments/expense pipelines and is trivial to reconcile or remove.
-- finComputePnl() folds these into the P&L by account_name/type, respecting the
-- active timeline range. Values come straight from the CPA's printed account
-- totals, so they reconcile to the GL by construction.

create table if not exists public.ledger_history (
  id           uuid primary key default gen_random_uuid(),
  period_month date not null,                 -- 1st of the period (2025 imported as year-start = annual)
  account_name text not null,
  type         text not null,                 -- income | cogs | expense
  amount       numeric not null,
  source       text not null default 'cpa_gl_2025',
  note         text,
  created_at   timestamptz not null default now()
);
create unique index if not exists ledger_history_uniq on public.ledger_history (period_month, account_name, source);
create index if not exists ledger_history_period_idx on public.ledger_history (period_month);

alter table public.ledger_history enable row level security;
drop policy if exists "ledger_history read" on public.ledger_history;
create policy "ledger_history read" on public.ledger_history for select using (true);
drop policy if exists "ledger_history insert" on public.ledger_history;
create policy "ledger_history insert" on public.ledger_history for insert with check (true);
drop policy if exists "ledger_history update" on public.ledger_history;
create policy "ledger_history update" on public.ledger_history for update using (true);
drop policy if exists "ledger_history delete" on public.ledger_history;
create policy "ledger_history delete" on public.ledger_history for delete using (true);
