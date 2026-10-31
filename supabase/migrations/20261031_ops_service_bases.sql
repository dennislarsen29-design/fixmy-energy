-- Ops partner service areas (2026-10-31, per Dennis): a partner can work from more than one base. Travel adders on the electrician
-- pay plan are measured from the NEAREST base. Coordinates are approximate ZIP centres.
alter table team_members add column if not exists service_bases jsonb;
-- Every non-Cosmic ops partner starts with central San Diego; Wolf Building (Hector) also covers Orange County and Imperial County.
update team_members set service_bases = '[{"label":"San Diego","zip":"92101","lat":32.7157,"lng":-117.1611}]'::jsonb
  where role='ops' and id <> 'ops3' and service_bases is null;
update team_members set service_bases = '[{"label":"San Diego","zip":"92101","lat":32.7157,"lng":-117.1611},{"label":"Orange County","zip":"92701","lat":33.7455,"lng":-117.8677},{"label":"Imperial County","zip":"92243","lat":32.7920,"lng":-115.5630}]'::jsonb
  where id = 'ops_0yqgcv';
