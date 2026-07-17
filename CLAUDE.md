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

## Solar Review Finance (Finance tab — full accounting system, 2026-07-08)
Rebuilt Finance tab (`renderFinanceView()` in portal.html) into a full financial management system designed to replace the $145/mo CPA bookkeeping. Sub-tabs: **Dashboard** (KPI tiles + interactive Chart.js charts — click a month bar to zoom the whole tab to it), **Revenue**, **Sub Sheet**, **Commissions**, **Expenses**, **Statements**, **AI Advisor**, plus the pre-existing **Money Owed / Payroll / Marketing** views unchanged. Default sub-tab is `dashboard`; timeline filter `financeRange` (Lifetime / Year / Month) is shared across all new sub-tabs.

- **Chart of accounts = the CPA's actual QuickBooks accounts** (extracted from the Jan–Apr 2026 P&L PDF Dennis uploaded; cash basis, S-Corp). Names must stay 1:1 with the CPA's books — stored in `coa_accounts` (34 accounts, one level of sub-accounts via `parent`).
- **P&L mapping (single source of truth, `finComputePnl()` in portal.html — reconciled to the penny against the CPA's Jan 2026 column in tests):** Income "Commission Income" = payments ledger (category `revenue`) + overrides received (`commissions` payee `solar_review_corp`, status `paid`). COGS: paid `job_costs` → "Subcontracted Services", paid rep commissions → "Incentives - Sales", marketing_expenses Direct Mail Print/USPS Charges → "Lead Generation" (Google/Digital Ads marketing entries are deliberately EXCLUDED — card statements book those to "Advertising and Promotion"; counting both would double-book ad spend). Expenses = `expense_transactions` by account (+ paid travel reimbursements → "Travel Expense").
- **Statement upload (Expenses sub-tab):** AmEx/bank CSV parsed client-side (`finExtractTxnsFromCSV` — header autodetect, debit/credit columns, bank sign-flip heuristic, quoted fields); PDF → `finance-extract.js` (mode `extract`, Claude reads the document). Card-payment lines (AUTOPAY/PAYMENT RECEIVED) are skipped. Dedupe via `dedupe_hash` unique column + upsert `ignoreDuplicates` — re-uploads are idempotent. Categorization: `categorization_rules` (user rules priority 100 beat ~70 seeded merchant rules) → AI batch categorize (mode `categorize`, confidence <0.7 ⇒ review queue) → inline per-row select; manual recategorize offers "always categorize X as Y" which saves a rule. Mileage log (`mileage_entries`, IRS $0.70/mi) is informational only — never added to the P&L.
- **Statements sub-tab:** live P&L in the CPA's exact QuickBooks layout (monthly columns; lifetime = year columns), Expense-by-Category, 1099 prep report. Every table/statement has Export CSV; Print/Save-as-PDF via `finPrint()` (`.fin-print-area` + `body.fin-printing` print CSS — white/black, chrome hidden).
- **AI Advisor (`finance-agent.js`):** nightly at 12:00 UTC (~5am PT, after the GHL payments sweep) — Claude tool loop over the books (P&L snapshot, expense deltas, recurring-charge/subscription audit, commissions, cash position) + Anthropic server-side `web_search` for current S-Corp tax strategy; writes to `agent_reports` with `agent:'finance'` (shows in Agents inbox AND the AI Advisor sub-tab; "Run Analysis Now" button = `run-agent-background?agent=finance`). Dedupes against its own last 7 days of reports; always ends tax items with "verify with a licensed tax professional".
  - ⚠️ **Bug fixed 2026-07-13:** the agent never produced a single report (nightly or manual "Run Analysis Now") because `callClaude()` offered the `web_search` server tool on every data-gathering call but never sent the required `anthropic-beta: web-search-2025-03-05` header — every Claude API call failed outright. Found by diffing against `inverter-analysis.js`, which uses the same tool correctly. Fixed by adding the header; gated in `scratchpad/finance-agent-harness.js`.
- **`finance-extract.js`:** hardened like claude-vision.js (origin allowlist, payload reconstructed); model `claude-sonnet-5`, forced tool_choice for machine-readable output.
- **Tables (migration `20260708_solar_review_finance.sql`):** `coa_accounts`, `expense_transactions`, `statement_uploads`, `categorization_rules`, `mileage_entries` — anon-key RLS like job_costs. ⚠️ **Migration not yet applied to Supabase** (MCP approval unavailable in the build session) — run it in the SQL Editor or via MCP; the tab degrades gracefully with a banner until then.
- Portal gotcha honored throughout: global `button{width:100%}` — finance module scopes `.fin-wrap button{width:auto}` and inline `width:auto` on sub-tab/segmented buttons.
- Legacy job-level commission fields (`customers.rep_commission`/`commission_paid`) still render (merged into the Commissions sub-tab + 1099 report) — read-only integration, no data migration.

### Finance follow-up (2026-07-13): Sync tab, full CoA, 2025 GL import, Plaid deposit fixes
Four threads after connecting GWCU/AmEx/Citi via Plaid and uploading the CPA's full-year **2025 General Ledger** (Solar Review Corp, cash basis, ABMG). ⚠️ **Two migrations + one seed NOT yet applied to Supabase** (`20260712_coa_full_gl.sql`, `20260712_ledger_history.sql`, `supabase/seed/gl_2025.sql`) — MCP approval was unavailable in the build session; run them in the SQL Editor or via MCP. The tab degrades gracefully until then (ledger_history fetch fails soft → no 2025 column; new CoA accounts just don't appear).

- **Part A — Plaid deposit capture fixes (`plaid-sync.js` + `plaid-exchange.js`):** The old per-txn filter ran `SKIP_PFC` (`{TRANSFER_IN, LOAN_PAYMENTS}`) + `isIssuerPayment` **before** the deposit branch, so ACH commission deposits (Plaid tags them `TRANSFER_IN`) were dropped — TT (~$8k) / NS (~$6k) overrides never reached the review queue. Reordered so **deposits (`amount < 0`) queue first, bank-items only, regardless of PFC**, bounded by a **`depositFloor`** (`item.deposit_since` or `connected_at − DEPOSIT_LOOKBACK_DAYS(180)`); the expense path keeps SKIP_PFC/isIssuerPayment + `start_date` cutoff. `plaid-exchange.js` stamps `deposit_since = connect − 180d` on the stored item. **Full Resync**: `POST /plaid-sync?resync=1` (or body `{resync:true}`) sets every `item.cursor = null` so Plaid replays history — recovers deposits swept past the cursor by the pre-fix discard-everything sync; idempotent via `dedupe_hash` + cross-source guard. Dennis taps **Full Resync** once post-deploy, then classifies the recovered deposits in Revenue.
- **Part B — new "🔄 Sync" tab (`finRenderSync()`):** all data-ingestion moved out of Expenses (it fed Revenue too). Holds statement upload (CSV/PDF), the Plaid block (Connect / Sync Now / **Full Resync** / status box), and the categorization-rules panel. `finRenderExpenses()` trimmed to a slim toolbar (+ Manual Expense, Export CSV, pointer to Sync) keeping summary tiles / review queue / ledger / mileage. `financeSubTab==='sync'` suppresses the range bar and lazy-loads Plaid status.
- **Part C — full CPA chart of accounts (`20260712_coa_full_gl.sql`):** the 2025 GL revealed the CPA's complete account list. Renumbers existing `coa_accounts.sort` into QB alphabetical order and adds the missing accounts — income (Other Income, Interest Income), S-Corp-critical **Officer Salary** (under Salaries & Wages) + expense accounts (Team Event, Training & Coaching - Sales, Donation, Merchant Fees, Interest/Depreciation, Corporate Taxes, Professional Fees - Other), and off-P&L equity/liability/asset accounts (**Shareholder Distributions** + subs, Silver Lands Equity, Loan Payable - Freedom Solar, Payroll Clearing/Tax Liabilities, AR/AP, Furniture & Equipment, Accumulated Depreciation) for the deposit classifier + a future balance sheet. `on conflict (name) do nothing`.
- **Part D — deposit review categories (`finRenderDepositReviewQueue()`/`finClassifyDeposit()`):** simplified 2026-07-13 per Dennis — no separate "commission vs. override" distinction (everything landing here as commission income IS an override; TT/NS reps' own commissions are tracked separately in the Commissions sub-tab), no "Other provider" bucket (folded into Other — consulting income is the only other thing that shows up, and it's low-volume), and **no Travel Reimb. button** (travel reimbursements arrive bundled inside the same TT/NS paycheck deposit, not as a separate line — just classify the whole deposit under its provider). Flat per-deposit buttons: **Top Tier / New Solar** (→ `commissions` override row, line `top_tier`/`new_solar`, payee `solar_review_corp`, status `paid` — feeds P&L Commission Income), **Other** (→ override row line `other`, payee_name "Other Income" — `finComputePnl()` routes line `other` to the "Other Income" account, distinct from Commission Income; catches misc/consulting income), **Owner Transfer** (marked confirmed, NOT revenue, excluded from P&L), **Ignore** (status `ignored`). Clicking a button greys out that deposit row + shows "Saving…" immediately (`#depbtns-<id>`) instead of a silent pause during the DB round-trip.
- **Stripe payout deposits are auto-excluded, never queued (`isStripePayout()` in `plaid-sync.js`, 2026-07-13):** Stripe only powers the Sign & Pay page (`sign-init.js`/`sign-complete.js`) — every dollar in a Stripe payout to the bank account is already recorded in the `payments` table the instant the customer pays. Queuing these for manual classification would risk double-booking the same revenue (once via Sign & Pay, again via bank deposit review) if Dennis ever misclicked a category instead of Ignore. Deposits whose description matches `/STRIPE/i` are now skipped at sync time before they ever reach `plaid_deposits_review`. ⚠️ This only prevents *future* syncs from queuing them — any Stripe rows already sitting in the queue from before this fix need a one-time manual Ignore (or a one-off `update plaid_deposits_review set status='ignored' where status='needs_review' and description ilike '%stripe%'`).
- **Deposit classification rules — auto-classify recurring deposits (`deposit_classification_rules` table, migration `20260713_deposit_classification_rules.sql`, 2026-07-13):** mirrors `categorization_rules` on the deposit side. After a manual classify in `finClassifyDeposit()`, a `prompt()` (not `confirm()` — needs an editable text field) offers to remember it: pre-fills a short, durable keyword ("TOP TIER" / "NEW SOLAR" detected in the descriptor, else the normalized merchant string) that Dennis can edit before saving, since the raw descriptor can carry a per-transaction reference that won't repeat on the next deposit. Saved as `{pattern, classification}` (unique together). `plaid-sync.js` (`loadDepositRules()`/`applyDepositRule()`) matches every newly-inserted deposit against saved rules at sync time (case-insensitive substring, longest-pattern-wins tie-break, same style as `applyRules()` for expenses) and — on a hit — applies the classification immediately server-side (`applyDepositClassification()`, using `supaPatch` added to `lib/plaid.js`) instead of leaving it in the Revenue review queue; only unmatched deposits still show up for manual review. Rule `hit_count` bumps on every auto-classify. Managed in the Sync tab's Rules panel (`finRenderSync()`) alongside categorization rules, with delete (`finDeleteDepositRule`).
- **Part E — 2025 CPA actuals import (`ledger_history` table + `gl_2025.sql` seed):** `ledger_history` (period_month, account_name, type income|cogs|expense, amount, source `cpa_gl_2025`; unique `(period_month, account_name, source)` for idempotency; anon-key RLS). Seed = one row per P&L account at the CPA's **printed annual total** (period_month `2025-01-01`), so it reconciles to the GL by construction — imported at annual granularity, lands as the "2025" column in the lifetime (by-year) and Year-2025 P&L views (monthly-2025 drill-down is the accepted limitation). `finComputePnl()` + `finMonthlySeries()` fold `ledger_history` in by account_name/type respecting the active range; live 2026 pipelines untouched, 2025 stays source-isolated for easy reconcile/removal. `finRenderStatements()` income section generalized to list all income-type CoA accounts (Commission Income, Other Income, Interest Income), not just Commission Income. **Reconciliation (gated in `scratchpad/verify-gl-2025.js`):** Income 305,920.67 · COGS 23,279.25 · Gross 282,641.42 · Expenses 186,363.36 · **Net 96,278.06** (≈ 2025 Shareholder Distributions 97,020.99). Verified in-browser via `scratchpad/verify-ledger-pnl.js` (Statements renders the 2025 column, Net 96,278).

### Owner Distributions (2026-07-13, per Dennis — AUTHORITATIVE)
Dennis takes two forms of comp as president: **W2 pay** via Gusto (currently paused to preserve cash flow — an existing Gusto payroll debit, unrelated to this feature) and **Owner Distributions** (GWCU business checking → his personal Chase account). He sometimes reverse-transfers Chase → GWCU to cover a business credit card payment when the operating account is short — those reverse transfers should **net against** the Distributions total, not book as separate income. Standard accounting practice keeps distributions off the Income Statement entirely (they're a draw against after-tax equity, not a business expense) — Dennis confirmed this explicitly and asked for a dedicated statement in the **same visual format as the P&L**, not a line inside Net Income.
- **Outbound (GWCU → Chase) — fully auto-detected, no manual tagging (`isOwnerDistribution()` in `plaid-sync.js`):** matches Plaid `personal_finance_category primary === 'TRANSFER_OUT'` (Plaid's own self-transfer signal) OR the descriptor containing "CHASE" (Dennis's named personal bank). Matched transactions bypass `categorization_rules`/AI entirely and book straight to the equity account **Shareholder Distributions** (already seeded by `20260712_coa_full_gl.sql`) with `review_status='auto'` — positive amount, same "money out" sign convention as every other expense row.
- **Inbound reverse-transfers (Chase → GWCU) — classified via the existing "Owner Transfer" button in Revenue** (`finClassifyDeposit()`/`applyDepositClassification()` in `plaid-sync.js` for rule-matched auto-classify): now inserts a **negative** `expense_transactions` contra row on the same "Shareholder Distributions" account (`dedupe_hash 'depclass_'+id`) instead of just marking the deposit confirmed with no monetary record — same contra-entry convention the old Travel Reimb. bucket used. Per Dennis, **every** inbound Owner Transfer nets against Distributions (no separate "capital contribution" bucket needed).
- **Math example (Dennis's own, verified in `scratchpad/verify-owner-distributions.js`):** $2,500 GWCU→Chase (positive row) + this $500 Chase→GWCU classified Owner Transfer (−$500 contra row) = **$2,000 Net Owner Distributions**.
- **Kept off the P&L everywhere:** `finOffPnlAccounts()` (portal.html) returns the set of CoA account names whose `type` is `equity`/`liability`/`asset` (currently just Shareholder Distributions); `finComputePnl()`, `finMonthlySeries()`, and the Statements "Expense by category" table all skip these rows. The Expenses tab's "Operating spend" tile + top-3-account tiles also exclude them — but the transactions still show in the ledger (with a purple "Equity" badge) for audit visibility, and are manually recategorizable via a new "Equity (off P&L)" `<optgroup>` in the category `<select>` (fallback for the rare case the auto-detector misses a transfer).
- **New "Statement of Owner Distributions" (`finRenderStatements()`):** same `fin-pl` table styling as the P&L, own Export CSV, positioned directly below the P&L — rows: Distributions (GWCU→Personal), Reverse Transfers (Personal→GWCU), **Net Owner Distributions**. Explicitly labeled "excluded from Net Income above."

## Personal Tab (Dennis's private personal-finance suite — 2026-07-14)
The old top-level **Privacy** tab was renamed **👤 Personal** (all ~11 duplicated nav strings + `privacyNav()` now call `renderPersonalView()`). `renderPersonalView()` is a sub-tab shell (mirrors `renderFinanceView()`) with three sub-sections via `personalSubTab` (`privacy` | `bookkeeper` | `coach`) and `personalSubBar()`. This is single-user (just Dennis), not multi-tenant.
- **Privacy sub-tab:** the existing data-broker opt-out tracker, unchanged (see the section below), now nested + one optimization: an overdue re-check banner surfaces confirmed sites past their `next_check_due` (known re-listers) at the top so they resurface without hunting.
- **Data isolation + security (AUTHORITATIVE):** all personal-finance data lives in `personal_*` tables (migration `20260714_personal_finance.sql`) that are **RLS-enabled with NO policies** → the client anon key is fully denied. Every read/write goes through the **service-role Netlify gateway `personal-api.js`** (never supabase-js from the browser), gated by `PERSONAL_ACCESS_KEY` (Netlify env — if set, the UI prompts once for it and stores in sessionStorage `personalKey`, sent as `x-personal-key`; if unset, falls back to origin-only + a nag banner). Never add an anon policy to `personal_*`. Personal Plaid access tokens live under a **separate** `app_config` key `personal_plaid_items`, never mixed with the business `plaid_items`.
- **Bookkeeper sub-tab (`renderBookkeeperView()`):** personal budgeting/assets/debt/reports mirroring the business Finance tab. Sub-nav Budget | Assets | Debt | Reports; range selector (`bkRange`); Chart.js via the shared `finLoadChartJs()`; money via `finMoney`. Tables: `personal_accounts`, `personal_transactions` (amount always positive, `flow` = income|expense|transfer), `personal_debts`, `personal_holdings`, `personal_budgets`, `personal_categorization_rules`, `personal_net_worth_snapshots`. **Net-worth model (no double-count):** Assets = account balances for checking/savings/investment/asset; Liabilities = |credit/loan balances| + manual debts not linked to an account; holdings are a detail view of investment accounts, never added on top. Budget-vs-actual per category for the range; needs_review queue; manual "+ Add" on every table as the Plaid fallback; Export CSV; "Snapshot Net Worth" writes a `personal_net_worth_snapshots` row for the trend chart.
- **Personal Plaid (`personal-plaid-link.js` / `-exchange.js` / `-sync.js`, built on `lib/personal.js` which wraps `lib/plaid.js`):** Link requests `transactions` + `investments` so one flow connects banks/cards AND **Charles Schwab** brokerage (`/investments/holdings/get` → `personal_holdings`). Sync auto-categorizes into the fixed `PERSONAL_CATEGORIES` list (rules → Claude `claude-sonnet-5` batch, confidence <0.7 ⇒ needs_review); money-in = income, money-out = expense, PFC transfers flagged; balances update `personal_accounts` + create/update `personal_debts` for credit/loan; idempotent via `dedupe_hash`. Scheduled `45 11 * * *` (~4:45am PT) in netlify.toml. No commission/deposit-review split (that's business-only).
- **Financial Coach sub-tab (`renderCoachView()`):** AI advisor with sub-nav Net Worth | AI Advisor | Vision Board | Consultant. **Onboarding** (first run, gated on `personal_profile.onboarded`) collects risk tolerance, monthly income/savings, skills, life context, past strategies, and avoided decisions → `personal_profile` (editable via the ✎ Profile button). **Net Worth dashboard**: tiles + trend chart + interactive 1/5/10yr projection (growth% + monthly-contribution sliders, compound math client-side). **AI Advisor**: `personal-finance-agent.js` (nightly `15 12 * * *` ~5:15am PT + manual `run-agent-background?agent=personal_coach`) — same Claude tool-loop + web_search pattern as `finance-agent.js`, reads only personal_* + profile, flags allocation risk / growth levers / behavioral blindspots grounded in his life context, disclaimered, never trades. **Vision Board**: `personal_vision_board` milestones with progress bars driven by net worth, image URL + quote. **Consultant Mode**: `personal-consultant.js` chat (`claude-sonnet-5`) that pressure-tests ideas against his real numbers.
- **Coach reports are service-role-only:** the coach writes to `personal_coach_reports` (migration `20260715_personal_coach_reports.sql`, RLS default-deny) — NOT the anon-readable business `agent_reports` inbox — because personal advice carries private net-worth specifics. Read via `personal-api.js` action `coach_reports`; surfaced only in the Coach view, deliberately not the general Agents inbox.
- **⚠️ Migrations `20260714_personal_finance.sql` + `20260715_personal_coach_reports.sql` not yet applied** (Supabase MCP can't self-approve in this session env). Run both in the SQL editor; the Bookkeeper/Coach degrade gracefully with a banner pointing at the files until then. Optional but recommended: set `PERSONAL_ACCESS_KEY` in Netlify to require a key before any personal data can be read.

## Privacy Tab (Personal — Dennis's own data-broker opt-out tracker)
- **What it is:** a personal-use checklist in Admin for tracking Dennis's own removal requests against people-search sites, marketing data brokers, and background-check companies. Not customer-facing, not multi-tenant.
- **Tab:** "🔒 Privacy" in the admin `portal-tab-nav` (added after Finance in all 11 duplicated nav-bar strings in portal.html) → `renderPrivacyView()`.
- **Tables:** `privacy_optouts` (site_name, category, opt_out_url, method, requires_manual, resubmit_interval_days, status, submitted_at, confirmed_at, next_check_due, notes) seeded with 65 sites from the researched opt-out registry — no personal data in the seed. `privacy_profile` — single row (`id='default'`) holding Dennis's own name/address/phone/email, entered through the tab's "My Info" card, never hardcoded in source or migrations (deliberate — avoids committing his PII to git history).
- **Migration:** `supabase/migrations/20260706_privacy_optouts.sql` — ⚠️ not yet run (Supabase MCP was disconnected when this was built). Must be applied (SQL Editor or MCP) before the tab will load; it fails gracefully with an inline error pointing at the migration file if the tables don't exist yet.
- **Status flow:** not_started → submitted → confirmed (or relisted). Confirming a site with a `resubmit_interval_days` set stamps `next_check_due`; aggressive re-listers (Whitepages, Spokeo, Radaris, ZabaSearch, PeopleFinders) are set to 45 days, other people-search sites to 90, data brokers/background-check to 365.
- **Not yet built:** the actual removal submissions are manual (click "Open ↗", search/verify on the site yourself, submit, then click "Mark Submitted"/"Mark Confirmed" here) — Dennis's stated next step is driving this via Chrome automation, not yet implemented. No scheduled Netlify function exists yet for automated re-check reminders (see the automation/legal-risk analysis already discussed with Dennis — CAPTCHA and email/phone confirmation block full automation on most sites; his own review requests are the safer, ToS-compliant path vs. a bot solving CAPTCHAs at volume).

## Proposal Tool Intelligence (upgraded 2026-07-16, Erik Starkey proposal)
Production math lives in `_propCalcBaseProduction()` (portal.html) — shared by the builder's Projected Savings preview (`propShowScenario`), stored proposals (`sendProposal`), and AI insight (`generateProposalInsight` → `generate-proposal-insight.js`). Three intelligence upgrades:
- **Measured inverter output %** replaces the old hardcoded 25%: builder has a full-width "Restore Existing Array" card (toggle + "% output measured" input, per option; `build.restoreArray` / `build.arrayOutputPct`, persisted as `opt.restore_array`/`opt.array_output_pct` and restored by Load Previous). Recovery = `system_size × 1,600 × (1 − pct/100)`. String inverters often fail PARTIALLY (one MPPT/string down → 40–65% output, not 25%) — always derive pct from measured production: `current kWh/day ÷ expected kWh/day`. The toggle also means recovery counts when the "new inverter" is a **Powerwall 3's integrated 11.5 kW / 6-MPPT solar inverter (20 kW DC input)** — existing strings land directly on the PW3, so a dead string inverter needs NO standalone inverter purchase and per-MPPT tracking replaces legacy optimizers. This is the default cost-reduction play on inverter-failure retrofits.
- **Battery arbitrage scales with storage**: `13.5 kWh × (PW3 units + Expansion Packs) × 1.5 cycles/day`, capped at 60% of the home's daily usage when the bill is on file (a battery can't shift more than the evening load). Old model was fixed 13.5 × 1.5 regardless of quantity.
- **NEM true-up honesty** (`_propSplitByUsage()`): production beyond annual usage (derived `bill × 12 ÷ $0.453`) is valued at ~$0.04/kWh wholesale true-up, not $0.453 retail; surfaces in methodology lines + `prod_data.surplusKwh`. Frame surplus as EV/electrification headroom, not bill savings.
- `prod_data` now stores `outputPct, storageKwh, batteryUnits, batteryCycledDaily, surplusKwh, annualUsageKwh` — customer-facing methodology renders from these (falls back to legacy text for old proposals).
- **Erik Starkey draft proposal**: `supabase/seed/erik_starkey_proposal.sql` (⚠️ not yet applied — run in SQL Editor/MCP; direct DB access was blocked in the build session). Status `draft` → invisible to customer until Dennis loads it in the builder ("Load Previous"), sets retail prices (line items are dealer cost + DRAFT labor/reroof estimates), confirms reroof squares + real monthly bill, and Sends. Full worked analysis in the SQL header comments (21× SunPower 2013 strings at ~51% output + 7× Enphase IQ7 2019 healthy; 63% blended; usage ≈ 18,235 kWh/yr).
- **Proposal JSON round-trips faithfully (2026-07-17)**: `line_items[]` persist their `id` (option_key) and `_propRestoreExisting` prefers it over the option's primary id, plus rehydrates the PW3/Expansion/420W stepper counts from ×N in restored names — battery/panel detection and steppers survive save → Load Previous. The Erik seed carries per-line ids.
- **Tesla Visa gift card promo EXPIRED 2026-07**: all $500/$1,000 Visa references removed from index.html; `_propAddCatItem` and the PW3 stepper no longer copy `tesla_rebate` from the catalog (SDCP rebate logic untouched); customer render shows a neutral "Tesla Rebate" label only for legacy proposals that already carry a value.

## Formatting / Branding SOP (2026-07-17, per Dennis — AUTHORITATIVE)
**Whenever a formatting/branding/layout change comes up, ASK clarifying questions first** (AskUserQuestion) so branding, flow, and formatting stay synonymous across ALL portals (Admin, Tech/Sales, Ops, customer). Don't unilaterally restyle one portal — changes should keep every portal consistent.

## Unified Lead Card (2026-07-17)
All lead cards render through the single `buildLeadCard(c)` function in portal.html — used by both the Admin Leads view and the Tech/Sales Leads view, so every portal shows the **same** card. Contents: name + disposition/step pill, meta line, address **+ SDCP badge** (San Diego Community Power territory by zip via `SDCP_ZIPS`/`extractZip`), assignment line, a badges row (**temperature gauge** `lead_temp` hot/warm/cold via `_leadTempBadge`, INV/AGR/OPS badges, Incomplete-Booking warning), then action buttons: **Edit · Call · Text · Nav (Apple Maps) · Archive** (icon **and** word). Edit routes by role (`openLeadEditor` for admin, `salesEditLead` otherwise). Top Tier cards append confirm/reminder + Open Solar / Service Finance quick-links via `_ttCardExtras`.
- **Magic Link + Proposal moved OFF the card and INTO both editors** (admin `openLeadEditor` + tech `salesEditLead` header action row). The tech leads list no longer has an inline "Update Status" dropdown (dispositions are changed inside the editor, not from the card list).
- **Lead temperature** is settable via a segmented control (`_leadTempControl('ed'|'se', ...)`) in both editors; saved to `customers.lead_temp` by `saveLeadEditor` + `savesSalesEdit`. Was previously only ever set server-side by ghl-inbound.
- **Diagnostic auto-conversion relaxed** (`saveLeadEditor`): a lead converts to a `sold_type='diagnostic'` Job when **invoice_status='paid'** alone (no longer requires agreement_status='signed' too). Jan Burrell paid by check + signed outside Sign & Pay — the strict "paid AND digitally signed" rule left her stuck as a Lead. Invoice = Paid IS the sale.

## Persistent Staff Auth (2026-07-17)
Staff sessions moved from `sessionStorage` (which iOS Safari wipes on backgrounding — the cause of constant iPad re-logins) to **localStorage with a 30-day sliding expiry**. Helpers `_persistUser` / `_readUser` / `_clearUser` in portal.html; `signOut()` clears both. Active use renews the 30 days. Keys: `fmUser`, `fmUserExp`.

## Sign & Pay — payment methods (2026-07-17)
`sign.html` now has a pill row: **Credit Card (3.9%) · Bank/ACH (1%) · Check (0%)**. Fee (surcharge) and the Stripe PaymentIntent are recomputed per method; `sign-init.js` takes a `method` param → `SURCHARGE_PCT` {card:0.039, ach:0.01, check:0} and `payment_method_types` (`card` / `us_bank_account`); check returns `offline:true` with no PI.
- **Card** (3.9%): existing Card Element + `confirmCardPayment` → `sign-complete` (paid). 
- **ACH** (1%): `stripe.collectBankAccountForPayment` (Financial Connections) + `confirmUsBankAccountPayment`; ACH settles in 1–2 days so on `processing`/`succeeded` it records signature + invoice `sent` (pending) via `sign-fallback` `agreement_only`, not immediate paid. ⚠️ **Requires ACH + Financial Connections enabled on the Stripe account** — errors surface inline if not.
- **Check** (0%): fully offline — records signature + pending invoice via `sign-fallback` `agreement_only`; admin marks Paid when the check clears (which then auto-converts to a Diagnostic Job per the relaxed rule above).

## Tablet (iPad) zoom (2026-07-17)
Lead views bumped ~5% on tablet: `@media(min-width:768px) and (max-width:1099px)` sets `html{font-size:16.8px}`, `#dashboard{max-width:none}`, wider `.dash-body` padding — less wasted screen, easier navigation.

## Photo Upload (rep/admin paths — fixed 2026-07-17)
- `uploadPhotos()` no longer hard-requires `#photoStatus`: it falls back to the Tech/Sales editor's `#sePhotoStatus` (or a dummy). Previously a missing element silently aborted the entire upload while `salesUploadPhotos` still reported "✓ N photos uploaded" — the "saved 6 photos but nothing shows" bug. The fabricated success message is removed; the real per-photo status from `uploadPhotos` is shown instead.
- Rep/admin uploads now auto-advance an unsold FixMy lead from step 1 → 2 (Photos Uploaded) on first successful upload, matching the customer-portal upload path.

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
- **Customer-visible status-update notes + push SMS (roadmap, 2026-07-13 — not built yet):** Dennis wants a note type authored as customer-visible (vs. today's internal-only notes on `customers.notes`/`field_notes`/`assessment_notes`) that, on save, fires an SMS to the customer summarizing the project status update. Should reuse GHL LC Phone per the existing SMS Tooling Decision below (not Twilio) — likely a GHL workflow triggered by a webhook call similar to `notify-photo-upload.js`, firing when a note is explicitly flagged customer-visible at save time. Not implemented — flagging so it isn't lost.
- **Plaid auto-sync for statements (LIVE 2026-07-12 — GWCU/AmEx/Citi connected):** `plaid-link-token.js` + `plaid-exchange.js` + `plaid-sync.js` (+ shared `lib/plaid.js`), scheduled `30 11 * * *` (~4:30am PT, before finance-agent). Connect button + status + Sync Now live in Finance → Expenses. Access tokens stored in `app_config` key `plaid_items` (service role only). Dedupe: per-item `start_date` cutoff (= day after newest CSV txn of that kind, set at connect), `dedupe_hash` unique, plus a cross-source (date|amount) guard vs CSV/PDF/manual rows. Skips pending txns, card payments (`LOAN_PAYMENTS`/`TRANSFER_IN` + AUTOPAY regex); handles Plaid `removed[]` reversals. Categorization = same rules→AI pipeline as CSV import. Setup gotcha hit in practice: `PLAID_SECRET` must be the **Production** secret (not Sandbox — separate values per environment in Plaid's dashboard) saved as "same value in all deploy contexts" in Netlify, plus `PLAID_ENV=production` exactly, or Link silently falls back to Plaid's sandbox test bank ("First Platypus Bank").
- **Deposits are never auto-booked as expenses OR silently discarded (fixed 2026-07-12).** Plaid syncs both spend and incoming deposits from a checking account. FixMy/Solar Review customer revenue is intentionally never re-derived from bank deposits — it's already tracked via the `payments` table (GHL sweep + Sign & Pay), which ties each payment to a customer/job; guessing from a deposit line would risk double-booking. BUT Top Tier and New Solar manager-override commissions (owed to Solar Review Corp, 1099 income — see Commission math above) now direct-deposit and have **no other automatic source**. So every incoming deposit lands in `plaid_deposits_review` (migration `20260712_plaid_deposits_review.sql`) instead of being dropped — shown as a review-queue card at the top of Finance → Revenue (`finRenderDepositReviewQueue()` in portal.html) with one-tap **Top Tier / New Solar / Ignore** buttons (`finClassifyDeposit()`). Confirming inserts a `commissions` row (kind=`override`, payee=`solar_review_corp`, status=`paid`) — the existing mechanism that already feeds Revenue + P&L. Ignore is for deposits already entered manually or not revenue at all (Dennis must eyeball for that — no automatic matching to existing manual entries, to avoid over-engineering an unreliable heuristic). `plaid-sync?status=1` also returns `pendingDeposits` count, surfaced as a badge in the Finance → Expenses Plaid status box linking to the Revenue tab. Verified with a mocked-fetch sync harness + a Playwright UI harness asserting the exact `commissions` insert shape.
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
