-- ═══ 1:1s Coaching Reports (2026-07-24) ═══
-- Backs the Team → 1:1s coaching view. The weekly coaching-agent.js reads AI call/knock
-- notes (lead_activity, 🎙 prefix) grouped by rep and files one row per rep here:
-- a coaching summary, winning/losing patterns, objection→rebuttal pairs, and per-rep
-- coaching flags. It ALSO writes a short org-wide summary to agent_reports (agent='coaching')
-- so it shows in the Agents inbox + daily email digest. quoya_kb holds the objection→rebuttal
-- export Dennis pastes into GHL's Quoya knowledge base.
-- Anon-read RLS like agent_reports (the portal reads with the anon key; the agent writes
-- with the service-role key).
create table if not exists public.coaching_reports (
  id             uuid primary key default gen_random_uuid(),
  rep_name       text,
  period         text,           -- e.g. '2026-07-20 → 2026-07-24'
  summary        text,           -- coaching narrative shown in the 1:1s view
  patterns       jsonb,          -- ["winning/losing pattern", ...]
  objections     jsonb,          -- [{ "objection": "...", "rebuttal": "..." }, ...]
  coaching_flags jsonb,          -- ["specific coaching action for this rep", ...]
  quoya_kb       text,           -- objection→rebuttal text formatted for the Quoya KB
  notes_analyzed int,
  created_at     timestamptz default now()
);

create index if not exists coaching_reports_rep_idx on public.coaching_reports (rep_name, created_at desc);

alter table public.coaching_reports enable row level security;
drop policy if exists "coaching_reports read" on public.coaching_reports;
create policy "coaching_reports read" on public.coaching_reports for select using (true);
drop policy if exists "coaching_reports insert" on public.coaching_reports;
create policy "coaching_reports insert" on public.coaching_reports for insert with check (true);
drop policy if exists "coaching_reports update" on public.coaching_reports;
create policy "coaching_reports update" on public.coaching_reports for update using (true);
