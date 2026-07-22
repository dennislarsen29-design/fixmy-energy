-- Personal loan follow-up: collateral clause + split the lender side into two
-- individually-signing people (Cody Larsen, Casey Larsen) instead of one combined
-- "Cody & Casey Larsen" signer. Additive to 20260722_personal_loan.sql.

alter table public.personal_loans
  add column if not exists collateral_description text,
  add column if not exists collateral_value numeric,
  add column if not exists lender1_name text,
  add column if not exists lender1_sign_token text unique,
  add column if not exists lender1_signature text,
  add column if not exists lender1_signed_at timestamptz,
  add column if not exists lender2_name text,
  add column if not exists lender2_sign_token text unique,
  add column if not exists lender2_signature text,
  add column if not exists lender2_signed_at timestamptz;

-- Split the seeded "Cody & Casey Larsen" combined lender into two individual
-- signers, and record the collateral pledged against this loan.
update public.personal_loans
set lender1_name = 'Cody Larsen',
    lender2_name = 'Casey Larsen',
    collateral_description = 'Studio 168 — Abilene, TX portfolio',
    collateral_value = 25000
where lender_names = 'Cody & Casey Larsen' and lender1_name is null;
