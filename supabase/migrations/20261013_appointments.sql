-- One row per scheduled event (Solar Evaluation, Welcome Call, Diagnostic Visit, Install, ...) for FixMy and Axia/QCells.
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  event_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled',      -- scheduled | completed | canceled
  notes text,
  created_by text,
  notified_at timestamptz,
  notified_for text,                              -- 'scheduled|<iso>' of the last customer notice sent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_customer_idx on public.appointments(customer_id, starts_at);
alter table public.appointments enable row level security;
drop policy if exists appointments_anon_all on public.appointments;
create policy appointments_anon_all on public.appointments for all to anon, authenticated using (true) with check (true);
