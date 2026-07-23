-- Roadmap ship-time SOP: record the dialer script + AI note-taker as a completed accomplishment.
insert into public.roadmap_items (key, title, description, group_key, status, source, sort, completed_at) values
  ('acc-dialer-script', 'Dialer Script + Call Flow + AI Note-Taker',
   'Branded, per-lead-personalized call script and visual call flow embedded in the Black Box Dialer, plus a 🎙 AI note-taker that transcribes the call live and writes the CRM note + suggests the disposition.',
   'history', 'done', 'manual', 140, now())
on conflict (key) do nothing;
