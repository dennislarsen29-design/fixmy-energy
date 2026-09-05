-- Lead-to-Agreements document engine (2026-09-05, per Dennis).
-- One row per (customer, document type). `data` snapshots the prefilled field values actually
-- used at soft-seed/sign time (so a later change to the customer record can't retroactively
-- alter what was shown/signed). `initials` is a jsonb map of {promptKey: true/false/"N/A"} for
-- documents with multiple per-line affirmations (e.g. the CPUC Guide's 12 statements).
create table if not exists deal_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  doc_type text not null,
  status text not null default 'pending', -- pending | reviewed | signed
  data jsonb not null default '{}'::jsonb,
  initials jsonb not null default '{}'::jsonb,
  signature text,
  signed_by_name text,
  signed_at timestamptz,
  reviewed_by_rep_id text,
  reviewed_by_rep_name text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, doc_type)
);
create index if not exists idx_deal_documents_customer on deal_documents(customer_id);

alter table customers add column if not exists sdge_account_number text;
alter table customers add column if not exists sdge_meter_number text;

alter table deal_documents enable row level security;
create policy "anon full access to deal_documents" on deal_documents
  for all using (true) with check (true);
