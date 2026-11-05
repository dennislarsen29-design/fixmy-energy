-- Self-healing phase 2: code-fix pull requests.
alter table heal_proposals add column if not exists pr_url text;
drop index if exists heal_open_uniq;
create unique index heal_open_uniq on heal_proposals(system, signature) where status in ('proposed','running','verifying','pr_open');
