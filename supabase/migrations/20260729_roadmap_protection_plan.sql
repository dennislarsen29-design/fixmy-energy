-- ═══ New roadmap task: Extended Warranty / Protection Plan offering (2026-07-29, per Dennis) ═══
-- Reviewed from Align_Solar_Protection_Contract_Extract.pdf (ASP-SSC-1 V1-0126). Carries its own
-- build prompt with the full contract research so the board's 📋 Prompt button works without a
-- PROMPTS entry.
insert into public.roadmap_items
  (key, title, description, dennis_action, group_key, status, priority, effort, sort, source, prompt) values
  ('protection-plan-offering',
   'Extended Warranty / Protection Plan Add-On (Align Solar Protection)',
   'Offer an extended-warranty/protection-plan add-on (mechanical-breakdown service contract, NOT insurance) during install package offerings on battery retrofit and new-solar tickets. Reviewed from Align Solar Protection''s sample contract (ASP-SSC-1 V1-0126) -- the same product Top Tier already resells, per the sample declaration page issued through Top Tier Solar Solutions. Natural upsell tie-in: the contract requires a qualifying system inspection before it''s enforceable, which Solar Review''s existing diagnostic visit could double as.',
   'Contact Align Solar Protection directly (or confirm/formalize the existing relationship through Top Tier, if it''s the same underlying product) to become an authorized Retail Seller/Service Partner for Solar Review/FixMy; get the real current rate sheet and dealer margin -- the reviewed extract is one sample declaration, not a price list; confirm whether Solar Review''s own diagnostic report can serve as the qualifying system inspection or if Align requires their own Service Partner to inspect.',
   'crm', 'todo', 3, 'medium', 7, 'manual',
   'Add an Extended Warranty / Protection Plan add-on offering (Align Solar Protection) to the FixMy.Energy / Solar Review portal, offered during install package offerings on battery retrofit and new-solar tickets.

CONTEXT — what the reviewed document actually is
Dennis shared Align_Solar_Protection_Contract_Extract.pdf (ASP-SSC-1 V1-0126, a sample declaration + full terms). Key facts, verified against the document text itself:
- It is a "Solar System Service Contract" — the contract explicitly states "This is not a contract of insurance." Align Solar Protection, Inc. (11456 S Temple Dr, Ste 300, South Jordan, UT 84095) is the OBLIGOR; the OBLIGOR''s payment obligations are themselves insured by American Bankers Insurance Company of Florida, Inc.
- It is designed to be white-label resold by installers: the contract''s own definitions include a "RETAIL SELLER/INSTALLER/SERVICE PARTNER" role — the entity that sells the contract to the homeowner. The sample declaration page in the extract is already issued through "Top Tier Solar Solutions" (855) 997-1213 — the SAME Top Tier that is an existing Solar Review sales channel (see the Top Tier section of CLAUDE.md). This may already be a product Top Tier resells today; the ask is whether Solar Review/FixMy can get its own direct dealer relationship the same way Credit Human/Service Finance dealer accounts were pursued (see those two roadmap items for the identical pattern: don''t rely on a partner''s dealer number, get your own).

PRICING / TERM (sample only, not a rate sheet)
- Contract purchase price in the sample: $499.00 flat.
- Non-refundable inspection fee: $99 (may be included in the total price).
- Deductible: $0.
- Term length: 5 (five) years.
- Get the actual current rate sheet and dealer margin from Align before building anything — this extract is one filled sample, not a price list.

COVERAGE
Mechanical breakdown only (defined as failure of a covered part to perform its designed function due to defects in material or original manufacturer workmanship — explicitly NOT gradual wear/tear, NOT failure to meet performance expectations):
- Solar PV panels, less than 15 years old at contract purchase.
- Microinverters or optimizers, less than 15 years old.
- String/central inverters, less than 7 years old.
- Miscellaneous: brackets, fasteners, racking (no coverage for damage caused by freight carriers).
Labor covered up to $100/hour. Diagnostic charges covered up to $100 per covered claim. Service call expenses covered up to $300, max 2 service calls per covered repair. A narrow "consequential damage" clause covers parts/labor to restore the roof to weather-tight condition ONLY if incidental damage occurs during a covered repair — no other consequential damage is covered.

ENROLLMENT REQUIREMENT — natural fit with the existing diagnostic visit
The contract only becomes enforceable after Align completes a review of a system inspection (an "Align Solar Protection System Verification Report" prepared by an authorized Service Partner) confirming the system meets their age/condition standards, AND full payment, AND any mandatory waiting period passes. If the system fails to meet standards, the contract isn''t enforceable until repaired to spec (60 days to fix, or refund minus the $99 inspection fee). This inspection requirement is a natural fit with Solar Review''s existing diagnostic visit — the diagnostic itself could double as, or directly feed, the qualifying inspection, making this a same-visit upsell rather than a separate appointment. Confirm with Align whether Solar Review''s own diagnostic report can serve this purpose or whether their own Service Partner must physically inspect.

ELIGIBILITY GATES — this is not a universal upsell on every job
To qualify for coverage, remaining manufacturer warranty at the contract purchase date must be:
- Solar PV modules: at least 10 years remaining.
- String/central inverters: at least 5 years remaining.
- Microinverters/optimizers: at least 10 years remaining.
A meaningfully aged system, or one near the end of its manufacturer warranty, will not qualify — relevant because a large share of Solar Review''s core business is orphaned/defunct-installer systems that are often already many years old. This should be screened for before pitching the add-on, not offered blindly on every ticket. Also: the homeowner must provide Align with ongoing remote monitoring access to the system, and must keep up with the manufacturer''s recommended maintenance schedule (failure to do so within 90 days of when maintenance was due can void coverage, and proof of compliance — not handwritten receipts — is required at claim time).

WHAT IS NOT COVERED — flag clearly to Dennis, do not misrepresent these to customers
Pre-existing conditions; any part not specifically listed as covered; overtime/holiday/emergency labor; damage from failure to maintain per manufacturer spec; incidental/consequential damages INCLUDING LOST OR REDUCED SOLAR PRODUCTION (this plan does not protect against underperformance, only outright mechanical failure); punitive damages; main service panel/breaker issues, conduit/j-box wiring, low-voltage conditions, monitoring connection issues, non-authorized PPA/leased systems, production guarantees, reroofing, roof penetrations beyond 3" outside the roof attachment, roof damage (if the roof was altered post-install), firmware updates, unverified system expansions, water damage from ice dams, improper installation; damage to covered parts caused by non-covered parts; anything covered by another warranty/insurance/manufacturer recall; unauthorized repairs; routine maintenance; roof damage even if it happens during an authorized covered repair; non-OEM replacement parts. The contract is non-transferable if the home is sold.

CANCELLATION
Buyer can cancel any time. Within 30 days: full refund minus the $99 inspection fee (if applicable) minus any claims paid. After 30 days: prorated refund based on elapsed time minus claims paid, plus a $50 administration fee — BUT this varies significantly by state; the contract carries its own state-specific disclosure amendments for roughly 40+ states. California specifically: prorated refund minus the LESSER of $25 or 10% of the purchase price, no separate $50 fee, and the buyer can cancel for any reason including the system being sold/lost/stolen/destroyed. The product is already built to be sold and remain compliant multi-state — directly relevant to the earlier-discussed Texas expansion, since this wouldn''t need separate state-by-state legal work to extend there.

BUILD STEPS
1. Confirm actual dealer/reseller terms directly with Align Solar Protection (or confirm/formalize the existing relationship through Top Tier if that''s the same underlying product) — get the real rate sheet, dealer margin, and enrollment process; this extract is a sample contract, not an enrollment guide.
2. Decide where in the Solar Review flow to offer this: a post-diagnostic upsell conversation, a line item in the proposal builder (matching the existing Reroof category-box pattern in the builder — see CLAUDE.md''s Reroof section for the analogous UI/data pattern), and/or an add-on step in the Sign & Pay flow.
3. Add customer-record fields mirroring the financing_status/financing_provider pattern already planned for Credit Human/Service Finance: protection_plan_status (none|offered|enrolled|declined) and protection_plan_provider (align_solar_protection|other), plus whatever identifiers Align''s enrollment process requires (contract/dealer reference number).
4. Screen eligibility before offering it — don''t pitch this on a system that''s already too old to qualify per the warranty-remaining gates above; a wasted pitch on an ineligible system undermines trust right after a diagnostic.
5. Do NOT market this as "insurance" anywhere in customer-facing copy. The contract itself is explicit that it is not a contract of insurance — Solar Review should not misrepresent that distinction either, for the same reason CLAUDE.md''s finance-agent tax guidance always says "verify with a licensed professional": getting a regulated-product distinction wrong creates real compliance exposure, not just a wording nitpick.
6. Once dealer terms are confirmed, document the flow in CLAUDE.md and mark this roadmap item done.')
on conflict (key) do nothing;
