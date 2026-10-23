-- Tech stack + monthly costs shown in Admin S.U.N. Costs start blank on purpose (never guessed);
-- Dennis fills them in. Same anon-key trust model as job_costs.
create table if not exists tech_stack (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  purpose text,
  cost_monthly numeric,
  billing text default 'monthly',   -- monthly | annual | usage
  status text default 'active',     -- active | trial | unused | planned
  notes text,
  sort int default 100,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table tech_stack enable row level security;
drop policy if exists tech_stack_anon_all on tech_stack;
create policy tech_stack_anon_all on tech_stack for all using (true) with check (true);
insert into tech_stack (name, category, purpose, billing, status, notes, sort) values
 ('Netlify','Hosting','Hosts the portal, site and all server functions','monthly','active','Bank showed small Netlify charges (~$6) through June.',10),
 ('Supabase','Database','Main database for leads, jobs, payments','monthly','active',null,20),
 ('GoHighLevel','CRM / messaging','Customer texts and email, calendars, workflows','monthly','active',null,30),
 ('Anthropic API (Quoya AI)','AI','Photo reading, evaluation analysis, Quoya Assist, agents','usage','active','Usage based; top-ups appeared ~$10 in June.',40),
 ('Stripe','Payments','Sign & Pay card and ACH payments','usage','active','Fees come out of payments (3.9% card surcharge passes to the customer).',50),
 ('Resend','Email','Transactional email and daily agent digest','monthly','active',null,60),
 ('Plaid','Banking','Bank and card sync for Finance','usage','active',null,70),
 ('Regrid','Property data','Parcel and owner lookup outside San Diego','monthly','trial','Free trial token set 2026-10-05, expires 2026-11-01. API calls returned 403 (not entitled) earlier. San Diego owners already come from the county table.',80),
 ('Tracerfy','Skip tracing','Phone and email lookup for Black Box leads','usage','active','Bank showed two charges averaging $210 (last June).',90),
 ('PermitStack','Permit data','Nightly permit pull for defunct-installer leads','monthly','active',null,100),
 ('Google Maps / Solar API','Maps','Maps, geocoding, rooftop satellite and solar data','usage','active',null,110),
 ('Gusto','Payroll','Payroll and contractor onboarding','monthly','active','Bank showed a ~$57 Gusto service charge monthly.',120),
 ('Aurora Solar','Design','Axia/QCells system design','monthly','active',null,130),
 ('SolarGraf','Design','Cosmic proposal documents','monthly','active',null,140),
 ('Smith.AI','Answering service','Inbound call answering','monthly','active','Planned to be replaced by Quoya inbound handling.',150),
 ('Lead Locker Room','Leads','Purchased solar leads (per-lead)','usage','active',null,160),
 ('HeyGen','Avatar / video','Avatar videos; possible live Quoya avatar','monthly','trial','First paid plan; API / LiveAvatar access not confirmed.',170)
on conflict (name) do nothing;
