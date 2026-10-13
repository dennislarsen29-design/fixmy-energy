alter table customers add column if not exists ns_audit_at timestamptz, add column if not exists ns_audit_note text;
