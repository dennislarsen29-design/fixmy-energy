-- Next step "Google review not asked" (2026-11-23). Applied live via execute_sql.
alter table customers add column if not exists review_asked_at timestamptz;
