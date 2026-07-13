-- ═══ Full CPA chart of accounts — from the 2025 General Ledger (ABMG) ═══
-- The original coa_accounts seed came from the Jan–Apr 2026 P&L (a subset).
-- The full-year 2025 GL reveals the CPA's complete account list, including
-- S-Corp-critical Officer Salary and Shareholder Distributions plus several
-- expense accounts. Names must stay 1:1 with the CPA's QuickBooks accounts.
--
-- coa_accounts.type has no CHECK constraint; we use income | cogs | expense
-- (consumed by the P&L) and add equity | liability | asset (off-P&L, present
-- so the deposit classifier + a future balance sheet can reference them).

-- ── Renumber existing accounts into a clean alphabetical order (matches QB P&L) ──
update public.coa_accounts set sort = 10 where name = 'Commission Income';
update public.coa_accounts set sort = 20 where name = 'Incentives - Sales';
update public.coa_accounts set sort = 21 where name = 'Lead Generation';
update public.coa_accounts set sort = 22 where name = 'Subcontracted Services';

update public.coa_accounts set sort = 100 where name = 'Advertising and Promotion';
update public.coa_accounts set sort = 101 where name = 'Automobile Expense';
update public.coa_accounts set sort = 102 where name = 'Bank Service Charges';
update public.coa_accounts set sort = 103 where name = 'Computer and Internet Expenses';
update public.coa_accounts set sort = 106 where name = 'Dues and Subscriptions';
update public.coa_accounts set sort = 107 where name = 'Gifts - Client';
update public.coa_accounts set sort = 108 where name = 'Insurance Expense';
update public.coa_accounts set sort = 109 where name = 'Auto Insurance';
update public.coa_accounts set sort = 110 where name = 'Insurance Expense - Other';
update public.coa_accounts set sort = 111 where name = 'Medical Insurance';
update public.coa_accounts set sort = 113 where name = 'Meals and Entertainment';
update public.coa_accounts set sort = 115 where name = 'Office Supplies';
update public.coa_accounts set sort = 116 where name = 'Payroll Expense';
update public.coa_accounts set sort = 117 where name = 'Postage and Delivery';
update public.coa_accounts set sort = 118 where name = 'Professional Fees';
update public.coa_accounts set sort = 119 where name = 'Accounting';
update public.coa_accounts set sort = 120 where name = 'Legal Fees';
update public.coa_accounts set sort = 122 where name = 'Rent or Lease';
update public.coa_accounts set sort = 123 where name = 'Corporate Housing';
update public.coa_accounts set sort = 124 where name = 'Repairs and Maintenance';
update public.coa_accounts set sort = 127 where name = 'Tax and Licenses';
update public.coa_accounts set sort = 129 where name = 'Licenses and Permits';
update public.coa_accounts set sort = 130 where name = 'Payroll Taxes';
update public.coa_accounts set sort = 132 where name = 'Telephone Expense';
update public.coa_accounts set sort = 134 where name = 'Travel Expense';
update public.coa_accounts set sort = 135 where name = 'Lodging';
update public.coa_accounts set sort = 136 where name = 'Transportation';
update public.coa_accounts set sort = 137 where name = 'Travel Meals & Entertainment';
update public.coa_accounts set sort = 138 where name = 'Travel Expense - Other';
update public.coa_accounts set sort = 139 where name = 'Utilities';

-- ── Add the accounts the 2026 subset was missing ──
insert into public.coa_accounts (name, type, parent, sort) values
  -- Income
  ('Other Income',                 'income',  null, 11),
  ('Interest Income',              'income',  null, 12),
  -- Expenses (alphabetical, interleaved with the renumbered set above)
  ('Depreciation Expense',         'expense', null, 104),
  ('Donation',                     'expense', null, 105),
  ('Interest Expense',             'expense', null, 112),
  ('Merchant Fees',                'expense', null, 114),
  ('Professional Fees - Other',    'expense', 'Professional Fees', 121),
  ('Salaries & Wages',             'expense', null, 125),
  ('Officer Salary',               'expense', 'Salaries & Wages', 126),
  ('Corporate Taxes',              'expense', 'Tax and Licenses', 128),
  ('Team Event',                   'expense', null, 131),
  ('Training & Coaching - Sales',  'expense', null, 133),
  -- Equity / liability / asset (off the P&L; present for classification + future balance sheet)
  ('Opening Balance Equity',       'equity',    null, 200),
  ('Retained Earnings',            'equity',    null, 201),
  ('Capital Stock',                'equity',    null, 202),
  ('Shareholder Distributions',    'equity',    null, 203),
  ('Medical',                      'equity',    'Shareholder Distributions', 204),
  ('Rent Expense',                 'equity',    'Shareholder Distributions', 205),
  ('Shareholder Distributions - Other', 'equity', 'Shareholder Distributions', 206),
  ('Silver Lands Equity Account',  'equity',    null, 207),
  ('Loan Payable - Freedom Solar', 'liability', null, 208),
  ('Payroll Clearing',             'liability', null, 209),
  ('Payroll Tax Liabilities',      'liability', null, 210),
  ('Due To/From Bank',             'liability', null, 211),
  ('Accounts Receivable',          'asset',     null, 212),
  ('Accounts Payable',             'liability', null, 213),
  ('Furniture and Equipment',      'asset',     null, 214),
  ('Accumulated Depreciation',     'asset',     null, 215)
on conflict (name) do nothing;
