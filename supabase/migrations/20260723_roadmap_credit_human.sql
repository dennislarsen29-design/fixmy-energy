-- ═══ New roadmap task: direct financing via Credit Human (2026-07-23, per Dennis) ═══
-- Stand up Solar Review's own consumer financing instead of routing through Cosmic's
-- credit-union referral. Credit Human is the leading option. Carries its own build
-- prompt in the prompt column so the board's 📋 Prompt button works without a PROMPTS entry.
insert into public.roadmap_items
  (key, title, description, dennis_action, group_key, status, priority, effort, sort, source, prompt) values
  ('credit-human-financing',
   'Direct Financing — Credit Human (own it, drop the Cosmic referral)',
   'Stand up Solar Review''s own consumer financing so batteries, retrofits, and new-solar can be financed directly instead of through Cosmic''s credit-union referral program. Credit Human is the leading candidate. Wire the financing application into the proposal + Sign & Pay flow and give reps a one-tap link, mirroring the existing Top Tier Service Finance quick-link.',
   'Apply for the contractor/dealer solar-lending program with Credit Human (credithuman.com), then share the dealer/partner ID + application URL so it can be wired into the portal.',
   'finance', 'todo', 2, 'large', 5, 'manual',
   'Add a direct consumer-financing option to the FixMy.Energy / Solar Review portal using Credit Human (replacing reliance on Cosmic''s credit-union referral).

Context:
- portal.html is the single-file portal. The Top Tier editor already has a "Service Finance Application" quick-link pattern (copies a dealer # to clipboard + opens the lender site) — mirror that pattern for Credit Human.
- sign.html + sign-init.js + sign-complete.js handle the customer Sign & Pay flow (card / ACH / check). Financing would be an additional path to offer on larger tickets (battery retrofits, new solar).
- Proposal builder lives in portal.html (_prop* functions); proposals already show a retail price.
- Dennis will provide the Credit Human dealer/partner ID and the application URL.

Steps:
1. Ask Dennis for the Credit Human dealer ID + application link (and whether they have an API or it is a hosted application URL only).
2. Add a "Finance with Credit Human" quick-link in the admin + tech proposal/editor UI: copies the dealer ID to clipboard and opens the Credit Human application in a new tab (mirror the Service Finance button in the Top Tier tools block).
3. On the customer proposal + Sign & Pay page, add a "Apply for financing" option for eligible tickets that deep-links to the Credit Human application prefilled with amount where the hosted form supports query params.
4. Track financing status on the customer record (add a financing_status / financing_provider field if needed) so admin can see who applied / was approved.
5. Document the flow in CLAUDE.md and commit + push to the assigned branch.

Deliver a plan first, then implement once Dennis confirms the dealer ID and whether an API is available.')
on conflict (key) do nothing;
