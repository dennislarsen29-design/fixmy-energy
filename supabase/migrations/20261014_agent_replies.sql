-- Dennis's replies to agent reports. Agents read these at the start of every run (lib/agent-replies.js).
create table if not exists agent_replies (
  id uuid primary key default gen_random_uuid(),
  report_id uuid,
  agent text not null,
  kind text not null default 'answer',   -- answer | off_track | stop
  body text not null,
  report_title text,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists agent_replies_agent_idx on agent_replies (agent, created_at desc);
alter table agent_replies enable row level security;
create policy agent_replies_anon_all on agent_replies for all using (true) with check (true);
