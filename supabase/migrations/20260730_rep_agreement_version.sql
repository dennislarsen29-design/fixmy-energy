-- ═══ Rep agreement versioning — force re-sign on material terms changes (2026-07-30) ═══
-- Section 3.6 (Setter/Dialer Commission Split) was just added to the Sales Rep Agreement.
-- Existing signed rows have no way to distinguish "signed the old text" from "signed the
-- current text" — this column makes that explicit. NULL on existing rows deliberately does
-- NOT match the new REP_AGREEMENT_VERSION constant in portal.html, so every rep who signed
-- before this change is re-gated into the signing screen on next login, same as a new hire.
alter table public.rep_agreements add column if not exists agreement_version text;
