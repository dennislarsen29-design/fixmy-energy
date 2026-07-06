-- ═══ Privacy Opt-Out Registry — Personal tab tracking ═══
-- Tracks the status of removal requests Dennis has filed against people-search
-- sites, marketing data brokers, and background-check companies. Seed rows
-- below are just site metadata (name/URL/method) — no personal data. The
-- admin's own name/address/phone/email lives in privacy_profile, entered
-- through the Personal tab UI rather than committed here.

create table if not exists public.privacy_optouts (
  id                     uuid primary key default gen_random_uuid(),
  site_name              text not null,
  category               text not null, -- people_search | data_broker | background_check
  opt_out_url            text,
  method                 text not null default 'web_form', -- web_form | email | phone | mail | app_portal | none
  requires_manual        boolean not null default false, -- true = no self-serve web form (phone/mail/app only)
  resubmit_interval_days int, -- null = one-and-done; else re-check cadence
  notes                  text,
  status                 text not null default 'not_started', -- not_started | submitted | pending_confirmation | confirmed | relisted
  submitted_at           timestamptz,
  confirmed_at           timestamptz,
  next_check_due         timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists privacy_optouts_category_idx on public.privacy_optouts (category);
create index if not exists privacy_optouts_status_idx on public.privacy_optouts (status);

alter table public.privacy_optouts enable row level security;
drop policy if exists "privacy_optouts read" on public.privacy_optouts;
create policy "privacy_optouts read" on public.privacy_optouts for select using (true);
drop policy if exists "privacy_optouts write" on public.privacy_optouts;
create policy "privacy_optouts write" on public.privacy_optouts for insert with check (true);
drop policy if exists "privacy_optouts update" on public.privacy_optouts;
create policy "privacy_optouts update" on public.privacy_optouts for update using (true);

-- Single-row table for the admin's own identifying info, entered via the
-- Personal tab UI (never hardcoded in a migration).
create table if not exists public.privacy_profile (
  id         text primary key default 'default',
  full_name  text,
  address    text,
  phone      text,
  email      text,
  updated_at timestamptz not null default now()
);

alter table public.privacy_profile enable row level security;
drop policy if exists "privacy_profile read" on public.privacy_profile;
create policy "privacy_profile read" on public.privacy_profile for select using (true);
drop policy if exists "privacy_profile write" on public.privacy_profile;
create policy "privacy_profile write" on public.privacy_profile for insert with check (true);
drop policy if exists "privacy_profile update" on public.privacy_profile;
create policy "privacy_profile update" on public.privacy_profile for update using (true);

insert into public.privacy_optouts (site_name, category, opt_out_url, method, requires_manual, resubmit_interval_days, notes)
values
  -- People-search engines
  ('Addresses.com','people_search','https://www.addresses.com/optout.php','web_form',false,90,'URL reported inconsistent across sources — confirm before relying on it.'),
  ('Advanced Background Checks','people_search','https://www.advancedbackgroundchecks.com/removal','web_form',false,90,null),
  ('AnyWho','people_search','https://www.intelius.com/opt-out','web_form',false,90,'Sourced from Intelius/PeopleConnect — removing there removes the AnyWho listing.'),
  ('BeenVerified','people_search','https://www.beenverified.com/app/optout/search','web_form',false,90,'Search your record, then confirm via emailed link.'),
  ('CheckPeople','people_search','https://checkpeople.com/opt-out','web_form',false,90,'Also has a separate CCPA do-not-sell page.'),
  ('ClustrMaps','people_search','https://clustrmaps.com/bl/opt-out','web_form',false,90,'Needs the specific profile URL, not just name/address.'),
  ('CyberBackgroundChecks','people_search','https://www.cyberbackgroundchecks.com/removal','web_form',false,90,null),
  ('Enformion','people_search','https://www.enformion.com/opt-out/','web_form',false,90,'Two-step: request link emailed, then complete it.'),
  ('FamilyTreeNow','people_search','https://www.familytreenow.com/optout','web_form',false,90,'Genealogy-sourced rather than typical scraped records.'),
  ('FastPeopleSearch','people_search','https://www.fastpeoplesearch.com/removal','web_form',false,90,null),
  ('Instant Checkmate','people_search','https://www.instantcheckmate.com/opt-out/','web_form',false,90,'PeopleConnect network — one submission can cover sibling sites.'),
  ('Intelius','people_search','https://www.intelius.com/opt-out','web_form',false,90,'PeopleConnect network.'),
  ('MyLife','people_search','https://www.mylife.com/privacyrequest','web_form',false,90,'Ignore the paid "reputation score" upsell — the free removal path is separate.'),
  ('Nuwber','people_search','https://nuwber.com/removal/link','web_form',false,90,'Requires pasting your specific listing URL.'),
  ('PeekYou','people_search','https://www.peekyou.com/about/contact/ccpa_optout/do_not_sell/','web_form',false,90,null),
  ('PeopleFinders','people_search','https://www.peoplefinders.com/opt-out','web_form',false,45,'Known to re-list — recheck on the shorter cadence.'),
  ('PeopleLooker','people_search','https://www.peoplelooker.com/f/optout/search','web_form',false,90,null),
  ('PeopleSmart','people_search','https://www.peoplesmart.com/optout-go','web_form',false,90,'Owned by BeenVerified, routed through their system.'),
  ('PeopleWhiz','people_search','https://www.peoplewhiz.com/remove-my-info','web_form',false,90,null),
  ('Pipl','people_search','https://pipl.com/personal-information-removal-request','web_form',false,90,'Select "Deletion" as request type.'),
  ('PrivateEye','people_search','https://www.privateeye.com/optout/','web_form',false,90,'URL path varies across sources — confirm whichever loads.'),
  ('PublicRecordsNow','people_search','https://www.publicrecordsnow.com/static/view/optout/','web_form',false,90,'Contact form reported broken by some users — email fallback may be needed.'),
  ('Radaris','people_search','https://radaris.com/control/privacy','web_form',false,45,'Per-record, not account-wide — known to re-list.'),
  ('SearchPeopleFree','people_search','https://www.searchpeoplefree.com/opt-out','web_form',false,90,null),
  ('Spokeo','people_search','https://www.spokeo.com/optout','web_form',false,45,'Known to re-list — recheck on the shorter cadence.'),
  ('Spytox','people_search','https://www.spytox.com/opt_out','web_form',false,90,'Slower processing, ~7-10 days.'),
  ('ThatsThem','people_search','https://thatsthem.com/optout','web_form',false,90,null),
  ('TruePeopleSearch','people_search','https://www.truepeoplesearch.com/removal','web_form',false,90,null),
  ('TruthFinder','people_search','https://www.truthfinder.com/opt-out/','web_form',false,90,'PeopleConnect network.'),
  ('USA-People-Search','people_search','https://www.usa-people-search.com/manage','web_form',false,90,'Also seen under a related domain — confirm which one hosts your listing.'),
  ('USSearch','people_search','https://suppression.peopleconnect.us/?brand=USSearch','web_form',false,90,'PeopleConnect network.'),
  ('Whitepages','people_search','https://www.whitepages.com/suppression-requests','web_form',false,45,'Phone verification required per listing; known to re-list.'),
  ('ZabaSearch','people_search','https://suppression.peopleconnect.us/login','web_form',false,45,'Powered by Intelius data — known to re-list.'),

  -- Marketing / data brokers
  ('Acxiom','data_broker','https://isapps.acxiom.com/optout/optout.aspx','web_form',false,365,'Do this and the separate LiveRamp opt-out.'),
  ('Ancestry.com','data_broker','https://www.ancestry.com/legal/ccpa-donotshare-sell','web_form',false,365,'Full deletion requires closing the account entirely.'),
  ('Comscore','data_broker','https://www.comscore.com/About/Privacy/Data-Subject-Rights','web_form',false,365,'Browser/device-level — repeat on every browser and device.'),
  ('CoreLogic (Cotality)','data_broker','https://www.cotality.com','web_form',false,365,'Rebranded to Cotality in 2025 — exact form URL unconfirmed, use footer link.'),
  ('Datalogix','data_broker',null,'none',true,null,'Absorbed into Oracle Data Cloud — see that entry instead.'),
  ('DMAchoice (ANA/DMA)','data_broker','https://www.dmachoice.org','web_form',false,365,'Blanket "stop marketing to me" registry, not a single-company opt-out.'),
  ('Epsilon','data_broker','https://us.epsilon.com/marketing-data-summary-request','web_form',false,365,null),
  ('Experian (Marketing)','data_broker','https://www.experian.com/privacy/opting_out','web_form',false,365,'Separate from the credit-report prescreen opt-out.'),
  ('Infutor Data Solutions','data_broker','https://privacy.infutor.com/s/optout-form','web_form',false,365,null),
  ('Innovis','data_broker','https://www.innovis.com/personal/optOutOptIn','web_form',false,365,'SSN field on the form is optional.'),
  ('Kochava','data_broker','https://support.kochava.com/reference-information/kochava-privacy-request/','web_form',false,365,'Suppression list also blocks analytics/ML use, not just marketing.'),
  ('LexisNexis','data_broker','https://optout.lexisnexis.com/','web_form',false,365,null),
  ('LiveRamp','data_broker','https://liveramp.com/opt_out','web_form',false,365,'Complements Acxiom, do both.'),
  ('MyHeritage','data_broker',null,'email',true,365,'No confirmed self-serve web form — email privacy@myheritage.com.'),
  ('Neustar','data_broker','https://privacychoices.home.neustar/','web_form',false,365,'Being absorbed into TransUnion TruAudience — URL may migrate.'),
  ('Oracle Data Cloud / BlueKai','data_broker','https://datacloudoptout.oracle.com/optout','web_form',false,365,'Oracle shut down this ad business in 2024 — page may be unmaintained.'),
  ('People Data Labs','data_broker','https://privacy.peopledatalabs.com/','web_form',false,365,'B2B broker, no consumer UI.'),
  ('Tapad','data_broker','https://privacy.tapad.com/optout.html','web_form',false,365,null),
  ('Thomson Reuters CLEAR','data_broker','https://www.thomsonreuters.com','web_form',false,365,'Opt-out link is in the site footer.'),
  ('Tower Data (AtData)','data_broker','https://instantdata.towerdata.com/optout','web_form',false,365,'Use a disposable email — contacting brokers can itself feed a list.'),
  ('TransUnion (Marketing)','data_broker','https://www.transunion.com/consumer-privacy','web_form',false,365,'Online opt-out lasts 5 years; permanent requires a mailed signed form.'),
  ('Verisk','data_broker',null,'email',true,365,'No public web form — email privacy@verisk.com.'),

  -- Background-check / consumer-reporting companies
  ('Certn','background_check',null,'app_portal',true,365,'Self-service via the MyCertn Wallet app.'),
  ('ChexSystems','background_check','https://www.chexsystems.com/optout','web_form',false,365,'5-yr opt-out online; permanent requires a mailed form.'),
  ('Checkr','background_check','https://help.checkr.com','web_form',true,null,'No consumer opt-out exists — employer-initiated check, dispute only.'),
  ('Equifax (Marketing)','background_check','https://myprivacy.equifax.com/opt-in-opt-out/personal-info','web_form',false,365,null),
  ('First Advantage','background_check','https://fadv.com/privacy-center/us-residents/dispute-report/','web_form',true,null,'Dispute only — no opt-out of being screened.'),
  ('GoodHire','background_check','https://docs.goodhire.com/en-us/forms/GH_Consumer-Dispute-Form.pdf','mail',true,null,'PDF dispute form — certified mail recommended.'),
  ('IDI / TLO','background_check','https://www.ididata.com/opt-out-policy/','web_form',false,365,'~90-day response for the risk-of-harm suppression path.'),
  ('NCTUE','background_check','https://nctue.com/consumer/','web_form',false,365,'No blanket opt-out, but you can dispute entries and freeze.'),
  ('SageStream','background_check',null,'phone',true,365,'Phone 888-395-0277 — no confirmed web form.'),
  ('Sterling (Sterling Check)','background_check',null,'email',true,null,'Merging with First Advantage — no dedicated opt-out URL confirmed.')
on conflict do nothing;

insert into public.privacy_profile (id) values ('default') on conflict do nothing;
