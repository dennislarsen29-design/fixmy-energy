-- ═══ Setter Database — shift clock + 1:1 records (2026-08-03) ═══
-- Backs the Team → 1:1s per-setter profile view. Two additions:
--
--   rep_shifts        — the shift clock. A setter taps "Start Shift" in the Black Box
--                       Dialer and "End Shift" when done; one row per shift. Combined with
--                       lead_activity this yields hours worked, dials/hour, and idle gaps —
--                       the productivity picture a 1:1 actually needs.
--   one_on_one_notes  — the durable record of each 1:1 meeting (what was discussed, what
--                       was committed to). Previously 1:1s had AI coaching output but no
--                       place to record the conversation itself, so nothing carried forward
--                       week to week.
--
-- Per-call timing needs no migration: lead_activity.call_duration already exists (created
-- by 20260702_black_box_dialer.sql) and was simply never written to. The dialer now times
-- each call (Call tap → disposition) and populates it.
--
-- Anon-key RLS, same trust model as lead_activity / coaching_reports (the portal reads and
-- writes with the anon key; these are internal staff tables, not customer data).

-- ── Shift clock ────────────────────────────────────────────────────────────
create table if not exists public.rep_shifts (
  id         uuid primary key default gen_random_uuid(),
  rep_id     text,
  rep_name   text,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  source     text default 'dialer',   -- dialer | manual (admin correction)
  note       text,
  created_at timestamptz default now()
);

create index if not exists rep_shifts_rep_idx  on public.rep_shifts (rep_name, started_at desc);
-- Finding a rep's currently-open shift is the hot path (every dialer render checks it).
create index if not exists rep_shifts_open_idx on public.rep_shifts (rep_name) where ended_at is null;

alter table public.rep_shifts enable row level security;
drop policy if exists "rep_shifts read"   on public.rep_shifts;
create policy "rep_shifts read"   on public.rep_shifts for select using (true);
drop policy if exists "rep_shifts insert" on public.rep_shifts;
create policy "rep_shifts insert" on public.rep_shifts for insert with check (true);
drop policy if exists "rep_shifts update" on public.rep_shifts;
create policy "rep_shifts update" on public.rep_shifts for update using (true);

-- ── 1:1 meeting records ────────────────────────────────────────────────────
create table if not exists public.one_on_one_notes (
  id           uuid primary key default gen_random_uuid(),
  rep_id       text,
  rep_name     text,
  meeting_date date not null default current_date,
  notes        text,      -- what was discussed
  goals        text,      -- what they committed to before the next 1:1
  created_by   text,      -- admin who ran the meeting
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists one_on_one_rep_idx on public.one_on_one_notes (rep_name, meeting_date desc);

alter table public.one_on_one_notes enable row level security;
drop policy if exists "one_on_one read"   on public.one_on_one_notes;
create policy "one_on_one read"   on public.one_on_one_notes for select using (true);
drop policy if exists "one_on_one insert" on public.one_on_one_notes;
create policy "one_on_one insert" on public.one_on_one_notes for insert with check (true);
drop policy if exists "one_on_one update" on public.one_on_one_notes;
create policy "one_on_one update" on public.one_on_one_notes for update using (true);
drop policy if exists "one_on_one delete" on public.one_on_one_notes;
create policy "one_on_one delete" on public.one_on_one_notes for delete using (true);

-- ── Onboarding tracking on team_members ────────────────────────────────────
-- Non-destructive; existing rows land NULL which the portal renders as "not onboarded".
alter table public.team_members add column if not exists onboarded_at    timestamptz;
alter table public.team_members add column if not exists gusto_status    text;  -- null | sent | complete
alter table public.team_members add column if not exists gusto_sent_at   timestamptz;
alter table public.team_members add column if not exists start_date      date;
