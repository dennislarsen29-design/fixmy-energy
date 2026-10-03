-- Signature upgrade (2026-10-03, per Dennis): the Sign & Pay agreement now captures the same
-- draw / type-and-pick signature as the portal's document signing, and BOTH signing paths record
-- a server-side audit trail (IP, user agent, server timestamp, SHA-256 of the exact terms +
-- signature). Non-destructive; existing rows land NULL.
alter table customers add column if not exists agreement_signature_data jsonb;
alter table customers add column if not exists agreement_audit jsonb;
