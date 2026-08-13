-- ═══ Campaign-source breakdown — which source/medium/campaign drives bookings ═══
-- Run once in Supabase (SQL Editor or MCP apply_migration).
-- Populated by netlify/functions/seo-insights.js (daily schedule) via a GA4 report
-- dimensioned by sessionSource/sessionMedium/sessionCampaignName. Snapshot pattern,
-- same as seo_queries: one row per (snapshot date, source, medium, campaign)
-- representing the trailing 30-day window, upserted daily.
--
-- Portal reads this with the anon key (same trust model as seo_metrics/seo_queries).
-- Degrades silently if unapplied — seo-insights.js already wraps every optional
-- write in try/catch, so a missing table here does not break the GSC/GA4 pull.

create table if not exists public.seo_campaigns (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,           -- snapshot date (end of the 30-day window)
  source      text not null,           -- GA4 sessionSource, e.g. 'google', '(direct)'
  medium      text not null,           -- GA4 sessionMedium, e.g. 'cpc', 'organic', '(none)'
  campaign    text not null,           -- GA4 sessionCampaignName, '(not set)' when absent
  sessions    int,
  key_events  int,                     -- schedule_appointment count for this source/medium/campaign
  created_at  timestamptz not null default now(),
  unique (date, source, medium, campaign)
);

create index if not exists seo_campaigns_snapshot_idx on public.seo_campaigns (date desc, key_events desc, sessions desc);

alter table public.seo_campaigns enable row level security;

drop policy if exists "seo_campaigns read" on public.seo_campaigns;
create policy "seo_campaigns read" on public.seo_campaigns for select using (true);
