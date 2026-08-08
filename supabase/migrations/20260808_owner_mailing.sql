-- Owner mailing address / absentee detection (2026-08-08)
--
-- Every Tracerfy trace already returns mail_address / mail_city / mail_state / mailing_zip
-- and we were discarding all four. When the owner's mailing address is NOT the property,
-- the owner doesn't live there — it's a rental or an absentee owner. That is worth knowing
-- BEFORE a rep knocks (it is the `renter` disposition, pre-empted) and it is a different
-- conversation entirely: an absentee owner is a landlord thinking about the asset, not a
-- homeowner thinking about their power bill.
--
-- Non-destructive: every column is nullable and nothing reads it until it is populated.

alter table public.customers add column if not exists mail_address text;
alter table public.customers add column if not exists mail_city    text;
alter table public.customers add column if not exists mail_state   text;
alter table public.customers add column if not exists mail_zip     text;

-- Derived at write time by the skip-trace apply paths (normalized street + zip compare),
-- stored so it can be counted and filtered in SQL rather than only in the browser.
--   true  = mailing address differs from the property  → rental / absentee owner
--   false = mail goes to the property                  → owner-occupied
--   null  = we have no mailing address to compare
alter table public.customers add column if not exists absentee boolean;

create index if not exists customers_absentee_idx on public.customers(absentee) where absentee is true;
