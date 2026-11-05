-- SEO self-correction loop: every title/meta change the SEO agent proposes is tracked as an experiment.
-- proposed -> pr_opened -> applied (PR merged) -> measured (win/loss/inconclusive) | rejected (PR closed unmerged).
-- Service-role only (RLS on, no policies); written/read by netlify/functions/lib/seo-loop.js.
create table if not exists seo_experiments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  page_url text not null,
  file_path text,
  hypothesis text,
  old_title text, new_title text,
  old_meta text,  new_meta text,
  pr_url text, pr_number int,
  status text not null default 'pr_opened',
  baseline jsonb,            -- {date, clicks, impressions, ctr, position} from the latest page snapshot at proposal time
  applied_at timestamptz,
  measure_after timestamptz,
  result jsonb,              -- same shape, post-change
  verdict text,              -- win | loss | inconclusive
  lesson text,
  measured_at timestamptz
);
create index if not exists seo_experiments_page_idx on seo_experiments (page_url, created_at desc);
alter table seo_experiments enable row level security;
