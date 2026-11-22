-- Digital PR & backlink outreach (Agents tab). Editorial outlets + public contacts, pitches, coverage and link checks.
create table if not exists public.pr_targets (
  id uuid primary key default gen_random_uuid(),
  outlet text not null,
  domain text not null,                 -- bare domain, lowercase, no www
  outlet_type text,                     -- news | local | trade | business | podcast | association | source_platform | other
  region text,
  url text,                             -- outlet homepage or the specific section/page
  why text,                             -- why this outlet fits us
  angle text,                           -- the timely story angle to pitch
  authority_note text,                  -- what the agent saw that shows editorial standards (no invented metrics)
  contact_name text,
  contact_role text,
  contact_email text,                   -- only publicly listed editorial/tips address
  contact_source_url text,              -- the public page where that contact is listed
  contact_verified boolean not null default false,  -- the email was found on contact_source_url by our own fetch
  contact_form_url text,
  status text not null default 'new',   -- new | approved | pitched | responded | published | declined | passed
  priority int not null default 3,      -- 1 best .. 5
  pitch_subject text,
  pitch_body text,
  sent_at timestamptz,
  followup_at timestamptz,
  response_at timestamptz,
  response_note text,
  source text not null default 'ai',    -- ai | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pr_targets_domain_contact_uq on public.pr_targets (domain, (coalesce(lower(contact_email), '')));
create index if not exists pr_targets_status_idx on public.pr_targets (status, priority);

create table if not exists public.pr_coverage (
  id uuid primary key default gen_random_uuid(),
  target_id uuid,
  article_url text not null unique,
  title text,
  published_on date,
  target_page text,                     -- the fixmy.energy URL we hoped they'd link to
  link_status text not null default 'unchecked',  -- unchecked | live | nofollow | mention_only | missing | unreachable
  link_rel text,
  anchor_text text,
  http_status int,
  last_checked_at timestamptz,
  first_live_at timestamptz,
  baseline_clicks int,                  -- Search Console snapshot of target_page when the article was logged
  baseline_impressions int,
  baseline_date date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.pr_targets enable row level security;
alter table public.pr_coverage enable row level security;
drop policy if exists pr_targets_anon_all on public.pr_targets;
create policy pr_targets_anon_all on public.pr_targets for all to anon, authenticated using (true) with check (true);
drop policy if exists pr_coverage_anon_all on public.pr_coverage;
create policy pr_coverage_anon_all on public.pr_coverage for all to anon, authenticated using (true) with check (true);
