create table if not exists notification_log (
  id bigserial primary key,
  at timestamptz default now(),
  kind text,
  to_masked text,
  preview text,
  ok boolean,
  reason text,
  message_id text,
  delivery text,
  delivery_checked_at timestamptz
);
alter table notification_log enable row level security;
create policy "admin portal read" on notification_log for select to anon using (true);
create index if not exists notification_log_at_idx on notification_log (at desc);
