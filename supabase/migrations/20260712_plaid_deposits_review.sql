-- ═══ Plaid deposit review queue — Top Tier / New Solar override revenue ═══
-- Plaid syncs both spend AND deposits from a connected checking account.
-- Deposits are NEVER auto-booked as revenue: FixMy/Solar Review customer
-- payments already flow through the payments table (GHL sweep + Sign & Pay),
-- so re-detecting those from the bank feed would risk double-counting.
--
-- BUT Top Tier and New Solar manager-override commissions (owed TO Solar
-- Review Corp, 1099 income) have no other automatic source — historically
-- entered manually per deal. Now that they direct-deposit, incoming bank
-- credits land here for a human to classify once, instead of being silently
-- discarded. Confirming inserts a row into `commissions`
-- (kind=override, payee=solar_review_corp) — the existing, already-wired
-- mechanism that feeds the Revenue tab and P&L Commission Income line.

create table if not exists public.plaid_deposits_review (
  id             uuid primary key default gen_random_uuid(),
  txn_date       date not null,
  description    text not null,
  merchant       text,
  amount         numeric not null,        -- positive — dollar amount of the deposit
  institution    text,
  plaid_item_id  text,
  dedupe_hash    text unique,
  status         text not null default 'needs_review',  -- needs_review | confirmed | ignored
  classification text,                    -- top_tier_override | new_solar_override | other
  commission_id  uuid references public.commissions(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists plaid_deposits_review_status_idx on public.plaid_deposits_review (status, txn_date desc);

alter table public.plaid_deposits_review enable row level security;

drop policy if exists "plaid_deposits_review read" on public.plaid_deposits_review;
create policy "plaid_deposits_review read" on public.plaid_deposits_review for select using (true);
drop policy if exists "plaid_deposits_review insert" on public.plaid_deposits_review;
create policy "plaid_deposits_review insert" on public.plaid_deposits_review for insert with check (true);
drop policy if exists "plaid_deposits_review update" on public.plaid_deposits_review;
create policy "plaid_deposits_review update" on public.plaid_deposits_review for update using (true);
drop policy if exists "plaid_deposits_review delete" on public.plaid_deposits_review;
create policy "plaid_deposits_review delete" on public.plaid_deposits_review for delete using (true);
