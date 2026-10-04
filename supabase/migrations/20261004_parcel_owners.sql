-- County assessor roll (SanGIS PARCELS_ALL) as a lookup table: address -> owner of record.
-- Licence: owner data must never be publicly displayed. RLS is ENABLED with NO policies, so the
-- anon key (shipped in portal.html) is fully denied; only the service-role Netlify functions
-- (parcel-owner.js, regrid-lookup.js) can read or write it. Never add an anon policy here.
create table if not exists parcel_owners (
  apn         text primary key,
  owner1      text,
  owner2      text,
  house_no    text not null,
  street_core text not null,
  zip         text not null,
  x           double precision,
  y           double precision
);
create index if not exists parcel_owners_zip_house on parcel_owners (zip, house_no);
alter table parcel_owners enable row level security;
