-- ═══ 2025 actuals from the CPA General Ledger (Solar Review Corp, ABMG) ═══
-- One row per P&L account = the CPA's printed annual total (cash basis,
-- as of 2025-12-31). Values are the GL's own account totals, so they
-- reconcile to the ledger by construction. Imported at annual granularity
-- (period_month = 2025-01-01); the P&L lifetime view (year columns) and the
-- Year-2025 view show these exactly. Idempotent via the unique index.
--
-- Reconciliation (verified in scratchpad/verify-gl-2025.js):
--   Income (Commission + Other) = 305,920.67
--   COGS = 23,279.25 ; Gross = 282,641.42
--   Expenses = 186,363.36 ; Net = 96,278.06
--   (Net ≈ 2025 Shareholder Distributions of 97,020.99 — S-Corp distributed ~all profit.)

insert into public.ledger_history (period_month, account_name, type, amount, source) values
  -- Income
  ('2025-01-01','Commission Income','income',303612.44,'cpa_gl_2025'),
  ('2025-01-01','Other Income','income',2308.23,'cpa_gl_2025'),
  -- COGS
  ('2025-01-01','Incentives - Sales','cogs',2942.57,'cpa_gl_2025'),
  ('2025-01-01','Lead Generation','cogs',4500.00,'cpa_gl_2025'),
  ('2025-01-01','Subcontracted Services','cogs',15836.68,'cpa_gl_2025'),
  -- Expenses (leaf accounts; sub-accounts roll up to their parent on the P&L)
  ('2025-01-01','Advertising and Promotion','expense',10872.26,'cpa_gl_2025'),
  ('2025-01-01','Automobile Expense','expense',5491.26,'cpa_gl_2025'),
  ('2025-01-01','Bank Service Charges','expense',-8.00,'cpa_gl_2025'),
  ('2025-01-01','Computer and Internet Expenses','expense',2467.52,'cpa_gl_2025'),
  ('2025-01-01','Donation','expense',25.00,'cpa_gl_2025'),
  ('2025-01-01','Dues and Subscriptions','expense',1028.94,'cpa_gl_2025'),
  ('2025-01-01','Gifts - Client','expense',922.36,'cpa_gl_2025'),
  ('2025-01-01','Auto Insurance','expense',3176.08,'cpa_gl_2025'),
  ('2025-01-01','Medical Insurance','expense',5202.42,'cpa_gl_2025'),
  ('2025-01-01','Insurance Expense - Other','expense',189.20,'cpa_gl_2025'),
  ('2025-01-01','Meals and Entertainment','expense',3980.54,'cpa_gl_2025'),
  ('2025-01-01','Merchant Fees','expense',5.98,'cpa_gl_2025'),
  ('2025-01-01','Office Supplies','expense',5657.42,'cpa_gl_2025'),
  ('2025-01-01','Payroll Expense','expense',966.18,'cpa_gl_2025'),
  ('2025-01-01','Postage and Delivery','expense',4142.76,'cpa_gl_2025'),
  ('2025-01-01','Accounting','expense',1785.00,'cpa_gl_2025'),
  ('2025-01-01','Legal Fees','expense',298.96,'cpa_gl_2025'),
  ('2025-01-01','Professional Fees - Other','expense',3081.85,'cpa_gl_2025'),
  ('2025-01-01','Corporate Housing','expense',55816.55,'cpa_gl_2025'),
  ('2025-01-01','Repairs and Maintenance','expense',294.62,'cpa_gl_2025'),
  ('2025-01-01','Officer Salary','expense',54456.78,'cpa_gl_2025'),
  ('2025-01-01','Licenses and Permits','expense',200.00,'cpa_gl_2025'),
  ('2025-01-01','Payroll Taxes','expense',4814.25,'cpa_gl_2025'),
  ('2025-01-01','Team Event','expense',1415.30,'cpa_gl_2025'),
  ('2025-01-01','Telephone Expense','expense',1944.01,'cpa_gl_2025'),
  ('2025-01-01','Training & Coaching - Sales','expense',535.00,'cpa_gl_2025'),
  ('2025-01-01','Lodging','expense',15181.01,'cpa_gl_2025'),
  ('2025-01-01','Transportation','expense',6132.82,'cpa_gl_2025'),
  ('2025-01-01','Travel Meals & Entertainment','expense',2483.76,'cpa_gl_2025'),
  ('2025-01-01','Travel Expense - Other','expense',-6623.97,'cpa_gl_2025'),
  ('2025-01-01','Utilities','expense',427.50,'cpa_gl_2025')
on conflict (period_month, account_name, source) do nothing;
