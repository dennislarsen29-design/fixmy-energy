-- ═══ Personal Coach reports — service-role only ═══
-- The personal Financial Coach's daily recommendations contain private net-worth
-- and account specifics, so unlike the business agent_reports (which the anon-key
-- Agents inbox reads) these live in their own table with RLS default-deny. Read
-- only through the service-role gateway (personal-api.js action coach_reports).

create table if not exists public.personal_coach_reports (
  id         uuid primary key default gen_random_uuid(),
  priority   text not null default 'normal',   -- urgent|high|normal
  title      text not null,
  body       text,
  reviewed   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists personal_coach_reports_created_idx on public.personal_coach_reports (created_at desc);

alter table public.personal_coach_reports enable row level security;  -- no policies → service-role only
