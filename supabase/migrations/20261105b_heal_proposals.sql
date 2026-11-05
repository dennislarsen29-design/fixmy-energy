-- Self-healing proposals (2026-11-05): detect -> propose -> Dennis approves -> allowlisted fix runs -> verified.
create table if not exists heal_proposals (
  id bigserial primary key,
  system text not null,            -- e.g. 'seo-sync', 'nightly-pipeline', 'agent:gbp'
  signature text not null,         -- detector id, stable per kind of problem
  problem text not null,           -- plain-language
  evidence jsonb default '{}'::jsonb,
  fix_kind text not null,          -- 'rerun' (allowlisted function) | 'manual' (only a person can fix)
  fix_label text,                  -- button text
  fix_detail text,                 -- what exactly will happen / what to do
  fix_target text,                 -- allowlisted function name (rerun)
  fix_query text,                  -- optional query string
  status text not null default 'proposed', -- proposed|running|verifying|healed|failed|rejected
  attempts int not null default 0,
  created_at timestamptz default now(),
  approved_at timestamptz,
  verify_after timestamptz,
  closed_at timestamptz,
  result text
);
create unique index if not exists heal_open_uniq on heal_proposals(system, signature) where status in ('proposed','running','verifying');
alter table heal_proposals enable row level security;
-- no policies: service-role only (portal reads/acts through heal-api)
