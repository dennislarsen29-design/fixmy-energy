-- ═══ Reconcile shipped items dropped by the roadmap rebuild ═══
-- (2026-07-23)
-- The rebuild (20260723_roadmap_rebuild.sql) retired the old business_model_data
-- "milestones" view but didn't carry over three items that were already shipped,
-- so they'd have silently vanished instead of showing in the new board's Completed
-- section. Add them as done history rows. (Auto-redirect + first-login tour are
-- already covered by the 'booking-ux' card; "GHL confirmation fires to homeowner"
-- stays To-Do as the 'ghl-webhook' item — it's a pending GHL config, not shipped.)
-- Idempotent.
insert into public.roadmap_items
  (key, title, description, group_key, status, source, sort, completed_at) values
  ('acc-slot-display', 'Slot Display — 3 Visible + Load More',
   'Booking page shows 3 time slots then a "Show more times" reveal; ghl-slots.js returns 20. Shipped in book.html.',
   'history', 'done', 'manual', 90, timestamptz '2026-07-17'),
  ('acc-photo-step2', 'Photo Upload → Step 2 + Rep SMS Notify',
   'First photo upload advances the lead to step 2 and fires notify-photo-upload.js to the assigned rep (tech4 fallback). The GHL LC-Phone workflow that sends the SMS is tracked separately as ghl-sms.',
   'history', 'done', 'manual', 100, timestamptz '2026-07-17'),
  ('acc-ghl-e2e', 'GHL Automation Tested End-to-End',
   'Lead submit → contact created → SMS/email fires, verified end-to-end.',
   'history', 'done', 'manual', 110, timestamptz '2026-07-04')
on conflict (key) do update set status='done', completed_at=excluded.completed_at, updated_at=now();
