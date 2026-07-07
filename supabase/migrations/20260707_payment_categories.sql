-- ═══ Payment categories — ledger mirrors the processor, math counts revenue ═══
-- Per Dennis 2026-07-07: never delete processor transactions (Stripe/GHL totals
-- must reconcile 1:1 with the ledger). Non-revenue rows are categorized instead
-- and excluded from revenue/balance/commission math.
--   revenue (default) | test | refund

alter table public.payments add column if not exists category text not null default 'revenue';

-- Recategorize the known $4.99 test transaction (no-op if it isn't there)
update public.payments
  set category = 'test',
      note = trim(coalesce(note,'') || ' [test transaction]')
  where amount = 4.99 and customer_id is null and category = 'revenue';

-- Portal needs to update categories with the anon key
drop policy if exists "payments update" on public.payments;
create policy "payments update" on public.payments for update using (true);
