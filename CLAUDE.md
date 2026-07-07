# FixMy.Energy Portal — Project Context

## What This Is
A single-file admin + field portal for a solar diagnostic / battery retrofit / new solar business.
All logic, HTML, CSS, and JS lives in **`portal.html`**. There is no build step — Netlify deploys the repo as-is.

## Live Site
Deployed on Netlify from the `main` branch. Active feature branch: `claude/fixmy-energy-setup-R9lDn`.

## Key Files
- `portal.html` — the entire portal (admin, ops, setter, tech, customer views)
- `index.html` — public-facing landing page
- `sign.html` — customer-facing Sign & Pay page (Stripe Elements + agreement signature)
- `netlify/functions/claude-vision.js` — proxies Anthropic API calls (photo AI categorization)
- `netlify/functions/regrid-lookup.js` — proxies Regrid parcel lookup (keeps API key server-side)
- `netlify/functions/ghl-calendar.js` — books GHL calendar appointments + upserts contacts
- `netlify/functions/ghl-diag-agreement.js` — upserts GHL contact + adds `send-diag-agreement` tag
- `netlify/functions/ghl-inbound.js` — receives inbound GHL webhook payloads
- `netlify/functions/ghl-status-update.js` — receives GHL status webhooks, updates Supabase
- `netlify/functions/sign-init.js` — validates sign_token, creates Stripe PaymentIntent server-side
- `netlify/functions/sign-complete.js` — verifies payment success, marks invoice paid + agreement signed
- `.claude/settings.local.json` — gitignored; holds Netlify PAT env var + Supabase MCP permissions

## Supabase
- Project URL: `https://kbtobyoumvbcxfbugsid.supabase.co`
- Main table: `customers` — holds all leads and jobs for both FixMy and New Solar
- Other tables: `team_members`, `rep_agreements`, `marketing_expenses`
- MCP is configured — use it to run SQL directly instead of asking user to copy/paste
- Anon key is in portal.html as `SUPA_KEY` (safe — protected by RLS)
- Service role key is `SUPA_SERVICE_KEY` Netlify env var (server-side only, never in client code)

## Portal Architecture
- `supabase.createClient(SUPA_URL, SUPA_KEY)` — client pattern used everywhere
- `adminCustomers` — global in-memory array of all customer/lead records
- `lead_category` field: `'fixmy'` | `'new_solar'` — drives which pipeline renders
- `sold_type` field: `null` = lead, `'diagnostic'` | `'battery_retrofit'` | `'monitoring'` | `'new_solar'` = job
- `isNSEdit` / `isNSSave` flags gate New Solar-specific fields in editor/save

## Business Lines & Accounting SOPs (2026-07-07, per Dennis — AUTHORITATIVE)
These are Standard Operating Procedures. Do not re-ask how the business lines work.

### 1. FixMy.Energy (internal line name; customer-facing brand is Solar Review)
- **Services:** Diagnostics, Inverter Swaps, Warranty Replacements, Batteries.
- **Revenue:** Solar Review charges the CUSTOMER directly for diagnostics, inverter swaps, warranty replacements, and battery sales **when batteries are sold in-house**. Going forward, **Cosmic charges the customer for battery sales** (battery revenue shifts out of Solar Review's books when Cosmic sells/charges).
- **Accounting requirements:**
  - Track revenue (payments ledger — `payments` table).
  - Track operations costs of doing business per job ("sub sheet"): pending vs completed payments to ops/partners.
  - Rep commissions on sold jobs for ALL sales reps EXCEPT Dennis (Dennis-sold = no commission).
  - Future: monthly net must break out into equity distributions (design for it; don't block on it).
  - Reports must be real, easy to follow for accounting + payroll. Automate as much as possible.

### Commission math (2026-07-07, per Dennis — AUTHORITATIVE)
- **FixMy rep commission:** `Revenue − Sub-Sheet Costs = Net Revenue`; rep earns **40% of Net Revenue**. Dennis-sold jobs (rep_id `tech4`) = no commission. Commission finalizes only after job costs are entered — costs first, then commission.
- **Top Tier / New Solar sold commissions:** entered MANUALLY per deal when the provider confirms.
- **Manager overrides (TT + NS):** paid TO Dennis — they are 1099 income to **Solar Review Corp**, not payouts. Track as receivables: override sold (owed to SRC) vs received.
- **Travel reimbursements:** Top Tier only, manual entries, owed to the rep.
- Data model: `job_costs` (per-job pending/paid cost line items) + `commissions` (kind: rep_commission | override | travel_reimbursement; status: sold | paid) tables — migration `20260707_accounting.sql`.

### 2. Top Tier
- **Model:** sales rep + manager override payscale ONLY. Solar Review does NOT charge the customer — Top Tier charges the customer.
- **Accounting requirements:** track sold commissions, paid commissions, and travel reimbursements. Nothing else.

### 3. New Solar
- **Model:** installs currently through **Trio and Axia** as the installers. Sales rep + manager override payscale ONLY. Solar Review does NOT charge the customer — the solar provider charges the customer.
- **Accounting requirements:** track sold commissions and paid commissions. Nothing else.

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

## Netlify Environment Variables (set in Netlify UI)
- `ANTHROPIC_KEY` — Claude API key for photo AI
- `REGRID_KEY` — Regrid parcel lookup JWT
- `GHL_API_KEY` — GoHighLevel private integration key
- `GHL_LOCATION_ID` — GHL sub-account location ID: `gXWwbOVymY0iRfj7c1It`
- `GHL_CALENDAR_ID` — GHL top-tier calendar ID (if used)
- `GHL_EVAL_CALENDAR_ID` — GHL "FixMy.Energy Evaluation" calendar ID: `UjlvHxE8AlyhG5frBkqr` — used by `/book` (`ghl-book.js`, `ghl-slots.js`) ✅
- `GHL_DIAG_CALENDAR_ID` — GHL "Ops - Diagnostic Appointments" calendar ID: `ZGOdyYdMUh07V1Ujav9R` — used ONLY by the admin's post-payment diagnostic scheduling (`confirmDiagSchedule()` in portal.html)
- `GHL_TT_WEBHOOK` — GHL webhook URL for Top Tier workflow triggers
- `STRIPE_SECRET_KEY` — Stripe secret key (server-side only, for sign-init.js / sign-complete.js) ✅
- `STRIPE_PUBLISHABLE_KEY` — Stripe publishable key (returned to client by sign-init.js) ✅
- `SUPA_SERVICE_KEY` — Supabase service role key (bypasses RLS, used in sign-init/complete) ✅
- `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` — set to Google Maps key to bypass scanner

## Google Maps API Key
Stored in portal.html as `GKEY` (client-side key, restrict to domain in Google Cloud Console → Credentials → HTTP referrers).

## GHL Integration
- Location ID: `gXWwbOVymY0iRfj7c1It`
- **Two distinct calendars/appointment types — do not conflate (fixed 2026-06-16, was previously bugged):**
  - **Evaluation** (`GHL_EVAL_CALENDAR_ID` = `UjlvHxE8AlyhG5frBkqr`, GHL calendar "FixMy.Energy Evaluation", 2hr slots) — the initial Tech visit booked by the customer via `/book`. Tech sets up the Diagnostic, signs the agreement, collects the Diagnostic Fee. Used by `ghl-book.js` + `ghl-slots.js` only.
  - **Diagnostic** (`GHL_DIAG_CALENDAR_ID` = `ZGOdyYdMUh07V1Ujav9R`, GHL calendar "Ops - Diagnostic Appointments", 10min slots) — the real technical-analysis visit by Cosmic/internal electrician, scheduled by admin in `confirmDiagSchedule()` AFTER agreement signed + invoice paid. Used by portal.html's diag-scheduling/reschedule calls to `ghl-calendar.js` only.
  - Bug history: `ghl-book.js`/`ghl-slots.js` originally defaulted to the Diagnostic calendar ID (copy-paste/stale default), so `/book` confirmations went out with "Diagnostic" wording/SMS instead of "Evaluation" even though the customer only booked an Evaluation. Fixed by repointing those two functions to `GHL_EVAL_CALENDAR_ID`.
  - Each calendar's Confirmation SMS/Email template is configured independently in GHL (Calendars → select calendar → Notifications tab, or via a Workflow keyed to that calendar's "Appointment Booked" trigger) — verify each says the correct terminology for its own appointment type.
- Agreement flow: portal calls `ghl-diag-agreement.js` → upserts contact → adds `send-diag-agreement` tag → GHL workflow fires
- Status sync: GHL calls `ghl-status-update.js` with triggers: `invoice_paid`, `invoice_created`, `agreement_signed`, `agreement_sent`
- Scheduling: portal calls `ghl-calendar.js` to book real GHL calendar appointment (so reminders auto-recalculate on reschedule)
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
1. Admin/Tech confirms diagnostic fee in portal → `sign_token` generated + stored in `customers.sign_token`
2. Portal shows shareable link popup with Copy + "Text It" buttons
3. Customer opens `fixmy.energy/sign?t=TOKEN` on their phone
4. `sign-init.js` validates token, creates Stripe PaymentIntent server-side (amount locked — client cannot tamper)
5. `sign.html` shows: agreement text → typed signature field → Stripe Card Element → "Sign & Pay $X" button
6. Stripe processes card — card data never touches our servers (PCI compliant, handled by Stripe Elements)
7. On success: `sign-complete.js` verifies PaymentIntent, updates Supabase (`invoice_status=paid`, `agreement_status=signed`, clears token), fires GHL `diag-signed-and-paid` tag
8. Auto-conversion: portal detects `invoice_status=paid` + `agreement_status=signed` → converts lead to `sold_type=diagnostic` job → opens scheduling modal

### Supabase columns added for Sign & Pay:
- `sign_token TEXT` — UUID token (nulled out after use)
- `sign_token_expires_at TIMESTAMPTZ` — 72hr from generation
- `stripe_payment_intent_id TEXT` — reused on page reload to avoid duplicate charges

### Netlify env vars required (not yet added to Netlify UI):
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `SUPA_SERVICE_KEY`

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

## Netlify MCP Setup
- Official Netlify MCP: `@netlify/mcp` (npx)
- Configured in `.claude/settings.json` (mcpServers.netlify, no token in file)
- `NETLIFY_PERSONAL_ACCESS_TOKEN` stored in `.claude/settings.local.json` under `env` key (gitignored)
- User needs to replace `PASTE_YOUR_PAT_HERE` with actual PAT from Netlify → User settings → Applications → Personal access tokens
- Once PAT is set and session restarted, Claude can set Netlify env vars directly without user going to UI

## customers Table — Key Columns
Standard: `id, first_name, last_name, email, phone, address, notes, created_at`
Pipeline: `step, solar_status, lead_category, sold_type`
Scheduling: `diagnostic_date, install_date, arrival_end, arrival_window, install_type`
Financial: `invoice_status, invoice_number, invoice_amount, invoice_url, invoice_items`
Deposit: `deposit_status, deposit_amount, ops_milestone1_status, ops_milestone1_amount`
Assignment: `assigned_ops, ops_payout_status, rep_id, setter_name`
Lead info: `lead_source, referred_by, referral_incentive_paid, lead_temp, dnc`
Title: `title_owner, apn, title_confirmed`
Solar: `system_size, utility, monthly_bill, nem_status`
Agreement: `agreement_status, agreement_url, agreement_signed_at, agreement_signature`
Sign & Pay: `sign_token, sign_token_expires_at, stripe_payment_intent_id`
Dialer: `dial_status, dialed_at, dial_attempts, callback_at` (added by 20260702_black_box_dialer.sql migration)

## Black Box Dialer (two-way dialer ↔ door knocker note share)
- **Dialer view:** `renderBBDialerView()` in portal.html — opened via "📞 Black Box Dialer" button on the Black Box tab. Power-dialer queue over Black Box leads (`black_box=true` or `lead_source='orphaned_list'`, phone present, not DNC, `sold_type` null).
- **Two-way share architecture:** every dialer disposition, door-knock outcome, and quick note writes to BOTH:
  1. `customers.notes` JSON feed (`_appendNote` format, `by` prefixed `📞 Dialer — <Rep>` / `🚪 Knock — <Rep>`) — instantly visible in canvass view, lead editor notes log, dialer card
  2. `lead_activity` table (structured: channel, outcome, callback_at, call_duration, recording_url) — powers callback queue + future stats
- **Single write path:** `bbLogActivity(id, channel, outcome, note, opts)` — used by dialer dispositions, `adminCanvassKnock`, `adminBBKnock`, `adminCanvassAddNote`, `addEditorNote`
- **Dispositions:** no_answer, left_vm, callback (with datetime), warm, booked, not_interested, wrong_number, dnc. `booked` → activates lead (black_box=false, step 1) + opens editor. `dnc` → sets customers.dnc=true, removed from queue.
- **Queue buckets:** Fresh / Callbacks / Worked, driven by `dial_status` + `callback_at` on customers.
- **Migration:** `supabase/migrations/20260702_black_box_dialer.sql` — creates lead_activity + dialer columns. ⚠️ Must be run in Supabase (SQL Editor or MCP) — portal degrades gracefully without it (notes feed works, but worked/callback buckets don't persist across reloads).
- **`ghl-bulk-sync.js`** — "Sync Queue to GHL" button (admin): pushes all dialable BB leads into GHL as contacts, tag `bb-dialer-lead` ONLY (deliberately never uses workflow-trigger tags like `send-diag-agreement`). Enables calling via GHL's built-in Power Dialer with no CSV import/export.
- **`ghl-dialer-sync.js`** — inbound webhook for GHL call dispositions: matches customer by last-10-digit phone, writes lead_activity + notes feed + dial state. Wire in GHL: workflow on call disposition → Webhook POST to `https://fixmy.energy/.netlify/functions/ghl-dialer-sync` with `{ phone, outcome, note, rep_name }`.
- **Spam protection decision (2026-07-02):** main LC Phone number = transactional only. Buy 2–3 dedicated local dialing numbers (~$1.15/mo each), cap ~100–125 calls/day each, register at freecallerregistry.com, treat as semi-disposable.

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

## Marketing Tab
- `marketing_expenses` table tracks direct mail spend
- Zip-code matching against customer addresses attributes revenue to campaigns
- `lead_source` field on customers tracks attribution: direct_mail | self_generated | referral | inbound_web

## Known Pending Items

### High Priority
- **CPUC NEM data — online PRR submission (HIGH PRIORITY):** Letter sent via email; CPUC responded directing submission through their online Public Records Request portal at cpuc.ca.gov. Have not submitted online PRR yet. Same content as the draft letter below — need to find and fill out the online form. DO NOT submit until the online form is located and the format/attachment requirements are understood.
- **Google Ads mobile CTA page (HIGH PRIORITY):** The current ads landing page CTA is hard to use on mobile. Need a dedicated, simple page with a single actionable CTA (book appointment) optimized for mobile traffic from Google Ads. Unique URL so it can be linked directly from ads. Should be separate from the main site but easy to navigate to company webpage.
- **Lead capture / funnel tracking — LARGELY FIXED 2026-07-04 (growth-audit branch):**
  - Root cause of "non-bookers got booked confirmation": index.html partials fired the same GHL webhook-trigger as completed leads. Fixed — partials now POST to `ghl-inbound.js` (source `homepage_partial`); only completed leads hit the GHL webhook.
  - `ghl-inbound.js` now accepts address-only partials (was silently dropping any lead without phone/email), stamps partials `lead_temp='warm'`, and upgrades an address-matched partial into the full booking instead of duplicating.
  - Homepage full leads also route through `ghl-inbound` (`upsertToPortal` rewritten) — no more email-gated direct Supabase upsert.
  - UTM/gclid/fbclid + landing_page captured on index.html + book.html (sessionStorage, `getAttribution()`), passed to ghl-inbound. ⚠️ **Run `supabase/migrations/20260704_attribution_columns.sql`** — until then ghl-inbound retries writes without attribution fields (graceful) and attribution only lands in the notes text.
  - thank-you.html Ads conversion fixed (was firing at the GA4 ID — never recorded). index.html `trackBooking()` no longer double-fires the Ads conversion (thank-you page owns it for the homepage flow; /book fires its own inline).
  - Dead code fixed: a `booking_confirmed` listener lived inside a `<script src>` tag (never executed) — split out; live listener covers all flows.
  - check-preview.html (all /sunpower /titan etc. routes) now has GTM + GA4 + Ads + Meta Pixel, per-installer title/meta/canonical, and generate_lead + fbq('Lead') on submit.
  - SEO penalty risks removed from index.html: hidden off-screen keyword div (now a visible footer Service Areas block) and unverifiable `aggregateRating` schema. Added robots.txt + sitemap.xml (submit in Search Console).
  - Still open: verify GHL workflows don't key off partial payloads; Meta retargeting campaigns; Google Ads offline conversion upload.
- **Brand decision (2026-07-04, per Dennis — FULL REBRAND):** The customer-facing brand is **Solar Review** everywhere. FixMy.Energy is dissolved as a brand name across all public pages (index, check-preview, careers, sign, meet, onboarding, customer-facing portal strings). Keep: `fixmy.energy` wherever it is the literal domain/URL/email (still the live domain), `lead_category='fixmy'` data values, `isFixMySave`-style internal identifiers, internal admin tab labels ("FixMy" = internal name for the diagnostic/battery business line — rename only if Dennis picks a new line name), and the rep agreement "Solar Review Corp (DBA: FIXMy.Energy)" legal text (contract language — change only when the DBA filing itself changes). Schema keeps `alternateName: "FixMy.Energy"` for old-name searches.
- **/book page decision (per Dennis):** keep the preloaded appointment slots directly in the form — do not replace with a separate calendar step.
- **Google Ads video creative (HIGH PRIORITY):** Current video ads are low quality. Need better video assets. (Not a dev task — Dennis action item.)

### Medium Priority / On Hold
- **GHL AppointmentCreate webhook → portal:** When a customer books through the `/book` calendar (ID `ZGOdyYdMUh07V1Ujav9R`), GHL needs to fire a webhook back so `diagnostic_date` populates in the portal. In GHL: Automations → "FixMy Energy Solar Appointment Confirmation" → add a Webhook action posting to `https://fixmy.energy/.netlify/functions/ghl-inbound`. `ghl-inbound.js` already parses `selectedSlot`/`startTime` from the payload. GHL config only — no code change needed.
- Add `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `SUPA_SERVICE_KEY` to Netlify env vars (sign+pay won't work until these are set)
- Add Netlify PAT to `.claude/settings.local.json` to enable Netlify MCP
- **Google Maps API key restriction:** Previously caused a tech issue when restricted — leave unrestricted for now. Revisit carefully if security becomes a concern.
- Battery Retrofit Agreement flow (needs agreement template content from Dennis)
- Top Tier pipeline (planned — see plan file)
- Antoinette M2/M3 milestone invoicing (planned — see plan file)
- **GHL field mapping (optional cleanup):** Change First Name from `{{trigger.full_name}}` → `{{trigger.firstName}}`, add Last Name → `{{trigger.lastName}}` — works either way with current payload
- **fixmy.energy/check:** Live at `/check` (redirects to FAQ section on main site); installer-specific pages live at `/sunpower`, `/titan`, `/sunnova`, `/mosaic`, etc.
- **CPUC/SDG&E NEM data request:** Draft letter in CLAUDE.md. Email sent; CPUC directed to online PRR portal. Online submission pending (see High Priority above).
- **CEC GoSolar / CSI bulk CSV:** Download residential solar permit data from cpuc.ca.gov → Industries → Electrical Energy → Demand Side Management → California Solar Initiative → CSI Data → "Current Incentive Claim Data". Paste into Import tab → auto-detected and parsed.
- **Accela scraper (local Playwright script):** `scripts/accela-scraper.js` targets SD DSD, Chula Vista, Oceanside Accela portals. Run locally: `node scripts/accela-scraper.js`. Output CSV imports via Import tab. See scripts/README for usage.
- **Cloak Browser (anti-detect):** Noted as a future tool for platforms with aggressive fingerprint-based bot detection. Revisit if Playwright hits detection walls on commercial platforms.
- **SD County permit data pull + scoring model walkthrough:** Not yet delivered
- **Minuteman Press direct mail strategy doc:** Not yet delivered
- **Golf course solar panel protection:** New service scope — see Future Services section below
- **GTM conversion tracking audit:** GTM-TSJVG2GT is installed. Verify GA4 + Google Ads conversion events fire on booking completion. Use Tag Assistant Chrome extension to confirm. (Likely related to the broken lead capture flow above.)
- **Switch from Smith.AI to Quoya (GHL built-in AI agent):** Smith.AI webhooks no longer needed — `call-inbound.js` function can be repurposed or removed. Quoya migration is halfway completed in GHL. Finish configuring Quoya workflow to handle inbound calls and missed-call SMS follow-up.
- **Customer photo upload SMS notification:** ✅ Built — `notify-photo-upload.js` fires after every customer upload. **Decision: Use GHL LC Phone instead of Twilio** (see SMS tooling decision below). Needs GHL workflow built to replace the Twilio path. Rep phones in `team_members`: Dennis Larsen (tech4) and Cristina Huang (tech5) are set.

### Deferred (budget/timing)
- **BBB accreditation:** Valuable but deferred — limited budget, build other lead revenues + partner credibility first. Revisit when revenue stabilizes. Apply at bbb.org/apply (~$400-600/yr, 3-week process).
- **GHL SMS/calendar workflows:** Skipping GHL workflow automation for now, keep items on To Do.

## SMS Tooling Decision — GHL LC Phone over Twilio
**Recommendation: Use GHL's built-in LC Phone (Lead Connector) for all SMS — do not set up Twilio.**

Rationale for slim-budget operation:
- GHL subscription already paid — LC Phone costs per message (~$0.008/segment) but no additional monthly fee or account setup
- Twilio adds a second vendor: account, billing, API keys, monitoring — unnecessary overhead
- GHL SMS integrates natively with GHL workflows, so photo-upload notifications and other alerts can be GHL workflow triggers (no Netlify function code needed)
- Exception: only use Twilio if you need programmatic SMS outside GHL's control flow (e.g., real-time alerts from a Netlify function that can't reach GHL) — not the case here

**Action needed:** Build a GHL webhook-triggered workflow that fires when a customer uploads a photo (via the portal's `notify-photo-upload.js`) → sends SMS to assigned rep via LC Phone. Remove the Twilio path from the Netlify function once the GHL workflow is live.

## Future Services

### Golf Course Solar Panel Protection
**Status: Concept — not yet scoped or offered.**

Solar panels installed near golf courses are at elevated risk of impact damage from errant golf balls. This is a niche but recurring need in San Diego County (Torrey Pines, Rancho Bernardo, Carmel Mountain, Eastlake, etc.).

**Scope of work (to be developed):**
- Site assessment: identify exposure angle, distance from fairways/driving ranges, typical ball trajectory
- Protection options to evaluate:
  - Polycarbonate ballistic shield panels mounted above array on standoff frame
  - Heavy-gauge wire mesh / expanded metal screens (angled to deflect, not catch)
  - Sacrificial tempered glass overlay on high-exposure panels
  - Array repositioning / tilt adjustment during re-roof or retrofit (prevents future exposure)
- Framing: likely custom aluminum unistrut or steel angle — no off-the-shelf product exists for this
- Documentation: before/after photos, warranty language for protection gear vs. panel warranty

**Ops partner:**
- Cosmic Solar's fit is uncertain — primarily a panel swap / install crew, not custom fabrication
- Need to identify a partner with light metal fabrication + roofing experience
- Possible leads: local awning/shade structure contractors, solar racking fabricators, or a roofing/metal shop willing to sub on jobs
- **Action needed:** Ask Cosmic if they're comfortable with custom screen/shield installs; if not, source an alternate ops partner before offering this service

**Lead identification:**
- Filter `address` field in portal for proximity to known golf courses (manual today; could automate with geocoding + golf course polygon overlay)
- Add `golf_course_exposure` boolean to customers table when this service launches

## Orphaned Account Marketing Strategy
Five-channel approach targeting homeowners whose solar installer went out of business:
1. **Permit data** — pull SD County building permits by defunct contractor names, apply scoring model (system age, size, NEM status)
2. **CPUC NEM data** — public records request (letter below) to get address + installer + system size
3. **Batch CSV import** — Admin → Import tab: paste permit CSV, Regrid enriches with owner name + APN, import as `new_solar / ns_eval_booked / direct_mail`
4. **fixmy.energy/check** — dedicated landing page for orphaned accounts (draft at `/check-preview.html`)
5. **Direct mail** — Minuteman Press postcards to enriched address list

Target installers: SunPower (Ch. 11 Aug 2024), Titan Solar (Ch. 7 Jun 2024), Sunnova (Ch. 11 Jun 2025), Mosaic Solar Loans (Ch. 11 Jun 2025), Sullivan Solar (shut down Oct/Nov 2021 — NOT 2019), Petersen Dean (Ch. 11 Jun 2020), Sungevity (Ch. 11 Mar 2017), Freedom Forever (Ch. 11 Apr 15, 2026)

## Defunct Solar Installer Database (Marketing Agent Reference)

### Priority 1 — Truly Orphaned (no active service entity)
These companies have NO successor managing service calls. Targeting them is the highest-priority opportunity.

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
| Freedom Forever | Ch. 11 Apr 2026 — now in Priority 1 | — |
| Complete Solar | Acquired SunPower assets 2024, rebranded | Active as "SunPower" |

### PermitStack Pull Notes
- SunPower is rarely listed as "SunPower" on permits — use "Complete Solar Inc" or "BRS Field Ops" as primary search terms
- SD County zip filter: 919xx (El Cajon, La Mesa, Santee, Lakeside) + 920xx (San Diego, Chula Vista, Poway)
- System size kW extracted from permit description text via regex when not a dedicated field
- Mosaic is a LENDER not an installer — leads from Mosaic are homeowners with outstanding loans, not necessarily broken systems
- Portal Import tab → "Pull Live from PermitStack" button fires `permitstack-pull.js` for each selected installer, deduplicates by address, auto-populates CSV textarea

## CPUC / SDG&E NEM Data — Public Records Request Draft

**Status: Drafted, not yet sent.**

### Option A — CPUC (send to `public.records@cpuc.ca.gov`, ~10 business days)
**Subject:** `Public Records Act Request — NEM Interconnection Data (SDG&E Service Territory)`

---

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

**Purpose:** Solar Review Corp (operating as FixMy.Energy) provides independent solar diagnostic, repair, monitoring, and battery retrofit services to San Diego County homeowners. A significant number of residential solar customers in the SDG&E territory were left without support when their original installers — including SunPower (Chapter 11, 2024), Sullivan Solar Power (closed 2019), Petersen Dean (closed 2020), and Sungevity (closed 2017) — ceased operations. We are using this data solely to identify affected households so we can offer them a path to restore full system performance. We have no intention of publishing, reselling, or sharing this data.

**Format:** CSV, Excel, or pipe-delimited text preferred.

**Fee Waiver Request:** Disclosure primarily benefits the public by facilitating the repair and continued operation of existing distributed energy resources — directly supporting California's clean energy goals. If a waiver is not granted, please provide a cost estimate before proceeding. If any portion is denied, please specify which exemption applies and provide all non-exempt portions.

Dennis Larsen  
Solar Review Corp / FixMy.Energy  
[phone] · dennis@fixmy.energy

---

### Option B — SDG&E Direct (faster, send to `regulatory@sdge.com`)
**Subject:** `CPRA Request — Residential NEM Interconnection Records, 2015–2023`

SDG&E files quarterly NEM data with the CPUC and maintains it in structured form. Cite the same CPRA authority (Gov. Code § 7920.000 et seq.) and request the same five fields. Use the same purpose and fee waiver language as Option A. SDG&E's regulatory affairs team typically responds faster than the CPUC's public records office.

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
```
