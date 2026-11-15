-- Battery sale date (2026-11-15, per Dennis): when all documents are signed and sent to the Ops partner. Drives the S.U.N. Sales card.
alter table customers add column if not exists docs_sent_at timestamptz;
update customers set docs_sent_at = sold_at where sold_type = 'battery_retrofit' and sold_at is not null and docs_sent_at is null;
