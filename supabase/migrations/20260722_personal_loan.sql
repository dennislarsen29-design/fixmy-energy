-- Personal loan module (Cody & Casey Larsen → Dennis Larsen).
-- Same isolation model as the other personal_* tables: RLS enabled with NO policies,
-- so the client anon key is fully denied. All access goes through the service-role
-- Netlify gateway (loan-api.js). Signable contract + amortization ledger + lender view.

create table if not exists public.personal_loans (
  id             uuid primary key default gen_random_uuid(),
  lender_names   text not null,
  borrower       text not null,
  principal      numeric not null,
  apr            numeric not null,           -- annual %, e.g. 7
  term_months    integer not null,
  start_date     date,                       -- first payment period start
  monthly_payment numeric,                   -- computed amortized payment
  status         text not null default 'draft',   -- draft | signed | active | paid_off
  sign_token     text unique,                -- borrower e-signs via this token
  signature      text,                       -- typed signature
  signed_at      timestamptz,
  view_token     text unique,                -- read-only lender view token
  note           text,
  created_at     timestamptz not null default now()
);

create table if not exists public.personal_loan_payments (
  id                uuid primary key default gen_random_uuid(),
  loan_id           uuid not null references public.personal_loans(id) on delete cascade,
  paid_on           date not null,
  amount            numeric not null,
  principal_portion numeric,
  interest_portion  numeric,
  balance_after     numeric,
  is_extra          boolean not null default false,
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists personal_loan_payments_loan_idx on public.personal_loan_payments (loan_id, paid_on);

-- RLS on, NO policies → anon key denied; service role (loan-api.js) bypasses RLS.
alter table public.personal_loans enable row level security;
alter table public.personal_loan_payments enable row level security;

-- Seed the Cody & Casey → Dennis loan: 7% / $20,000 / 36 months.
-- Tokens are placeholders here — loan-api.js (re)issues real random tokens on first read,
-- or replace them below before running. Monthly payment ≈ $617.55.
insert into public.personal_loans
  (lender_names, borrower, principal, apr, term_months, start_date, monthly_payment, status, note)
select 'Cody & Casey Larsen', 'Dennis Larsen', 20000, 7, 36, current_date, 617.55, 'draft',
       'Personal loan — 7% APR, $20,000 over 36 months.'
where not exists (
  select 1 from public.personal_loans where borrower = 'Dennis Larsen' and lender_names = 'Cody & Casey Larsen'
);
