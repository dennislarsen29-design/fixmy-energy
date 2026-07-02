-- ═══ Black Box Dialer — shared activity log + dialer queue state ═══
-- Run once in Supabase (SQL Editor or MCP apply_migration).
-- lead_activity is the structured two-way activity log shared by phone setters
-- (dialer) and door knockers. customers.notes remains the human-readable feed;
-- every dialer/knock event writes to BOTH so all existing views stay in sync.

-- customer_id must match customers.id's type (uuid or bigint) — detect at run time.
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
    create table if not exists public.lead_activity (
      id            uuid primary key default gen_random_uuid(),
      customer_id   %s not null references public.customers(id) on delete cascade,
      created_at    timestamptz not null default now(),
      channel       text not null default 'note',   -- 'dialer' | 'door_knock' | 'note'
      outcome       text,                            -- no_answer | left_vm | callback | warm | booked | not_interested | dnc | wrong_number | not_home | interested | already_customer
      note          text,
      rep_id        text,
      rep_name      text,
      callback_at   timestamptz,
      call_duration int,
      recording_url text
    )
  $f$, case when idtype = 'uuid' then 'uuid' when idtype = 'bigint' then 'bigint' else 'text' end);
end $$;

create index if not exists lead_activity_customer_idx on public.lead_activity (customer_id, created_at desc);
create index if not exists lead_activity_callback_idx on public.lead_activity (callback_at) where callback_at is not null;

alter table public.lead_activity enable row level security;

-- Portal uses the anon key (same trust model as the customers table itself).
drop policy if exists "lead_activity read" on public.lead_activity;
create policy "lead_activity read" on public.lead_activity for select using (true);
drop policy if exists "lead_activity insert" on public.lead_activity;
create policy "lead_activity insert" on public.lead_activity for insert with check (true);

-- Dialer queue state on customers (mirrors the knock_status / knocked_at pattern)
alter table public.customers add column if not exists dial_status   text;
alter table public.customers add column if not exists dialed_at     timestamptz;
alter table public.customers add column if not exists dial_attempts int default 0;
alter table public.customers add column if not exists callback_at   timestamptz;
