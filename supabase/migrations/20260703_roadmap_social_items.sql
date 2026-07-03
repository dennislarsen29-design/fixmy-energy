-- Seed roadmap_items for the Social Media & Recruitment Automation group
-- (business-model.html → Action Roadmap & Prompt Library).
-- Idempotent: ON CONFLICT DO NOTHING preserves any later manual toggles.

insert into public.roadmap_items (key, checked, blocked_by, completed_at) values
  ('ig-dashboard',   true,  null,          now()),
  ('ig-token',       false, null,          null),
  ('ig-fb-publish',  false, 'ig-token',    null),
  ('comment-dm',     false, null,          null),
  ('fb-lead-ads',    false, null,          null),
  ('fb-lead-bridge', false, 'fb-lead-ads', null),
  ('fb-jobs',        false, null,          null)
on conflict (key) do nothing;
