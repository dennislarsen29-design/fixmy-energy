-- ═══ deposit_classification_rules — auto-classify recurring Plaid deposits ═══
-- Mirrors categorization_rules (expenses) on the deposit side. When Dennis
-- classifies a deposit and confirms "always classify deposits like this as X",
-- a rule is saved here. plaid-sync.js matches new deposits against these rules
-- at sync time and, on a hit, applies the classification immediately instead
-- of leaving the deposit in the Revenue review queue.

create table if not exists public.deposit_classification_rules (
  id             uuid primary key default gen_random_uuid(),
  pattern        text not null,        -- case-insensitive substring match against the deposit description
  classification text not null,        -- commission_top_tier | commission_new_solar | other_income | owner_transfer | ignore
  hit_count      int not null default 0,
  created_by     text not null default 'user',
  created_at     timestamptz not null default now()
);
create unique index if not exists deposit_classification_rules_uniq on public.deposit_classification_rules (pattern, classification);

alter table public.deposit_classification_rules enable row level security;
drop policy if exists "deposit_classification_rules read" on public.deposit_classification_rules;
create policy "deposit_classification_rules read" on public.deposit_classification_rules for select using (true);
drop policy if exists "deposit_classification_rules insert" on public.deposit_classification_rules;
create policy "deposit_classification_rules insert" on public.deposit_classification_rules for insert with check (true);
drop policy if exists "deposit_classification_rules update" on public.deposit_classification_rules;
create policy "deposit_classification_rules update" on public.deposit_classification_rules for update using (true);
drop policy if exists "deposit_classification_rules delete" on public.deposit_classification_rules;
create policy "deposit_classification_rules delete" on public.deposit_classification_rules for delete using (true);
