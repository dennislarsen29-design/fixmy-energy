-- Ad-attribution columns for the customers table.
-- Captured client-side on index.html / book.html, passed through ghl-inbound.js.
-- ghl-inbound.js degrades gracefully (retries the write without these fields)
-- until this migration is applied, so it is safe to deploy code first.

alter table customers add column if not exists utm_source   text;
alter table customers add column if not exists utm_medium   text;
alter table customers add column if not exists utm_campaign text;
alter table customers add column if not exists utm_term     text;
alter table customers add column if not exists utm_content  text;
alter table customers add column if not exists gclid        text;
alter table customers add column if not exists fbclid       text;
alter table customers add column if not exists landing_page text;
