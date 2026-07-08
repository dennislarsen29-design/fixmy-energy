-- ═══ Privacy profile — other known identifiers ═══
-- People-search/data-broker sites index by address & email history, not just
-- your current info — a past address or old email is often a separate listing
-- that searching only your current profile won't surface. One free-text field
-- (not four separate ones) keeps this simple: paste every other address,
-- email, phone, and maiden name/alias here, one per line, and check each site
-- against all of them, not just the primary profile above.

alter table public.privacy_profile add column if not exists other_identifiers text;
