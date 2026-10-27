-- Newsletter list for leads that came in, did not transact, and went quiet (2026-10-27, per Dennis).
alter table customers add column if not exists newsletter_status text;      -- null | 'listed' | 'unsubscribed'
alter table customers add column if not exists newsletter_listed_at timestamptz;
create index if not exists customers_newsletter_status_idx on customers (newsletter_status) where newsletter_status is not null;
