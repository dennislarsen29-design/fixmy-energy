-- A Tech's own Google calendar (a mailbox on the fixmy.energy Workspace). gcal-sync writes their sales-side events there.
alter table team_members add column if not exists calendar_email text;
update team_members set calendar_email = 'cristina@fixmy.energy' where id = 'tech5' and calendar_email is null;
