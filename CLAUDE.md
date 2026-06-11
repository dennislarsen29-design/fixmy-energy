# FixMy.Energy Portal — Project Context

## What This Is
A solar diagnostic / battery retrofit / new solar business portal — admin, ops, and field views.
All portal logic lives in **`portal.html`**. No build step — Netlify deploys the repo as-is.

## Live Site
Deployed on Netlify from the `main` branch.

## Key Files
- `portal.html` — the entire portal (admin, ops, setter, tech, customer views)
- `index.html` — public-facing landing page (Southern California focus, ~814 KB)
- `sign.html` — customer-facing Sign & Pay page (Stripe Elements + agreement signature)
- `book.html` — Google Ads booking funnel (cream/light theme, progressive lead capture)
- `check-preview.html` — installer-specific landing pages for orphaned account marketing
- `careers.html` — job application page
- `onboarding.html` — rep onboarding flow
- `meet.html` — video meeting embed page
- `thank-you.html` — post-booking confirmation
- `manifest.json` — PWA manifest
- `service-worker.js` — offline caching service worker
- `_redirects` — Netlify URL rewrites (SPA routes + installer-specific pages)
- `_headers` — Netlify security headers
- `netlify.toml` — function directory, scheduled functions, per-function timeouts

## Netlify Functions — Complete Reference

### Sign & Pay
- `sign-init.js` — validates `sign_token`, creates Stripe PaymentIntent server-side (amount locked)
- `sign-complete.js` — verifies PaymentIntent, updates Supabase, fires GHL webhook + SMS/email

### GHL (GoHighLevel) Integrations
- `ghl-diag-agreement.js` — upserts GHL contact, adds `send-diag-agreement` tag
- `ghl-inbound.js` — receives inbound GHL webhook payloads (appointment created, status changed)
- `ghl-status-update.js` — receives GHL status webhooks, updates Supabase
- `ghl-calendar.js` — books GHL calendar appointments + upserts contacts
- `ghl-slots.js` — fetches free calendar slots (requires **millisecond** timestamps, not date strings)
- `ghl-book.js` — booking form submission webhook
- `ghl-log-communication.js` — logs SMS/calls to GHL contact timeline
- `ghl-ops-payment.js` — ops payment workflow hooks

### Data Enrichment
- `regrid-lookup.js` — geocodes address + looks up property owner (Regrid → SANDAG → SD City GIS fallback)
- `tracerfy-submit.js` — submits leads to Tracerfy skip-trace API
- `tracerfy-results.js` — polls Tracerfy for skip-trace results
- `tracefy-auto-import.js` — auto-imports completed Tracerfy results into Supabase

### Permit Scraping & Lead Generation
- `permitstack-pull.js` — PermitStack API permit pull (26s timeout configured in netlify.toml)
- `trigger-accela-scraper.js` — triggers `scripts/accela-scraper.js` (local Playwright)
- `check-scraper-run.js` — polls scraper job status
- `notify-photo-upload.js` — notifies assigned rep when customer uploads photos

### AI Agents
- `claude-vision.js` — photo AI categorization via Claude Vision API
- `chat-agent.js` — in-portal conversational CRM assistant (pipeline, stalled leads, rep performance)
- `rep-assistant.js` — field rep sales scripts + objection rebuttals (orphaned account pitches)
- `rep-onboard.js` — new rep onboarding flow
- `aurora-design.js` — Aurora Design AI interface wrapper
- `generate-proposal-insight.js` — AI-powered proposal recommendation generator
- `run-agent-background.js` — generic background agent runner

### Scheduled Agents (background functions, run on cron via netlify.toml)
- `marketing-agent.js` — **Mondays 7am PT** — Google Ads optimization, direct mail recommendations, CPUC letters, pipeline stats; writes to `agent_reports` table
- `bizdev-agent.js` — **Tuesdays 7am PT** — conversion funnel analysis, stalled leads, rep scoring, data quality audit; writes to `agent_reports`
- `bb-auto-pipeline-background.js` — **Daily 2am PDT** — automated orphaned lead pipeline (see Black Box section)
- `socials-agent.js` — social media strategy generation
- `crm-dev-agent.js` — CRM data quality audit agent

### Misc / Utilities
- `lib/push.js` — `sendAgentNotification(agent, count)` helper used by scheduled agents
- `careers-apply.js` — job application form handler
- `push-subscribe.js` — Web Push subscription handler
- `qr-lead.js` — QR code lead capture
- `call-inbound.js` — inbound phone call webhook (Smith.AI; being migrated to Quoya/GHL)
- `meet-init.js` — video meeting setup
- `vapid-setup.js` — Web Push VAPID key endpoint

## Supabase
- Project URL: `https://kbtobyoumvbcxfbugsid.supabase.co`
- Main table: `customers` — all leads and jobs for both FixMy and New Solar
- Other tables: `team_members`, `rep_agreements`, `marketing_expenses`, `portal_credentials`, `agent_reports`, `pipeline_state`
- MCP is configured — use it to run SQL directly instead of asking user to copy/paste
- Anon key is in portal.html as `SUPA_KEY` (safe — protected by RLS)
- Service role key is `SUPA_SERVICE_KEY` Netlify env var (server-side only, never in client code)

### New Tables (added since initial build)
- `agent_reports` — action items from scheduled AI agents: `(agent, title, body, priority, created_at, reviewed, action_url)`
- `pipeline_state` — KV store for scraper/agent state: `(key, value, updated_at)` — keys include `expansion_index`, `last_run_at`, `last_run_summary`, `phase0_insights`, `tracerfy_pending_queue`
- `portal_credentials` — rep access codes (email + code + role mapping)

## Portal Architecture
- `supabase.createClient(SUPA_URL, SUPA_KEY)` — client pattern used everywhere
- `adminCustomers` — global in-memory array of all customer/lead records
- `adminBlackBoxCustomers` — cached orphaned lead list for Black Box popup
- `lead_category` field: `'fixmy'` | `'new_solar'` — drives which pipeline renders
- `sold_type` field: `null` = lead, `'diagnostic'` | `'battery_retrofit'` | `'monitoring'` | `'new_solar'` = job
- `isNSEdit` / `isNSSave` flags gate New Solar-specific fields in editor/save

## Business Lines
### FixMy.Energy (diagnostic / battery retrofit)
9-step pipeline via `step` field:
1. Eval Booked → 2. Photos → 3. Diagnostic → 4. Analysis → 5. Follow Up
6. BR Sold / Deposit Collected → 7. Not Sold / Dead → 8. Install Booked → 9. Monitoring

### New Solar
Pipeline via `solar_status` field using `NS_STATUSES` object:
`ns_eval_booked` → `ns_eval_canceled` → `ns_welcome_scheduled` → `ns_welcome_rescheduled` →
`ns_welcome_dead` → `ns_welcome_closed` → `ns_button_up` → `ns_call_dead` →
`ns_permit_submitted` → `ns_install_scheduled` → `ns_pto`
★ Job phase starts at `ns_welcome_closed`

## Portal Views
- **Admin** — full CRM: leads, jobs, schedule, team, marketing tabs
- **Jobs** (Ops) — Cosmic Solar / Axia / Jon / John see only their assigned jobs
- **Tech/Sales** — setter lead capture + personal dashboard
- **Customer** — magic-link self-service portal

## Tech Portal — Rep ID System
- Each tech sees only their own leads via `rep_id` filter: `.eq('rep_id', person.id)`
- Tech IDs: `tech4` = Dennis Larsen, `tech2` = Ranie, `tech3` = Michael Smith, `rep1` = Ronda, `setter1` = Setter
- Admin can bulk-reassign via ↻ Reassign button → choose tech → "Unassigned only" or "All leads (overwrite)"
- `openReassignModal()` / `runBulkReassign(scope)` in portal.html
- **Action needed:** Admin → Leads → ↻ Reassign → Dennis Larsen → "All leads (overwrite)" to stamp existing leads with tech4

## Ops Partners
```js
var OPS_PARTNERS = [
  { email: 'jon@fixmy.energy',   code: 'jon2026',   name: 'Jon Klos',      id: 'ops1' },
  { email: 'john@fixmy.energy',  code: 'john2026',  name: 'John Espinoza', id: 'ops2' },
  { email: 'cosmic@fixmy.energy',code: 'cosmic2026',name: 'Cosmic Solar',  id: 'ops3' },
  { email: 'axia@fixmy.energy',  code: 'axia2026',  name: 'Axia',          id: 'ops4' },
];
```

## Netlify Configuration (netlify.toml)
- Functions directory: `netlify/functions`
- **Scheduled crons:**
  - `marketing-agent` — `0 14 * * 1` (Mon 7am PT / 14:00 UTC)
  - `bizdev-agent` — `0 14 * * 2` (Tue 7am PT / 14:00 UTC)
  - `bb-auto-pipeline-background` — `0 9 * * *` (Daily 2am PDT / 9am UTC)
- **Function timeouts:**
  - `permitstack-pull`: 26 seconds
- **URL rewrites (_redirects):**
  - SPA routes (`/services`, `/battery`, `/faq`, etc.) → `index.html`
  - Installer pages (`/sunpower`, `/titan`, `/sunnova`, `/mosaic`, etc.) → `check-preview.html?installer=X`
  - `/book` → `book.html` (Google Ads booking funnel)

## Netlify Environment Variables (set in Netlify UI)
- `ANTHROPIC_KEY` — Claude API key for photo AI + scheduled agents
- `REGRID_KEY` — Regrid parcel lookup JWT
- `GHL_API_KEY` — GoHighLevel private integration key
- `GHL_LOCATION_ID` — GHL sub-account location ID: `gXWwbOVymY0iRfj7c1It`
- `GHL_CALENDAR_ID` — GHL top-tier calendar ID
- `GHL_DIAG_CALENDAR_ID` — GHL diagnostic calendar ID: `ZGOdyYdMUh07V1Ujav9R`
- `GHL_TT_WEBHOOK` — GHL webhook URL for Top Tier workflow triggers
- `STRIPE_SECRET_KEY` — Stripe secret key (server-side only) ✅
- `STRIPE_PUBLISHABLE_KEY` — Stripe publishable key (returned to client by sign-init.js) ✅
- `SUPA_SERVICE_KEY` — Supabase service role key (bypasses RLS) ✅
- `TRACERFY_API_KEY` — Tracerfy skip-trace API key
- `PERMITSTACK_API_KEY` — PermitStack permit data API key
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push notification keys
- `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` — set to Google Maps key to bypass scanner

## Google Maps API Key
Stored in portal.html as `GKEY` (client-side). Leave unrestricted — restricting previously broke tech portal.

## GHL Integration
- Location ID: `gXWwbOVymY0iRfj7c1It`
- Diagnostic Calendar ID: `ZGOdyYdMUh07V1Ujav9R`
- Agreement flow: portal calls `ghl-diag-agreement.js` → upserts contact → adds `send-diag-agreement` tag → GHL workflow fires
- Status sync: GHL calls `ghl-status-update.js` with triggers: `invoice_paid`, `invoice_created`, `agreement_signed`, `agreement_sent`
- Scheduling: portal calls `ghl-calendar.js` to book real GHL calendar appointment (so reminders auto-recalculate on reschedule)
- Slots API: `ghl-slots.js` — **IMPORTANT: pass timestamps in milliseconds**, not date strings (fixed 400 error)
- Webhook tester: built into Team tab — tap trigger buttons to seed GHL mapping reference payloads

## Diagnostic Fee Flow (IMPORTANT — do not re-ask)
- Fee modal fires when admin/tech moves a lead to step 3
- Both Admin (`confirmDiagFee`) and Tech/Sales (`confirmSalesDiagFee`) can set the fee
- Both call `ghl-diag-agreement.js` after saving
- Webhook payload format (both admin + tech send identical structure):
  ```js
  { firstName, lastName, full_name: firstName+' '+lastName,  // full_name kept for GHL backward compat
    email, phone, address1: rec.address, diagnostic_fee: fee,
    rep_name, source: 'Diagnostic Fee Set',
    tags: ['diagnostic-fee-set','agreement-pending'],
    customField: { diagnostic_fee: fee, invoice_amount: fee, rep_name } }
  ```
  GHL field mapping: `{{trigger.full_name}}` → First Name, `{{trigger.diagnostic_fee}}` → custom field
- After confirming fee: generates a `sign_token` (UUID, 72hr expiry), saves to Supabase, shows "Sign & Pay Link" popup
- Sign & Pay link format: `https://fixmy.energy/sign?t=TOKEN`

## Sign & Pay Flow (sign.html + sign-init.js + sign-complete.js)
This is the combined customer agreement + payment page. **DO NOT rebuild — it is already built.**

### How it works:
1. Admin/Tech confirms diagnostic fee → `sign_token` generated + stored in `customers.sign_token`
2. Portal shows shareable link popup with Copy + "Text It" buttons
3. Customer opens `fixmy.energy/sign?t=TOKEN` on their phone
4. `sign-init.js` validates token, creates Stripe PaymentIntent server-side (amount locked — client cannot tamper; includes 3.9% Stripe fee)
5. `sign.html` shows: agreement text → typed signature field → Stripe Card Element → "Sign & Pay $X" button
6. Stripe processes card — card data never touches our servers (PCI compliant)
7. On success: `sign-complete.js` verifies PaymentIntent, records IP/user-agent/signature audit trail, updates Supabase (`invoice_status=paid`, `agreement_status=signed`, clears token), fires GHL `diag-signed-and-paid` tag + SMS confirmation
8. Auto-conversion: portal detects `invoice_status=paid` + `agreement_status=signed` → converts lead to `sold_type=diagnostic` job → opens scheduling modal

### Supabase columns for Sign & Pay:
- `sign_token TEXT` — UUID token (nulled out after use)
- `sign_token_expires_at TIMESTAMPTZ` — 72hr from generation
- `stripe_payment_intent_id TEXT` — reused on page reload to avoid duplicate charges
- `agreement_signature TEXT`, `agreement_signed_at TIMESTAMPTZ`, `agreement_ip TEXT`, `agreement_user_agent TEXT`, `repair_auth_initial TEXT` — audit trail

## Payments & Invoicing (IMPORTANT — do not re-ask)
- Stripe is used through GHL Payments integration for existing flows
- GHL's combined sign+pay document does NOT charge the card — it only captures CC info. Do NOT use this.
- The Sign & Pay page (sign.html) IS the correct all-in-one solution — already built
- `invoice_url` is currently set manually; automated GHL invoice creation is a future item

## Auto-Conversion to Diagnostic Job
Triggered in `saveLeadEditor` when: `!cRec.sold_type && invoice_status === 'paid' && agreement_status === 'signed'`
- Sets `sold_type = 'diagnostic'`
- Opens `openDiagSchedulingModal` to assign ops partner + set date/arrival window
- Scheduling fires `ghl-calendar.js` to book GHL appointment

## Diagnostic Scheduling Modal
`openDiagSchedulingModal(id, rec)` + `confirmDiagSchedule(id, rec)`:
- Ops partner picker, date field, arrival start/end time
- Saves `diagnostic_date`, `arrival_window`, `assigned_ops` to Supabase
- Books GHL calendar appointment via `ghl-calendar.js`
- Formats arrival window as "10 AM – 1:30 PM"

## Pending Action Banners (Lead Editor)
Red/amber banners at top of editor when:
- `agreement_status === 'sent'` or `'pending'` → red banner with "View Agreement" + "Resend" button
- `invoice_status === 'sent'` or `'pending'` or `'overdue'` → amber banner with "View Invoice" + "Copy Link" button
- `edResendAgreement(id)` re-fires `ghl-diag-agreement.js`
- `edResendInvoice(id)` copies `invoice_url` to clipboard

## Black Box System (Orphaned Lead Canvassing)
The Black Box is the automated orphaned-account lead pipeline. Admin popup shows geocoded leads for door-to-door canvassing with GPS routing.

### Automated pipeline (`bb-auto-pipeline-background.js`, runs daily 2am PDT):
- **Phase 0 (AI intelligence):** Claude Haiku analyzes existing orphaned leads, generates insights, adds installer name variants — stored in `pipeline_state.phase0_insights`
- **Phase 1a:** Socrata API (legacy SD open data — skip if PermitStack active)
- **Phase 1b:** PermitStack OC/Riverside (activated at `expansion_index` ≥20 OC, ≥54 Riverside)
- **Phase 1c:** PermitStack SD cities (16 cities, ~5 min budget per run)
- **Phase 1d:** Socrata SD County unincorporated areas
- **Phase 2:** Owner enrichment — SANDAG + Regrid + Census geocoding fallback chain; stores `lat`/`lng` + `title_owner`
- **Phase 3:** Tracerfy skip-trace — submits leads, polls up to 4 min; stores phone/email from results
- De-duplication via `normAddr()` (lowercase + normalize spaces)
- Lead scoring: `lead_score` 0–100 based on system age + installer risk tier
- Geographic expansion queue: SD County zips → OC south/coastal → OC central → Riverside (Temecula basin); 5 new zips per run; current position in `pipeline_state.expansion_index`

### Admin portal Black Box popup:
- `showBlackBoxPopup()` — fetches geocoded orphaned leads (`black_box=true`, `lat IS NOT NULL`)
- Admin batch geocoder: geocodes un-geocoded leads via Regrid
- Renders lead cards with address, installer, score, GPS route button
- GPS routing opens Google Maps directions on mobile

### Key customers columns for Black Box:
- `black_box BOOLEAN` — flags lead as orphaned/canvassing target
- `lat FLOAT`, `lng FLOAT` — geocoded coordinates
- `lead_score INTEGER` — 0-100 composite score
- `original_installer TEXT` — defunct installer name from permit
- `install_year INTEGER` — system installation year
- `enrichment_source TEXT` — which data source populated the record

## Scheduled AI Agents
All agents write action items to the `agent_reports` table and send push notifications via `lib/push.js`.

### marketing-agent.js (Mondays 7am PT)
- Analyzes 30-day pipeline stats + 90-day zip-level performance
- Writes Google Ads optimization recommendations (RSA headlines, descriptions, keywords, geo-targeting)
- Generates CPUC/SDG&E public records request letters
- Recommends direct mail campaigns + referral payouts
- Priorities: `urgent` | `high` | `normal`

### bizdev-agent.js (Tuesdays 7am PT)
- Conversion funnel analysis (FixMy vs New Solar pipelines)
- Stalled leads re-engagement (14+ days old, non-dead stages)
- Rep performance scoring (leads → jobs by setter/rep)
- Referral health audit (incentives owed)
- Data completeness audit (missing phone/email/address/invoice/ops)
- Pipeline anomalies + 12-week volume trends

### Agent Reports (portal Team tab)
- Admin reviews action items in the Team tab
- Each report has `priority`, `title`, `body`, `action_url`, `reviewed` flag
- `reviewed=true` archives the item

## Skip-Trace (Tracerfy) Integration
- `tracerfy-submit.js` — batch-submits leads missing contact info
- `tracerfy-results.js` — polls API for completed results
- `tracefy-auto-import.js` — automatically imports results back into Supabase
- Pending queue stored in `pipeline_state` table (`tracerfy_pending_queue`)
- Only submits leads with address + `title_owner` but no phone/email

## Book.html — Google Ads Booking Funnel
Separate from the main site, optimized for mobile Google Ads traffic.
- Cream/light theme matching Solar Review branding
- "15 Point Solar Inspection" offer + 5.0 Google Reviews chip
- Progressive lead capture: captures partial data (name, address) before asking for phone
- Fetches available slots from GHL calendar via `ghl-slots.js`
- On slot selection: fires `ghl-book.js` to book appointment + upsert GHL contact
- All "Book an Evaluation" CTAs on index.html route to `/book`

## Commission Calculation
`calcRepCommission(rec)` in portal.html uses `project_costs` (actual costs saved per job) instead of a hardcoded $250 base. Finance tab displays per-rep commission breakdown.

## Netlify MCP Setup
- Official Netlify MCP: `@netlify/mcp` (npx)
- Configured in `.claude/settings.json` (mcpServers.netlify, no token in file)
- `NETLIFY_PERSONAL_ACCESS_TOKEN` stored in `.claude/settings.local.json` under `env` key (gitignored)
- User needs to replace `PASTE_YOUR_PAT_HERE` with actual PAT from Netlify → User settings → Applications → Personal access tokens

## PWA (Progressive Web App)
- `manifest.json` — app name, icons, theme color, display mode
- `service-worker.js` — caches key assets for offline access
- Push notifications: `push-subscribe.js` + `vapid-setup.js` + `lib/push.js`
- Agents use `sendAgentNotification()` to alert admin on mobile when reports are ready

## customers Table — Key Columns
Standard: `id, first_name, last_name, email, phone, address, notes, created_at`
Pipeline: `step, solar_status, lead_category, sold_type`
Scheduling: `diagnostic_date, install_date, arrival_end, arrival_window, install_type`
Financial: `invoice_status, invoice_number, invoice_amount, invoice_url, invoice_items, project_costs`
Deposit: `deposit_status, deposit_amount, ops_milestone1_status, ops_milestone1_amount`
Assignment: `assigned_ops, ops_payout_status, rep_id, setter_name`
Lead info: `lead_source, referred_by, referral_incentive_paid, lead_temp, dnc`
Title: `title_owner, apn, title_confirmed, assessed_value, tax_delinquent`
Solar: `system_size, utility, monthly_bill, nem_status, original_installer, install_year`
Agreement: `agreement_status, agreement_url, agreement_signed_at, agreement_signature, agreement_ip, agreement_user_agent, repair_auth_initial`
Sign & Pay: `sign_token, sign_token_expires_at, stripe_payment_intent_id`
Geo/Enrichment: `lat, lng, lead_score, black_box, enrichment_source`

## Referral Incentive Feature
- When `lead_source = 'referral'`, setter enters referring customer name in `referred_by`
- Admin editor shows incentive status dropdown (Pending / Paid)
- When `solar_status = 'ns_pto'` and `referral_incentive_paid = false`, admin card shows amber "$1K Incentive Due" badge
- `referral_incentive_paid = true` shows green "Incentive Paid" badge

## Deposit / Ops Milestone Tracking (FixMy only)
- `deposit_status`: none | sent | pending | paid
- `deposit_amount`: numeric
- `ops_milestone1_status`: none | paid
- `ops_milestone1_amount`: numeric
- Shown in Ops portal job cards as two payment rows: Customer→Solar Review, Solar Review→Partner

## Photo AI Categorization
- Upload triggers `quoyaAutoAssess(file)` → POST to `/.netlify/functions/claude-vision`
- Uses `claude-sonnet-4-6` model
- Categories: MSP Step Back Photo, MSP Sticker Photo, Panel Placard, Battery Placement Wall Photo,
  Sub Panel, Sub Panel Sticker Photo, Inverter Photo, Solar Array, Utility Bill,
  Front of House, Attic, Additional Photos

## Aurora Solar Integration
- New Solar leads at job-phase statuses show an Aurora card with Launch + copy-name + copy-address buttons
- `AURORA_ELIGIBLE` statuses: ns_welcome_scheduled through ns_pto
- `aurora-design.js` function wraps Aurora Design AI for proposal generation

## Marketing Tab
- `marketing_expenses` table tracks direct mail spend
- Zip-code matching against customer addresses attributes revenue to campaigns
- `lead_source` field on customers tracks attribution: direct_mail | self_generated | referral | inbound_web

## Known Pending Items

### High Priority
- **CPUC NEM data — online PRR submission (HIGH PRIORITY):** CPUC responded directing submission through their online PRR portal at cpuc.ca.gov. Have not submitted yet. Same content as draft letter below. DO NOT submit until online form and attachment requirements are confirmed.
- **Lead capture / funnel tracking broken (HIGH PRIORITY):** Google Sheets lead capture broken — sends to booking confirmation instead of capturing partial leads. Need partial captures tracked separately for retargeting. Facebook/Instagram pixel not yet built — low-hanging retargeting fruit.
- **Google Ads video creative (HIGH PRIORITY):** Current video ads are low quality. (Dennis action item — not a dev task.)

### Medium Priority / On Hold
- **GHL AppointmentCreate webhook → portal:** When customer books via `/book` calendar, GHL should fire back to `ghl-inbound.js` so `diagnostic_date` populates. In GHL: Automations → "FixMy Energy Solar Appointment Confirmation" → add Webhook action to `https://fixmy.energy/.netlify/functions/ghl-inbound`. GHL config only — no code change needed.
- **Google Maps API key restriction:** Leave unrestricted for now (restriction previously broke tech portal).
- Battery Retrofit Agreement flow (needs agreement template content from Dennis)
- Top Tier pipeline (planned — see plan file)
- Antoinette M2/M3 milestone invoicing (planned — see plan file)
- **GHL field mapping (optional cleanup):** Change First Name from `{{trigger.full_name}}` → `{{trigger.firstName}}`, add Last Name → `{{trigger.lastName}}`
- **fixmy.energy/check:** Live at `/check` (redirects to FAQ); installer pages at `/sunpower`, `/titan`, `/sunnova`, `/mosaic`, etc.
- **CEC GoSolar / CSI bulk CSV:** Download from cpuc.ca.gov → Industries → Electrical Energy → Demand Side Management → California Solar Initiative → CSI Data. Paste into Import tab.
- **Accela scraper (local Playwright):** `scripts/accela-scraper.js` — SD DSD, Chula Vista, Oceanside. Run: `node scripts/accela-scraper.js`. See scripts/README.
- **SD County permit data pull + scoring model walkthrough:** Not yet delivered
- **Minuteman Press direct mail strategy doc:** Not yet delivered
- **Golf course solar panel protection:** See Future Services section
- **GTM conversion tracking audit:** GTM-TSJVG2GT installed. Verify GA4 + Google Ads conversion events fire on booking completion using Tag Assistant. (Likely related to broken lead capture.)
- **Switch from Smith.AI to Quoya:** `call-inbound.js` can be repurposed. GHL Quoya migration half-done. Finish Quoya workflow for inbound calls + missed-call SMS.
- **Customer photo upload SMS:** `notify-photo-upload.js` built. Decision: use GHL LC Phone over Twilio. Needs GHL workflow built to replace Twilio path. Rep phones in `team_members`: Dennis Larsen (tech4), Cristina Huang (tech5).
- **agent_reports UI:** Admin Team tab shows reports but UX needs polish — bulk mark-as-reviewed, filter by priority.

### Deferred (budget/timing)
- **BBB accreditation:** Deferred — build revenue first. Apply at bbb.org/apply (~$400-600/yr).
- **GHL SMS/calendar workflows:** Skipping automation for now.

### Completed ✅
- **book.html mobile CTA page** — built, live at `/book`, all CTAs routing there
- **Southern California rebrand** — "San Diego" → "Southern California" across all public pages and AI agents
- **Black Box geocoding + canvassing UI** — built in portal (admin popup with GPS routing)
- **GHL slots API fix** — millisecond timestamps fix for 400 error
- **Commission calc fix** — now uses actual `project_costs` field

## SMS Tooling Decision — GHL LC Phone over Twilio
**Use GHL's built-in LC Phone — do not set up Twilio.**

- GHL subscription already paid; LC Phone ~$0.008/segment, no extra monthly fee
- Twilio adds unnecessary vendor overhead
- Exception: only use Twilio for programmatic SMS from Netlify functions that can't reach GHL

**Action needed:** Build GHL workflow that fires when `notify-photo-upload.js` fires → sends SMS to assigned rep via LC Phone. Remove Twilio path from function once GHL workflow is live.

## Future Services

### Golf Course Solar Panel Protection
**Status: Concept — not yet scoped or offered.**

Protection options: polycarbonate shields, heavy-gauge wire mesh, sacrificial glass overlay, array repositioning.
Ops partner: ask Cosmic Solar first; if not comfortable, source fabrication-capable partner.
Lead ID: filter `address` near known SD golf courses. Add `golf_course_exposure` boolean to customers table at launch.

## Orphaned Account Marketing Strategy
Five-channel approach targeting homeowners whose solar installer went out of business:
1. **Permit data** — pull by defunct contractor names via PermitStack/Accela, apply lead scoring
2. **CPUC NEM data** — public records request (draft letter below)
3. **Batch CSV import** — Admin → Import tab → Regrid enriches with owner + APN → import as `fixmy / direct_mail`
4. **fixmy.energy/check** — orphaned account landing page (`check-preview.html`)
5. **Direct mail** — Minuteman Press postcards to enriched list

Target installers: SunPower (Ch. 11 Aug 2024), Titan Solar (Ch. 7 Jun 2024), Sunnova (Ch. 11 Jun 2025), Mosaic Solar Loans (Ch. 11 Jun 2025), Sullivan Solar (shut down Oct/Nov 2021), Petersen Dean (Ch. 11 Jun 2020), Sungevity (Ch. 11 Mar 2017), Freedom Forever (Ch. 11 Apr 15, 2026)

## Defunct Solar Installer Database (Marketing Agent Reference)

### Priority 1 — Truly Orphaned (no active service entity)

| Company | Event | Date | CA Customers | Permit Name Variations |
|---|---|---|---|---|
| SunPower | Ch. 11 → sold assets | Aug 5, 2024 | ~600,000 US | "SunPower Corporation", "Complete Solar Inc", "BRS Field Ops" |
| Titan Solar | Ch. 7 liquidation | Jun 20, 2024 | 150,000+ / 22 states | "Titan Solar Power", "Titan Solar" |
| Sunnova | Ch. 11 bankruptcy | Jun 9, 2025 | ~500,000 US | "Sunnova Energy International", "Sunnova Energy" |
| Sullivan Solar | Shut down (no BK) | Oct/Nov 2021 | 9,000+ (SD only) | "Sullivan Solar Power", "Sullivan Solar Power of California" |
| Petersen Dean | Ch. 11 bankruptcy | Jun 11, 2020 | Thousands (CA) | "Petersen-Dean", "Petersen Dean", "Red Rose Inc", "PetersenDean" |
| Sungevity | Ch. 11 bankruptcy | Mar 14, 2017 | Tens of thousands | "Sungevity Inc", "Horizon Solar Power", "Solar Spectrum" |
| Kota Energy | Shut down ~2022 | ~2022 | AZ/TX/UT/NM focus | "Kota Energy Group LLC", "Kota Energy Group" |
| OneRoof Energy | Shut down 2016 | 2016 | CA focused | "OneRoof Energy Inc" |
| Verengo | Shut down 2014 | 2014 | CA only (SD/LA) | "Verengo Inc", "Verengo Solar" |
| American Solar Direct | Shut down 2019 | 2019 | CA only | "American Solar Direct Inc" |
| ADT Solar | Shut down 2023 | Jan 2023 | 22 states | "ADT Solar LLC" |
| RGS Energy | Delisted/defunct | 2019 | Multi-state | "Real Goods Solar Inc", "RGS Energy", "Alteris Renewables" |
| Pink Energy | Ch. 7 | Oct 2022 | 17 states | "Pink Energy" |
| Vision Solar | Ch. 7 | Jul 2021 | Multi-state | "Vision Solar" |
| Lumio | Ch. 11 bankruptcy | Mar 2024 | Multi-state (CA included) | "Lumio Inc", "1st Light Energy" |
| Freedom Forever | Ch. 11 bankruptcy | Apr 15, 2026 | Multi-state | "Freedom Forever LLC" |
| Mosaic Solar Loans | Ch. 11 (LENDER only) | Jun 6, 2025 | 500,000+ (financed) | N/A — lender, not installer |

### Priority 2 — Acquired/Managed (lower priority — successor handling service calls)

| Company | Status | Successor |
|---|---|---|
| Vivint Solar | Acquired by Sunrun 2021 | Sunrun |
| SolarCity | Acquired by Tesla 2016 | Tesla Energy |
| Complete Solar | Acquired SunPower assets 2024, rebranded | Active as "SunPower" |

### PermitStack Pull Notes
- SunPower rarely listed as "SunPower" on permits — use "Complete Solar Inc" or "BRS Field Ops"
- SD County zip filter: 919xx + 920xx
- System size kW extracted from permit description text via regex when not a dedicated field
- Mosaic is a LENDER not installer — leads = homeowners with outstanding loans, not broken systems
- Portal Import tab → "Pull Live from PermitStack" fires `permitstack-pull.js` per installer, deduplicates by address

## CPUC / SDG&E NEM Data — Public Records Request Draft

**Status: Email sent to CPUC; CPUC directed to online PRR portal. Online submission pending.**

### Option A — CPUC (send to `public.records@cpuc.ca.gov`, ~10 business days)
**Subject:** `Public Records Act Request — NEM Interconnection Data (SDG&E Service Territory)`

California Public Utilities Commission  
Attn: Public Records Office  
505 Van Ness Avenue, San Francisco, CA 94102

Re: California Public Records Act Request — Net Energy Metering (NEM) Interconnection Data, SDG&E Service Territory

To Whom It May Concern,

Pursuant to the California Public Records Act (Gov. Code § 7920.000 et seq.), I respectfully request all NEM interconnection application and approval data for residential solar installations within the SDG&E service territory, filed between January 1, 2015 and December 31, 2023. Specifically:

1. Service address (street address and ZIP code — census tract or block group acceptable if address is withheld)
2. Interconnection approval date
3. Installed system size (kW-DC or kW-AC)
4. Installing contractor or solar company name as reported on the application
5. NEM tariff type (NEM 1.0, NEM 2.0, NEM-A)

**Purpose:** Solar Review Corp (operating as FixMy.Energy) provides independent solar diagnostic, repair, monitoring, and battery retrofit services to San Diego County homeowners. A significant number of residential solar customers in the SDG&E territory were left without support when their original installers — including SunPower (Chapter 11, 2024), Sullivan Solar Power (closed 2021), Petersen Dean (closed 2020), and Sungevity (closed 2017) — ceased operations. We are using this data solely to identify affected households so we can offer them a path to restore full system performance. We have no intention of publishing, reselling, or sharing this data.

**Format:** CSV, Excel, or pipe-delimited text preferred.

**Fee Waiver Request:** Disclosure primarily benefits the public by facilitating the repair and continued operation of existing distributed energy resources — directly supporting California's clean energy goals. If a waiver is not granted, please provide a cost estimate before proceeding. If any portion is denied, please specify which exemption applies and provide all non-exempt portions.

Dennis Larsen  
Solar Review Corp / FixMy.Energy  
[phone] · dennis@fixmy.energy

---

### Option B — SDG&E Direct (faster, send to `regulatory@sdge.com`)
**Subject:** `CPRA Request — Residential NEM Interconnection Records, 2015–2023`

SDG&E files quarterly NEM data with CPUC and maintains it in structured form. Cite the same CPRA authority (Gov. Code § 7920.000 et seq.) and request the same five fields. Same purpose and fee waiver language as Option A.

## Common Patterns
```js
// Null guard for conditionally-rendered fields (prevents TypeError on NS leads)
(document.getElementById('edSys')||{}).value||null

// NS vs FixMy guard in saveLeadEditor
var isNSSave = cRec.lead_category === 'new_solar';
if (!isNSSave) { updates.deposit_status = ...; }

// Supabase client
var client = supabase.createClient(SUPA_URL, SUPA_KEY);
var { data, error } = await client.from('customers').update(updates).eq('id', id);

// Scheduled agent report write
await client.from('agent_reports').insert({ agent: 'marketing-agent', title, body, priority, action_url });

// pipeline_state KV read/write
var { data } = await client.from('pipeline_state').select('value').eq('key', 'expansion_index').single();
await client.from('pipeline_state').upsert({ key: 'expansion_index', value: idx, updated_at: new Date() });
```
