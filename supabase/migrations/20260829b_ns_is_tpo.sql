-- Axia/QCell Commission Setup popup (2026-08-29, per Dennis): TPO ("Third-Party
-- Ownership" — a lease/PPA financing type, as opposed to cash/loan) is the gate for
-- whether a Redline/Domestic-Content-Bonus dealer fee applies to a deal at all. Set by
-- the popup that fires when a lead's disposition moves to Welcome Call Closed.
alter table customers add column if not exists ns_is_tpo boolean;
