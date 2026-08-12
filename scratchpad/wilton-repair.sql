-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DIAGNOSE — one row per matching lead, with a plain-English verdict.
-- ─────────────────────────────────────────────────────────────────────────────
select
  trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as name,
  coalesce(c.title_owner, '')                                        as owner_on_title,
  c.address,
  case
    when a.id is not null and c.black_box is true
      then 'STUCK — booked but never saved. Run step 2.'
    when c.black_box is not true and c.diagnostic_date is null
      then 'ACTIVATED but has no appointment date. Run step 3.'
    when c.black_box is not true
      then 'OK — already in Leads, nothing to do.'
    else 'NO BOOKING RECORDED — it never completed. Re-book it.'
  end                                                                as verdict,
  c.id, c.black_box, c.step, c.rep_id, c.setter_name, c.diagnostic_date,
  a.rep_name  as booked_by,
  a.created_at as booked_at,
  a.note                       -- the appointment time is written into this note
from customers c
left join lead_activity a
  on a.customer_id = c.id and a.outcome = 'booked'
where c.title_owner ilike '%wilton%'
   or c.last_name  ilike '%wilton%'
   or c.first_name ilike '%leslie%'
order by a.created_at desc nulls last;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REPAIR — activate every lead that was booked but never saved.
--    Safe to run with zero matches. Does NOT touch sold_type, notes, or dnc.
--    Add:  and (c.last_name ilike '%wilton%')   to limit it to just this one.
-- ─────────────────────────────────────────────────────────────────────────────
update customers c
set black_box    = false,
    step         = greatest(coalesce(c.step, 0), 1),
    lead_category = coalesce(c.lead_category, 'fixmy'),
    knock_status = 'booked',
    rep_id       = 'tech4',                              -- Dennis closes it
    setter_name  = coalesce(c.setter_name, a.rep_name)   -- keep the setter's 20%
from lead_activity a
where a.customer_id = c.id
  and a.outcome     = 'booked'
  and c.black_box is true
returning c.id, c.first_name, c.last_name, c.address, c.rep_id, c.setter_name;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SET THE APPOINTMENT — read the time out of `note` in step 1, then:
--    (without this the lead is in Leads but shows on nobody's Schedule)
-- ─────────────────────────────────────────────────────────────────────────────
-- update customers
--    set diagnostic_date = '2026-08-14 16:00:00-07',   -- start, Pacific
--        arrival_end     = '2026-08-14 18:00:00-07'    -- end of the window
--  where id = 'PASTE_THE_ID_FROM_STEP_1';
