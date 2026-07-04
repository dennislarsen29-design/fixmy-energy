-- ═══ Payments ledger — single source of accounting truth ═══
-- One row per transaction, regardless of rail (Sign & Pay Stripe, GHL invoice,
-- manual). Unique transaction ids make webhook + nightly-sweep double-delivery
-- land exactly once. Balance due = customers.invoice_amount - sum(payments).
-- Fed by: sign-complete.js, ghl-payment-sync.js, ghl-payments-reconcile-background.js,
-- and manual entry in the portal lead editor.

do $$
declare idtype text;
begin
  select data_type into idtype
    from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'id';

  if idtype is null then
    raise exception 'customers table not found';
  end if;

  execute format($f$
    create table if not exists public.payments (
      id                       uuid primary key default gen_random_uuid(),
      customer_id              %s references public.customers(id) on delete set null,
      amount                   numeric not null,
      currency                 text not null default 'usd',
      paid_at                  timestamptz not null default now(),
      method                   text,             -- card | ach | cash | check | other
      source                   text not null,    -- stripe_sign_page | ghl | manual
      stripe_payment_intent_id text unique,
      ghl_transaction_id       text unique,
      invoice_number           text,
      note                     text,
      recorded_by              text,             -- function name or admin
      created_at               timestamptz not null default now()
    )
  $f$, case when idtype = 'uuid' then 'uuid' when idtype = 'bigint' then 'bigint' else 'text' end);
end $$;

create index if not exists payments_customer_idx on public.payments (customer_id, paid_at desc);
create index if not exists payments_paid_at_idx on public.payments (paid_at desc);

alter table public.payments enable row level security;

-- Portal (anon key) reads and records manual payments — same trust model as customers.
drop policy if exists "payments read" on public.payments;
create policy "payments read" on public.payments for select using (true);
drop policy if exists "payments insert" on public.payments;
create policy "payments insert" on public.payments for insert with check (true);
