-- ═══ Solar Review Finance — operating expenses, chart of accounts, AI books ═══
-- Account names mirror the CPA's QuickBooks P&L (Jan–Apr 2026, cash basis)
-- EXACTLY, so exports hand off to the CPA with no translation. Do not rename
-- accounts here without renaming them in the CPA's books too.
--
-- Tables:
--   coa_accounts          — chart of accounts (income | cogs | expense, one level of sub-accounts via parent)
--   expense_transactions  — the operating-expense ledger (AmEx/bank statement lines + manual entries)
--   statement_uploads     — one row per uploaded statement file (audit trail)
--   categorization_rules  — merchant → account memory (QuickBooks-style "always categorize as")
--   mileage_entries       — vehicle mileage log (IRS standard-rate deduction, informational)

-- ── Chart of accounts ────────────────────────────────────────────────────────
create table if not exists public.coa_accounts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  type       text not null,               -- income | cogs | expense
  parent     text,                        -- parent account NAME (null = top-level)
  sort       int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Operating-expense ledger ────────────────────────────────────────────────
create table if not exists public.expense_transactions (
  id            uuid primary key default gen_random_uuid(),
  txn_date      date not null,
  description   text not null,            -- raw statement line
  merchant      text,                     -- normalized merchant name
  amount        numeric not null,         -- positive = expense, negative = credit/refund
  account_name  text,                     -- coa_accounts.name (null = uncategorized)
  source        text not null default 'manual',  -- amex_csv | bank_csv | pdf_ai | manual
  statement_id  uuid,
  dedupe_hash   text unique,              -- hash(date|amount|description|kind) — re-uploads land once
  review_status text not null default 'needs_review',  -- auto | confirmed | needs_review
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists expense_txn_date_idx on public.expense_transactions (txn_date desc);
create index if not exists expense_txn_account_idx on public.expense_transactions (account_name);

-- ── Statement upload audit trail ────────────────────────────────────────────
create table if not exists public.statement_uploads (
  id              uuid primary key default gen_random_uuid(),
  filename        text,
  kind            text,                   -- amex | bank
  format          text,                   -- csv | pdf
  period_start    date,
  period_end      date,
  txn_count       int default 0,          -- lines found in the file
  imported_count  int default 0,          -- new rows written
  duplicate_count int default 0,          -- skipped as already on the ledger
  uploaded_at     timestamptz not null default now()
);

-- ── Categorization rules (the system's memory) ──────────────────────────────
create table if not exists public.categorization_rules (
  id           uuid primary key default gen_random_uuid(),
  pattern      text not null,             -- case-insensitive substring matched against description
  account_name text not null,             -- coa_accounts.name
  priority     int  not null default 0,   -- higher wins; user rules ship at 100, seeds at 0
  hit_count    int  not null default 0,
  created_by   text not null default 'user',  -- user | ai | seed
  created_at   timestamptz not null default now()
);
create index if not exists cat_rules_pattern_idx on public.categorization_rules (lower(pattern));
create unique index if not exists cat_rules_unique_idx on public.categorization_rules (pattern, account_name);

-- ── Mileage log ─────────────────────────────────────────────────────────────
-- Standard-rate deduction (miles × rate) is informational for tax prep; it is
-- NOT added into the P&L (actual fuel/maintenance already books to Automobile
-- Expense — mixing the two would double-count).
create table if not exists public.mileage_entries (
  id         uuid primary key default gen_random_uuid(),
  trip_date  date not null,
  miles      numeric not null,
  purpose    text,
  rate       numeric not null default 0.70,   -- 2026 IRS standard mileage rate
  created_at timestamptz not null default now()
);

-- ── RLS — portal anon key, same trust model as customers/job_costs ──────────
alter table public.coa_accounts enable row level security;
alter table public.expense_transactions enable row level security;
alter table public.statement_uploads enable row level security;
alter table public.categorization_rules enable row level security;
alter table public.mileage_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['coa_accounts','expense_transactions','statement_uploads','categorization_rules','mileage_entries'] loop
    execute format('drop policy if exists "%1$s read" on public.%1$s',   t);
    execute format('create policy "%1$s read" on public.%1$s for select using (true)', t);
    execute format('drop policy if exists "%1$s insert" on public.%1$s', t);
    execute format('create policy "%1$s insert" on public.%1$s for insert with check (true)', t);
    execute format('drop policy if exists "%1$s update" on public.%1$s', t);
    execute format('create policy "%1$s update" on public.%1$s for update using (true)', t);
    execute format('drop policy if exists "%1$s delete" on public.%1$s', t);
    execute format('create policy "%1$s delete" on public.%1$s for delete using (true)', t);
  end loop;
end $$;

-- ═══ Seed: chart of accounts (CPA's QuickBooks P&L, Jan–Apr 2026) ═══════════
insert into public.coa_accounts (name, type, parent, sort) values
  -- Income
  ('Commission Income',            'income',  null, 10),
  -- COGS
  ('Incentives - Sales',           'cogs',    null, 20),
  ('Lead Generation',              'cogs',    null, 21),
  ('Subcontracted Services',       'cogs',    null, 22),
  -- Expenses
  ('Advertising and Promotion',    'expense', null, 30),
  ('Automobile Expense',           'expense', null, 31),
  ('Bank Service Charges',         'expense', null, 32),
  ('Computer and Internet Expenses','expense',null, 33),
  ('Dues and Subscriptions',       'expense', null, 34),
  ('Gifts - Client',               'expense', null, 35),
  ('Insurance Expense',            'expense', null, 36),
  ('Auto Insurance',               'expense', 'Insurance Expense', 37),
  ('Medical Insurance',            'expense', 'Insurance Expense', 38),
  ('Insurance Expense - Other',    'expense', 'Insurance Expense', 39),
  ('Meals and Entertainment',      'expense', null, 40),
  ('Office Supplies',              'expense', null, 41),
  ('Payroll Expense',              'expense', null, 42),
  ('Postage and Delivery',         'expense', null, 43),
  ('Professional Fees',            'expense', null, 44),
  ('Accounting',                   'expense', 'Professional Fees', 45),
  ('Legal Fees',                   'expense', 'Professional Fees', 46),
  ('Rent or Lease',                'expense', null, 47),
  ('Corporate Housing',            'expense', 'Rent or Lease', 48),
  ('Repairs and Maintenance',      'expense', null, 49),
  ('Tax and Licenses',             'expense', null, 50),
  ('Licenses and Permits',         'expense', 'Tax and Licenses', 51),
  ('Payroll Taxes',                'expense', 'Tax and Licenses', 52),
  ('Telephone Expense',            'expense', null, 53),
  ('Travel Expense',               'expense', null, 54),
  ('Lodging',                      'expense', 'Travel Expense', 55),
  ('Transportation',               'expense', 'Travel Expense', 56),
  ('Travel Meals & Entertainment', 'expense', 'Travel Expense', 57),
  ('Travel Expense - Other',       'expense', 'Travel Expense', 58),
  ('Utilities',                    'expense', null, 59)
on conflict (name) do nothing;

-- ═══ Seed: merchant heuristics (statement auto-categorization) ══════════════
-- Substring match, case-insensitive, against the raw description. Priority 0;
-- user-created rules land at 100 and always win.
insert into public.categorization_rules (pattern, account_name, created_by) values
  -- Fuel & vehicle
  ('SHELL',            'Automobile Expense', 'seed'),
  ('CHEVRON',          'Automobile Expense', 'seed'),
  ('ARCO',             'Automobile Expense', 'seed'),
  ('76 -',             'Automobile Expense', 'seed'),
  ('EXXON',            'Automobile Expense', 'seed'),
  ('MOBIL',            'Automobile Expense', 'seed'),
  ('COSTCO GAS',       'Automobile Expense', 'seed'),
  ('AUTOZONE',         'Automobile Expense', 'seed'),
  ('O''REILLY',        'Automobile Expense', 'seed'),
  ('JIFFY LUBE',       'Automobile Expense', 'seed'),
  ('CAR WASH',         'Automobile Expense', 'seed'),
  ('DMV',              'Licenses and Permits', 'seed'),
  -- Advertising & marketing
  ('GOOGLE ADS',       'Advertising and Promotion', 'seed'),
  ('GOOGLE*ADS',       'Advertising and Promotion', 'seed'),
  ('FACEBK',           'Advertising and Promotion', 'seed'),
  ('META PLATFORMS',   'Advertising and Promotion', 'seed'),
  ('MINUTEMAN PRESS',  'Advertising and Promotion', 'seed'),
  ('VISTAPRINT',       'Advertising and Promotion', 'seed'),
  ('YELP',             'Advertising and Promotion', 'seed'),
  -- Software / subscriptions / internet
  ('GODADDY',          'Computer and Internet Expenses', 'seed'),
  ('NETLIFY',          'Computer and Internet Expenses', 'seed'),
  ('SUPABASE',         'Computer and Internet Expenses', 'seed'),
  ('ANTHROPIC',        'Computer and Internet Expenses', 'seed'),
  ('OPENAI',           'Computer and Internet Expenses', 'seed'),
  ('SPECTRUM',         'Computer and Internet Expenses', 'seed'),
  ('COX COMM',         'Computer and Internet Expenses', 'seed'),
  ('HIGHLEVEL',        'Dues and Subscriptions', 'seed'),
  ('GOHIGHLEVEL',      'Dues and Subscriptions', 'seed'),
  ('LEADCONNECTOR',    'Dues and Subscriptions', 'seed'),
  ('ADOBE',            'Dues and Subscriptions', 'seed'),
  ('CANVA',            'Dues and Subscriptions', 'seed'),
  ('ZOOM.US',          'Dues and Subscriptions', 'seed'),
  ('DROPBOX',          'Dues and Subscriptions', 'seed'),
  ('AURORA SOLAR',     'Dues and Subscriptions', 'seed'),
  ('REGRID',           'Dues and Subscriptions', 'seed'),
  ('SMITH.AI',         'Dues and Subscriptions', 'seed'),
  -- Meals
  ('RESTAURANT',       'Meals and Entertainment', 'seed'),
  ('STARBUCKS',        'Meals and Entertainment', 'seed'),
  ('CHIPOTLE',         'Meals and Entertainment', 'seed'),
  ('DOORDASH',         'Meals and Entertainment', 'seed'),
  ('GRUBHUB',          'Meals and Entertainment', 'seed'),
  ('MCDONALD',         'Meals and Entertainment', 'seed'),
  ('IN-N-OUT',         'Meals and Entertainment', 'seed'),
  ('TACO',             'Meals and Entertainment', 'seed'),
  ('PIZZA',            'Meals and Entertainment', 'seed'),
  ('CAFE',             'Meals and Entertainment', 'seed'),
  -- Office / tools / shipping
  ('OFFICE DEPOT',     'Office Supplies', 'seed'),
  ('STAPLES',          'Office Supplies', 'seed'),
  ('HOME DEPOT',       'Office Supplies', 'seed'),
  ('LOWE''S',          'Office Supplies', 'seed'),
  ('HARBOR FREIGHT',   'Office Supplies', 'seed'),
  ('AMZN',             'Office Supplies', 'seed'),
  ('AMAZON',           'Office Supplies', 'seed'),
  ('USPS',             'Postage and Delivery', 'seed'),
  ('FEDEX',            'Postage and Delivery', 'seed'),
  ('UPS STORE',        'Postage and Delivery', 'seed'),
  -- Phone / utilities / travel / fees
  ('T-MOBILE',         'Telephone Expense', 'seed'),
  ('VERIZON',          'Telephone Expense', 'seed'),
  ('AT&T',             'Telephone Expense', 'seed'),
  ('SDG&E',            'Utilities', 'seed'),
  ('AIRLINES',         'Transportation', 'seed'),
  ('SOUTHWEST',        'Transportation', 'seed'),
  ('DELTA AIR',        'Transportation', 'seed'),
  ('UBER',             'Transportation', 'seed'),
  ('LYFT',             'Transportation', 'seed'),
  ('MARRIOTT',         'Lodging', 'seed'),
  ('HILTON',           'Lodging', 'seed'),
  ('AIRBNB',           'Lodging', 'seed'),
  ('ANNUAL FEE',       'Bank Service Charges', 'seed'),
  ('LATE FEE',         'Bank Service Charges', 'seed'),
  ('SERVICE CHARGE',   'Bank Service Charges', 'seed')
on conflict do nothing;
