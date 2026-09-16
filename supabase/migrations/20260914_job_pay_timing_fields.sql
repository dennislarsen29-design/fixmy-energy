-- Jobs page revamp (2026-09-14, per Dennis) — Gross Commission / Net Commission /
-- Company Margin terminology, POV-scoped job cards, a live self-adjusting
-- "estimated install date" -> "estimated pay date" bubble, and a real weekly
-- Payroll view for both admin and rep/tech POVs.
--
-- Three new timestamps, all nullable, all forward-only (no backfill — a guessed
-- backdated value is worse than none, same standing convention as every other
-- "signed date"/"completed date" field added in this file's history):
--
--   sold_at       — the moment a lead first got a real sold_type (FixMy or Axia/
--                   QCells alike). Stamped once, never overwritten, by every save
--                   path that can set sold_type (saveLeadEditor, savesSalesEdit,
--                   markCheckPaid's auto-convert-to-diagnostic branch). This is
--                   the "signed date" the estimated-install/pay-date math starts
--                   counting from.
--   installed_at  — FixMy's real completion timestamp, stamped by markJobInstalled
--                   the moment a job actually flips to step 9 (Installed). Not the
--                   same thing as install_date, which is really the SCHEDULED
--                   install appointment date/time (set at step 8) and is never
--                   re-stamped at true completion.
--   ns_pto_at     — Axia/QCells's real completion timestamp, stamped the moment
--                   solar_status transitions into 'ns_pto' (Permission to
--                   Operate) — the existing 'complete' filter elsewhere in the
--                   portal already treats ns_pto as the finish line, so this
--                   reuses that same definition of "done" rather than inventing
--                   a new one.
--
-- Together, (installed_at || ns_pto_at) - sold_at is the real, live Sold->Earned
-- duration this feature measures per sold_type/category, which is what lets the
-- "estimated install date" seed (35 days for battery_retrofit and Axia/QCells, 10
-- for diagnostic/monitoring, per Dennis 2026-09-13/14) get replaced by a real
-- median once enough completed jobs exist (>=3 samples) to trust over the seed.

alter table customers add column if not exists sold_at timestamptz;
alter table customers add column if not exists installed_at timestamptz;
alter table customers add column if not exists ns_pto_at timestamptz;
