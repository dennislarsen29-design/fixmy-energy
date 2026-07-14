-- ═══ Personal finance (Bookkeeper + Financial Coach) — Dennis's private data ═══
-- Fully isolated from the business books (Solar Review Corp). These tables carry
-- personal net-worth / brokerage / spend data, which is more sensitive than lead
-- data, so unlike the rest of the portal they ship RLS-ENABLED WITH NO POLICIES:
-- the anon key (which lives in client JS) cannot read or write them at all. Every
-- access goes through the service-role Netlify gateway (personal-api.js /
-- personal-plaid-*.js), gated by PERSONAL_ACCESS_KEY. Never add an anon policy here.

create table if not exists public.personal_accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  type             text not null default 'checking',   -- checking|savings|credit|investment|loan|asset|other
  institution      text,
  plaid_item_id    text,
  plaid_account_id text,
  current_balance  numeric default 0,
  as_of            timestamptz default now(),
  created_at       timestamptz not null default now()
);

create table if not exists public.personal_transactions (
  id            uuid primary key default gen_random_uuid(),
  txn_date      date not null,
  description   text,
  merchant      text,
  amount        numeric not null,                       -- always stored positive; direction is `flow`
  flow          text not null default 'expense',        -- income|expense|transfer
  category      text,
  account_id    uuid references public.personal_accounts(id) on delete set null,
  dedupe_hash   text unique,
  review_status text not null default 'needs_review',   -- auto|needs_review|confirmed
  source        text not null default 'manual',         -- plaid|manual|csv
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists personal_txn_date_idx on public.personal_transactions (txn_date);
create index if not exists personal_txn_cat_idx  on public.personal_transactions (category);

create table if not exists public.personal_debts (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  type              text not null default 'credit_card', -- credit_card|auto|student|mortgage|personal|other
  balance           numeric default 0,
  apr               numeric,
  min_payment       numeric,
  payoff_target_date date,
  institution       text,
  linked_account_id uuid references public.personal_accounts(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table if not exists public.personal_holdings (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references public.personal_accounts(id) on delete cascade,
  symbol        text,
  name          text,
  quantity      numeric,
  cost_basis    numeric,
  current_price numeric,
  market_value  numeric,
  asset_class   text,                                    -- equity|etf|mutual_fund|bond|cash|crypto|other
  as_of         timestamptz default now(),
  source        text not null default 'manual',
  created_at    timestamptz not null default now()
);
create index if not exists personal_holdings_acct_idx on public.personal_holdings (account_id);

create table if not exists public.personal_budgets (
  id            uuid primary key default gen_random_uuid(),
  category      text unique not null,
  monthly_limit numeric not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.personal_categorization_rules (
  id         uuid primary key default gen_random_uuid(),
  pattern    text not null,
  category   text not null,
  hit_count  integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_net_worth_snapshots (
  id                uuid primary key default gen_random_uuid(),
  snap_date         date unique not null,
  total_assets      numeric not null default 0,
  total_liabilities numeric not null default 0,
  net_worth         numeric not null default 0,
  breakdown         jsonb,
  created_at        timestamptz not null default now()
);

-- Coach (Phase 3) — created now so the schema lands in one migration.
create table if not exists public.personal_profile (
  id                 text primary key default 'default',
  net_worth_baseline numeric,
  monthly_income     numeric,
  monthly_savings    numeric,
  risk_tolerance     text,
  skills             text,
  life_context       text,
  avoided_decisions  text,
  past_strategies    text,
  data               jsonb,          -- full structured onboarding answers
  onboarded          boolean default false,
  updated_at         timestamptz not null default now()
);

create table if not exists public.personal_vision_board (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  target_amount   numeric,
  target_date     date,
  linked_strategy text,
  quote           text,
  image_url       text,
  sort            integer default 0,
  created_at      timestamptz not null default now()
);

-- RLS on, NO policies → service-role only (anon key is fully denied). Deliberate.
alter table public.personal_accounts            enable row level security;
alter table public.personal_transactions        enable row level security;
alter table public.personal_debts               enable row level security;
alter table public.personal_holdings            enable row level security;
alter table public.personal_budgets             enable row level security;
alter table public.personal_categorization_rules enable row level security;
alter table public.personal_net_worth_snapshots enable row level security;
alter table public.personal_profile             enable row level security;
alter table public.personal_vision_board        enable row level security;
