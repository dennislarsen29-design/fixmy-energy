-- Antoinette Kruse — historical FixMy battery-retrofit job (Cosmic install).
-- Books the job so the Finance P&L, Commissions, and Cosmic's Ops portal populate.
--
-- Figures per Dennis:
--   Pricing (retail) ........ $14,935.00
--   After Participate ....... $10,454.50   (collected revenue)
--   Redline (Cosmic cost) ... $13,500.00
--   Rep commission .......... $ 1,435.00
--   Paid to Cosmic so far ... $ 1,000.00   (deposit)
--
-- ⚠️ CONFIRM BEFORE RUNNING: collected revenue $10,454.50 vs. Cosmic cost $13,500
--    books a NEGATIVE paper margin on this job. Verify the participate/financing
--    revenue figure is what should hit the P&L. Also set REP_ID below to the real
--    closer's rep_id (it was NOT Dennis/tech4 — Dennis-sold jobs earn no commission).
--
-- Idempotent: safe to re-run (guards on existing rows).

do $$
declare cid uuid;
begin
  select id into cid from public.customers
    where first_name = 'Antoinette' and last_name = 'Kruse'
      and address ilike '2520 Begonia%' limit 1;

  if cid is null then
    insert into public.customers
      (first_name, last_name, address, lead_category, sold_type, assigned_ops,
       invoice_amount, invoice_status, rep_commission,
       ops_milestone1_amount, ops_milestone1_status, step, created_at)
    values
      ('Antoinette', 'Kruse', '2520 Begonia Way, Alpine, CA 91901', 'fixmy', 'battery_retrofit', 'ops3',
       14935, 'paid', 1435,
       1000, 'paid', 8, now())
    returning id into cid;
  end if;

  -- Revenue collected (participate price) → P&L Commission Income
  if not exists (select 1 from public.payments where customer_id = cid and amount = 10454.50) then
    insert into public.payments (customer_id, amount, method, source, note, recorded_by, paid_at)
    values (cid, 10454.50, 'other', 'manual',
            'Antoinette Kruse — battery retrofit (participate price)', 'seed', now());
  end if;

  -- Rep commission $1,435 (set payee to the real closer's rep_id — NOT tech4)
  if not exists (select 1 from public.commissions where customer_id = cid and kind = 'rep_commission') then
    insert into public.commissions (customer_id, line, kind, payee, payee_name, amount, status, note)
    values (cid, 'fixmy', 'rep_commission', 'REP_ID_TBD', 'TBD — set closer', 1435, 'paid',
            'Antoinette Kruse battery retrofit');
  end if;

  -- Cosmic dealer cost (Sub Sheet): $13,500 total — $1,000 paid (deposit), $12,500 pending
  if not exists (select 1 from public.job_costs where customer_id = cid and label = 'Cosmic payout — deposit') then
    insert into public.job_costs (customer_id, label, amount, status, paid_at, created_by)
    values (cid, 'Cosmic payout — deposit', 1000, 'paid', now(), 'seed');
  end if;
  if not exists (select 1 from public.job_costs where customer_id = cid and label = 'Cosmic payout — remainder') then
    insert into public.job_costs (customer_id, label, amount, status, created_by)
    values (cid, 'Cosmic payout — remainder', 12500, 'pending', 'seed');
  end if;
end $$;

-- Item 2 (data): Dennis's HIS license is on file → hide the Tech-portal HIS banner.
update public.team_members set his_license = true
  where lower(name) like 'dennis%' or id = 'tech4';
