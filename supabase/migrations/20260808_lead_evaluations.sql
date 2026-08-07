-- Guided Solar Evaluation (2026-08-08)
--
-- The on-site evaluation was a free-form photo dump plus a solar expert's judgement,
-- which is exactly what stops the closing role from scaling. This table carries the
-- stepped evaluation a non-expert rep walks through, and Quoya's analysis of it.
--
-- Same trust model as lead_activity / rep_shifts: anon-key RLS. Everything degrades
-- silently in the portal if this hasn't been applied — the wizard still uploads photos
-- (those live in job_photos) and still runs an analysis, it just can't resume one.

create table if not exists public.lead_evaluations (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null,
  rep_id             text,
  rep_name           text,

  -- Where the rep is in the flow. 'needs_input' = Quoya asked follow-up questions.
  status             text default 'in_progress',   -- in_progress | analyzing | needs_input | ready
  step               text default 'hardware',      -- hardware | production | consumption | analysis

  -- Structured hardware facts the rep confirms rather than Quoya guessing from pixels.
  inverter_brand     text,
  inverter_model     text,
  inverter_serial    text,
  monitoring_platform text,                        -- solaredge | enphase | none | other
  utility            text,                         -- sdge | sce | sdcp | other

  -- Slots the rep explicitly marked "not present" (no battery, no sub panel, …), so a
  -- skipped step reads as answered rather than missing.
  skipped            jsonb default '{}'::jsonb,
  -- Rep's answers to Quoya's follow-up question cards.
  answers            jsonb default '{}'::jsonb,
  -- Quoya's output: diagnosis, warranty, recommendation, talking points, proposal prefill.
  analysis           jsonb,
  -- Quoya's outstanding questions when it can't diagnose confidently yet.
  questions          jsonb,

  analyzed_at        timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- One live evaluation per lead — reopening the wizard resumes rather than forking.
create unique index if not exists lead_evaluations_customer_idx on public.lead_evaluations(customer_id);
create index if not exists lead_evaluations_status_idx on public.lead_evaluations(status);

alter table public.lead_evaluations enable row level security;

drop policy if exists anyone_select_lead_evaluations on public.lead_evaluations;
drop policy if exists anyone_insert_lead_evaluations on public.lead_evaluations;
drop policy if exists anyone_update_lead_evaluations on public.lead_evaluations;

create policy anyone_select_lead_evaluations on public.lead_evaluations for select using (true);
create policy anyone_insert_lead_evaluations on public.lead_evaluations for insert with check (true);
create policy anyone_update_lead_evaluations on public.lead_evaluations for update using (true) with check (true);
