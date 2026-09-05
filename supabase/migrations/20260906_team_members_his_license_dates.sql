-- HIS license expiration tracking (2026-09-06, per Dennis — reviewing the CPUC document's
-- field placement surfaced that the CSLB HIS Registration Number is per-Tech/closer, not a
-- flat company value like Cosmic's CSLB license. Dennis explicitly wants the issue/expiration
-- dates "notated" so admin can look up and remind Techs/closers to get relicensed in time.
-- Reuses the existing `his_license`/`his_license_number` pair already on team_members (see
-- the live "CA HIS License" onboarding tile, adminToggleHIS) rather than a new table.
alter table team_members add column if not exists his_issue_date date;
alter table team_members add column if not exists his_expiration_date date;

-- Seeded directly from Dennis's own message (2026-09-06):
-- Dennis Larsen (tech4): HIS 117450 SP, issued 2019-02-04, expires 2027-02-28.
-- Cristina Huang (tech5): HIS 137031 SP, issued 2022-03-22, expires 2028-03-31.
update team_members set his_license=true, his_license_number='117450 SP', his_issue_date='2019-02-04', his_expiration_date='2027-02-28' where id='tech4';
update team_members set his_license=true, his_license_number='137031 SP', his_issue_date='2022-03-22', his_expiration_date='2028-03-31' where id='tech5';
