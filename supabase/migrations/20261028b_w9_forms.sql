-- W-9 tax forms for team members (2026-10-28). The TIN lives ONLY inside data_enc (AES-256-GCM, server key).
-- RLS on with NO policies: the anon key is fully denied; only w9-api.js (service role) touches this table.
create table if not exists w9_forms (
  member_id text primary key,
  name text,
  tin_last4 text,
  data_enc text not null,
  audit jsonb,
  signed_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table w9_forms enable row level security;
alter table team_members add column if not exists w9_signed_at timestamptz;
