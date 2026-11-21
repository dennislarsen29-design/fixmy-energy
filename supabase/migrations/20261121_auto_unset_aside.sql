-- A Paused / Not interested lead comes back to the pipeline by itself when real movement happens
-- (appointment booked, step/status advanced, sold, paid). Dead (do not contact) is never auto-reopened.
create or replace function public.pv_unset_aside_customers() returns trigger language plpgsql as $$
declare moved boolean := false;
begin
  if OLD.disposition_exit in ('paused','not_interested') and NEW.disposition_exit is not distinct from OLD.disposition_exit then
    if NEW.step is distinct from OLD.step and coalesce(NEW.step,1) <> 7 and coalesce(NEW.step,1) > coalesce(OLD.step,1) then moved := true; end if;
    if NEW.solar_status is distinct from OLD.solar_status and NEW.solar_status is not null and NEW.solar_status not in ('ns_eval_canceled','ns_welcome_dead','ns_call_dead') then moved := true; end if;
    if NEW.diagnostic_date is distinct from OLD.diagnostic_date and NEW.diagnostic_date is not null and NEW.diagnostic_date > now() - interval '1 day' then moved := true; end if;
    if NEW.sold_type is distinct from OLD.sold_type and NEW.sold_type is not null then moved := true; end if;
    if NEW.invoice_status is distinct from OLD.invoice_status and NEW.invoice_status = 'paid' then moved := true; end if;
    if moved then
      NEW.disposition_exit := null; NEW.pause_reason := null; NEW.paused_until := null;
      NEW.recapture_next_at := null; NEW.recapture_touches := 0; NEW.recapture_sensitive := false;
      if NEW.step = 7 then NEW.step := 1; end if;
      if NEW.solar_status = 'ns_eval_canceled' then NEW.solar_status := 'ns_eval_booked'; end if;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists pv_unset_aside_customers on public.customers;
create trigger pv_unset_aside_customers before update on public.customers for each row execute function public.pv_unset_aside_customers();

create or replace function public.pv_unset_aside_appointments() returns trigger language plpgsql as $$
begin
  if NEW.status = 'scheduled' and NEW.starts_at > now() - interval '1 day' then
    update public.customers set
      disposition_exit = null, pause_reason = null, paused_until = null,
      recapture_next_at = null, recapture_touches = 0, recapture_sensitive = false,
      step = case when step = 7 then 1 else step end,
      solar_status = case when solar_status = 'ns_eval_canceled' then 'ns_eval_booked' else solar_status end
    where id = NEW.customer_id and disposition_exit in ('paused','not_interested');
  end if;
  return NEW;
end $$;
drop trigger if exists pv_unset_aside_appointments on public.appointments;
create trigger pv_unset_aside_appointments after insert or update of status, starts_at on public.appointments for each row execute function public.pv_unset_aside_appointments();

-- Christopher McFarland: booked today but still Paused
update public.customers set disposition_exit = null, pause_reason = null, paused_until = null,
  recapture_next_at = null, recapture_touches = 0, recapture_sensitive = false
where id = '08daf79a-346d-46d6-b393-ee34cfc25af3' and disposition_exit = 'paused';
