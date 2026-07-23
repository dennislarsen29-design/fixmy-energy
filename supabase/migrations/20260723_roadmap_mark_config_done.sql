-- ═══ Mark three shipped config tasks done (2026-07-23, per Dennis) ═══
-- ghl-webhook (GHL AppointmentCreate webhook configured), ig-token (Meta token +
-- Netlify env vars set, IG dashboard pulling live data — corroborated by real rows
-- in social_metrics/social_posts), and ghl-sms (GHL LC-Phone workflow now built on
-- top of notify-photo-upload.js). All were GHL/Meta config tasks outside the repo,
-- confirmed done by Dennis. Also refreshes their now-stale "pending" descriptions.
-- Marking ig-token done auto-unblocks ig-fb-publish (blocked_by ig-token). Idempotent.
update public.roadmap_items set
  status = 'done',
  checked = true,
  completed_at = now(),
  updated_at = now(),
  description = case key
    when 'ghl-webhook' then 'Customer books via /book → GHL fires a webhook so diagnostic_date auto-populates via ghl-inbound.js. GHL automation configured and live.'
    when 'ig-token'    then 'Long-lived Meta token + IG_ACCESS_TOKEN/IG_USER_ID set in Netlify; first sync run — the Instagram Growth dashboard is pulling live data.'
    when 'ghl-sms'     then 'GHL workflow fired by notify-photo-upload.js → SMS the assigned rep via LC Phone (Twilio removed, tech4 fallback). Function + GHL workflow both live.'
    else description end
where key in ('ghl-webhook','ig-token','ghl-sms');
