-- Content engine (2026-11-23, per Dennis): weekly blog article + short posts for Google Business Profile,
-- Facebook, Instagram and Nextdoor. Quoya drafts; Dennis approves each item with one tap; approved items
-- publish at their scheduled time (content-publish). Nextdoor has no posting API: its text is marked
-- "copy ready" for Dennis to paste.
create table if not exists content_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  batch_week date,                    -- Monday of the week the batch was drafted for
  kind text not null,                 -- 'blog' | 'short'
  topic text,
  title text,                         -- blog title / short headline (used on the branded image)
  slug text,                          -- blog only: blog/<slug>.html
  meta_description text,              -- blog only
  body text,                          -- blog: article HTML (inner content); short: master text
  faq jsonb,                          -- blog: [{q,a}]
  channels jsonb not null default '{}'::jsonb,   -- short: {gbp:"…", facebook:"…", instagram:"…", nextdoor:"…"}
  image_url text,                     -- chosen public image URL
  image_source text,                  -- 'job_photo' | 'site' | 'branded' | null
  image_options jsonb,                -- [{url, source, label}]
  scheduled_for timestamptz,
  status text not null default 'draft',  -- draft | approved | published | partial | failed | rejected
  approved_at timestamptz,
  approved_by text,
  published_at timestamptz,
  results jsonb not null default '{}'::jsonb,    -- per channel: {status, detail, at}
  error text
);
create index if not exists content_posts_status_idx on content_posts (status, scheduled_for);
alter table content_posts enable row level security;
-- Same trust model as pr_targets / lead_activity: the admin portal reads and edits with the anon key.
drop policy if exists content_posts_anon_all on public.content_posts;
create policy content_posts_anon_all on public.content_posts for all to anon, authenticated using (true) with check (true);
