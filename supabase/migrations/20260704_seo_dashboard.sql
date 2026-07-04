-- ═══ SEO Dashboard — daily Search Console / GA4 metrics + query snapshots ═══
-- Run once in Supabase (SQL Editor or MCP apply_migration).
-- Populated by netlify/functions/seo-insights.js (daily schedule); analyzed by
-- seo-agent.js (weekly), which writes recommendations to agent_reports.
-- Portal reads these with the anon key (same trust model as customers).

create table if not exists public.seo_metrics (
  id                  uuid primary key default gen_random_uuid(),
  date                date not null unique,
  clicks              int,
  impressions         int,
  ctr                 numeric,       -- 0..1
  position            numeric,       -- average position
  ga_sessions         int,           -- all-channel sessions (GA4, optional)
  ga_organic_sessions int,           -- Organic Search channel sessions
  ga_conversions      int,           -- key events (GA4, optional)
  created_at          timestamptz not null default now()
);

create table if not exists public.seo_queries (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,           -- snapshot date (end of the 7-day window)
  dimension   text not null,           -- 'query' | 'page'
  key         text not null,           -- the query text or page URL
  clicks      int,
  impressions int,
  ctr         numeric,
  position    numeric,
  created_at  timestamptz not null default now(),
  unique (date, dimension, key)
);

create index if not exists seo_metrics_date_idx on public.seo_metrics (date desc);
create index if not exists seo_queries_snapshot_idx on public.seo_queries (date desc, dimension, clicks desc);

alter table public.seo_metrics enable row level security;
alter table public.seo_queries enable row level security;

-- Portal reads with the anon key; writes come from Netlify functions (service key bypasses RLS).
drop policy if exists "seo_metrics read" on public.seo_metrics;
create policy "seo_metrics read" on public.seo_metrics for select using (true);
drop policy if exists "seo_queries read" on public.seo_queries;
create policy "seo_queries read" on public.seo_queries for select using (true);
