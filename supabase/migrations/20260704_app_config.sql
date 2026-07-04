-- ═══ app_config — server-side secrets/config too large for Netlify env vars ═══
-- AWS Lambda caps ALL env vars at 4KB per function; the Google service-account
-- JSON (~2.5KB) blew that budget. Functions read this table with the service
-- role key instead. RLS is enabled with NO policies: anon and authenticated
-- clients cannot read it — only the service role (which bypasses RLS).

create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
-- Deliberately no select/insert policies. Service role only.
