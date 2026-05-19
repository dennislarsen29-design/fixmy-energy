# FixMy.Energy Portal — Project Context

## What This Is
A single-file admin + field portal for a solar diagnostic / battery retrofit / new solar business.
All logic, HTML, CSS, and JS lives in **`portal.html`**. There is no build step — Netlify deploys the repo as-is.

## Live Site
Deployed on Netlify from the `main` branch. Feature work goes on branch `claude/fix-login-issue-gf9lH` and is cherry-picked to `main` when ready.

## Key Files
- `portal.html` — the entire portal (admin, ops, setter, tech, customer views)
- `index.html` — public-facing landing page
- `netlify/functions/claude-vision.js` — proxies Anthropic API calls (photo AI categorization)
- `netlify/functions/regrid-lookup.js` — proxies Regrid parcel lookup (keeps API key server-side)
- `.claude/settings.local.json` — Supabase MCP config with PAT (gitignored)

## Supabase
- Project URL: `https://kbtobyoumvbcxfbugsid.supabase.co`
- Main table: `customers` — holds all leads and jobs for both FixMy and New Solar
- Other tables: `team_members`, `rep_agreements`, `marketing_expenses`
- MCP is configured — use it to run SQL directly instead of asking user to copy/paste
- Anon key is in portal.html as `SUPA_KEY` (safe — protected by RLS)

## Portal Architecture
- `supabase.createClient(SUPA_URL, SUPA_KEY)` — client pattern used everywhere
- `adminCustomers` — global in-memory array of all customer/lead records
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
- `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` — set to Google Maps key to bypass scanner

## Google Maps API Key
`AIzaSyBedpPe3461c1mYiD8yxjDMkYvrJ4MQQpc` — in portal.html as `GKEY`.
Restrict this to your domain in Google Cloud Console → Credentials → HTTP referrers.

## customers Table — Key Columns
Standard: `id, first_name, last_name, email, phone, address, notes, created_at`
Pipeline: `step, solar_status, lead_category, sold_type`
Scheduling: `diagnostic_date, install_date, arrival_end, install_type`
Financial: `invoice_status, invoice_number, invoice_amount, invoice_url, invoice_items`
Deposit: `deposit_status, deposit_amount, ops_milestone1_status, ops_milestone1_amount`
Assignment: `assigned_ops, ops_payout_status, rep_id, setter_name`
Lead info: `lead_source, referred_by, referral_incentive_paid, lead_temp`
Title: `title_owner, apn, title_confirmed`
Solar: `system_size, utility, monthly_bill, nem_status`
Agreement: `agreement_status, agreement_url`

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

## Payments & Invoicing
- **Payment processor: Stripe, connected through GHL** (GHL Payments → Stripe integration)
- GHL generates Stripe invoices with a shareable payment link
- Diagnostic fee can be confirmed by **Admin OR Tech/Sales** — both have the fee modal
- `invoice_url` field stores the Stripe/GHL payment link — currently populated manually, automation pending
- `agreement_url` field stores the GHL document signing link
- GHL combined sign+pay document does NOT charge the card — it only captures CC info. Do not use.
- Automated invoice flow (planned): agreement signed → GHL creates Stripe invoice → webhook returns URL to portal

## GHL Integration
- Location ID: `gXWwbOVymY0iRfj7c1It`
- Calendars: Top Tier = `5cXAACDD24dV3DFymOdj`, Diagnostic = `ZGOdyYdMUh07V1Ujav9R`
- Netlify env vars: `GHL_API_KEY`, `GHL_CALENDAR_ID` (TT), `GHL_DIAG_CALENDAR_ID`, `GHL_LOCATION_ID`, `GHL_TT_WEBHOOK`
- Netlify functions: `ghl-calendar.js` (book appt + fire triggers), `ghl-diag-agreement.js` (send agreement via tag), `ghl-status-update.js` (receive invoice_paid / agreement_signed from GHL → update Supabase)
- GHL webhook tester lives in portal → Team tab → bottom of page
- `send-diag-agreement` workflow: triggered by tag → sends document → on signed fires webhook to `ghl-status-update`
- Top Tier triggers: `top_tier_confirmed` | `top_tier_missed` | `top_tier_follow_up` | `top_tier_dead`
- Diagnostic triggers: `diag_scheduled` | `invoice_paid` | `agreement_signed` | `admin_diag_scheduled`

## Diagnostic Fee Flow
- Fee modal fires when any lead transitions to step 3 for the first time (`cRec.step < 3 → stepVal === 3`)
- Tech/Sales view has `openSalesDiagModal` / `confirmSalesDiagFee` — separate from admin `openDiagFeeModal`
- Both paths call `/.netlify/functions/ghl-diag-agreement` to send the agreement
- Fee presets: $250, $349, $449, $499, $599 — custom amount also allowed
- Commission calculated via `calcDiagCommission(fee)`

## Auto-Conversion (Lead → Diagnostic Job)
- Triggered in `saveLeadEditor` when: `!cRec.sold_type && invoice_status === 'paid' && agreement_status === 'signed'`
- Sets `sold_type = 'diagnostic'`, opens `openDiagSchedulingModal`
- Modal captures: ops partner, date, arrival start time, arrival end time, notes
- On confirm: saves to DB, books GHL Diagnostic Calendar event, fires `diag_scheduled` webhook


- Restrict Google Maps API key to domain in Google Cloud Console
- Battery Retrofit Agreement flow (needs agreement template content from Dennis)
- GHL sync for lead data

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
