-- ═══ Per-Ops-Partner Rate Sheets (2026-07-24) ═══
-- Each ops partner (installer) now carries their OWN dealer-cost rate sheet instead of one
-- shared "Cosmic" rate sheet visible to everyone. A partner sees only their own rates in the
-- Ops portal; the admin edits each partner's rates. rates is a jsonb map of { item_key: value }
-- overriding the canonical defaults (OPS_RATE_ITEMS in portal.html) — values are display
-- strings (e.g. "$12,500.00", "$2.19 / W", "Call admin"), since the sheet is a reference, not
-- a calculation input. One row per ops partner, keyed by ops id (ops1/ops2/ops3/ops4...).
-- Anon-key RLS consistent with the rest of the app (customers/job_costs); the Ops portal
-- fetches only its own row by ops_id, the admin editor writes it.
create table if not exists public.ops_rate_sheets (
  ops_id     text primary key,
  ops_name   text,
  rates      jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.ops_rate_sheets enable row level security;
drop policy if exists "ops_rate_sheets read" on public.ops_rate_sheets;
create policy "ops_rate_sheets read" on public.ops_rate_sheets for select using (true);
drop policy if exists "ops_rate_sheets insert" on public.ops_rate_sheets;
create policy "ops_rate_sheets insert" on public.ops_rate_sheets for insert with check (true);
drop policy if exists "ops_rate_sheets update" on public.ops_rate_sheets;
create policy "ops_rate_sheets update" on public.ops_rate_sheets for update using (true);
