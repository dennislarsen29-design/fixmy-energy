-- Social Growth analytics — Instagram follower/reach tracking + per-post performance
-- Powers the Team tab → Social Growth sub-tab in portal.html.
-- Data written by netlify/functions/ig-insights.js (service key) and by
-- manual entry in the portal (anon key, same trust model as customers).

-- One row per day per platform. Manual entries and API syncs share the table;
-- source distinguishes them and API syncs overwrite manual rows for the same day.
create table if not exists public.social_metrics (
  id                  uuid primary key default gen_random_uuid(),
  captured_on         date not null,
  platform            text not null default 'instagram',
  followers           integer,
  following           integer,
  media_count         integer,
  reach_7d            integer,
  profile_views_7d    integer,
  website_clicks_7d   integer,
  source              text not null default 'manual',
  notes               text,
  created_at          timestamptz not null default now(),
  unique (captured_on, platform)
);

create table if not exists public.social_posts (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null default 'instagram',
  media_id        text not null unique,
  media_type      text,
  permalink       text,
  caption         text,
  posted_at       timestamptz,
  views           integer,
  reach           integer,
  likes           integer,
  comments        integer,
  saves           integer,
  shares          integer,
  last_synced_at  timestamptz default now(),
  created_at      timestamptz not null default now()
);

create index if not exists social_metrics_captured_on_idx on public.social_metrics (captured_on);
create index if not exists social_posts_posted_at_idx on public.social_posts (posted_at desc);

alter table public.social_metrics enable row level security;
alter table public.social_posts enable row level security;

-- Portal uses the anon key (same trust model as the customers table itself).
drop policy if exists "social_metrics read" on public.social_metrics;
create policy "social_metrics read" on public.social_metrics for select using (true);
drop policy if exists "social_metrics insert" on public.social_metrics;
create policy "social_metrics insert" on public.social_metrics for insert with check (true);
drop policy if exists "social_metrics update" on public.social_metrics;
create policy "social_metrics update" on public.social_metrics for update using (true);

drop policy if exists "social_posts read" on public.social_posts;
create policy "social_posts read" on public.social_posts for select using (true);
