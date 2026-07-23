-- ═══ Roadmap rebuild — make the board fully DB-driven + reconcile status ═══
-- (2026-07-23)
--
-- The Roadmap in business-model.html was three overlapping systems: a DB-driven
-- milestones block, a dead localStorage checklist, and ~21 HARDCODED prompt-library
-- cards whose "Done" checkbox PATCHed roadmap_items by key — but only 7 keys were ever
-- seeded (20260703_roadmap_social_items.sql), so checking any of the other 14 cards
-- PATCHed zero rows and silently reset on refresh. It was also stale: several cards
-- shown as "to-do" had already shipped.
--
-- This migration turns roadmap_items into the single source of truth. It:
--   1. Adds the content + workflow columns the board renders from.
--   2. Upserts all 21 static items with their real content and CORRECT status
--      (marking the already-shipped ones done, per CLAUDE.md — the one-time cleanup).
--   3. Seeds a set of noteworthy shipped accomplishments as done "history" rows.
--   4. Keeps the legacy `checked` boolean in sync with the new `status`.
--
-- Prompts are NOT stored here — the long copy-paste prompts stay in the PROMPTS{}
-- map in business-model.html (keyed by `key`); only AI-generated items (source='ai',
-- added by roadmap-agent.js) carry their prompt text in the `prompt` column.
--
-- Idempotent: additive ALTERs + ON CONFLICT upserts. Re-running re-asserts the
-- authored status for the 21 static keys (intended — it's a reconcile), and leaves
-- agent-added rows untouched.

-- ── 1. Schema ──────────────────────────────────────────────────────────────
alter table public.roadmap_items add column if not exists title         text;
alter table public.roadmap_items add column if not exists description   text;
alter table public.roadmap_items add column if not exists dennis_action text;
alter table public.roadmap_items add column if not exists group_key     text;
alter table public.roadmap_items add column if not exists status        text not null default 'todo';  -- todo | active | blocked | done | idea
alter table public.roadmap_items add column if not exists priority      int  not null default 3;        -- 1 = highest
alter table public.roadmap_items add column if not exists effort        text;                           -- quick | medium | large
alter table public.roadmap_items add column if not exists prompt        text;                           -- only set for AI-generated items
alter table public.roadmap_items add column if not exists source        text not null default 'manual'; -- manual | ai
alter table public.roadmap_items add column if not exists sort          int  not null default 100;      -- intra-group order
alter table public.roadmap_items add column if not exists updated_at    timestamptz not null default now();

-- ── 2. Upsert the 21 static items (content + reconciled status) ─────────────
insert into public.roadmap_items
  (key, title, description, dennis_action, group_key, status, priority, effort, sort, source, blocked_by, completed_at) values

  -- 🚀 Marketing & Lead Generation
  ('google-ads', 'Google Ads Conversion Tracking Audit',
   'Verify GA4 + Google Ads conversion events fire on booking completion; fix GTM-TSJVG2GT firing; split select_time_slot and schedule_appointment into two conversion actions.',
   null, 'marketing', 'done', 3, 'medium', 10, 'manual', null, now()),
  ('meta-ads', 'Meta Pixel + Social Retargeting',
   'Build FB/IG retargeting audiences from site visitors who did not book. Add Meta Pixel ViewContent/InitiateCheckout/Schedule/CompleteRegistration to /book. Warm 60-day audience campaign.',
   'Create a Meta Business Manager account and share the Pixel ID. Set budget ($5–$15/day to start).', 'marketing', 'todo', 3, 'medium', 20, 'manual', null, null),
  ('google-biz', 'Google Business Profile Automation',
   'Automate weekly Google Business posts (diagnostics, battery retrofits, orphaned SunPower/Titan). GHL review-request SMS at 3 days post-diagnostic. Review link in the customer portal confirmation.',
   'Log into Google Business Profile, enable messaging, accept GHL review-request access if prompted.', 'marketing', 'todo', 3, 'medium', 30, 'manual', null, null),
  ('seo-blog', 'SEO Blog — Orphaned Installer Keywords',
   'Build /blog targeting "SunPower repair San Diego," "Titan Solar help," "solar diagnostic San Diego." 4–6 high-intent articles + FAQPage JSON-LD. Lazy-load to fix page weight.',
   null, 'marketing', 'todo', 3, 'large', 40, 'manual', null, null),
  ('ghl-sms', 'GHL SMS Workflow — Photo Upload Notification',
   'GHL workflow fired by notify-photo-upload.js → SMS the assigned rep via LC Phone. Removes Twilio. Fallback to Dennis (tech4) for unassigned leads. (Function built; GHL workflow side pending.)',
   'GHL: Workflows → New → Trigger: Inbound Webhook → Action: Send SMS (LC Phone) → activate.', 'marketing', 'todo', 2, 'quick', 50, 'manual', null, null),

  -- 📱 Social Media & Recruitment Automation
  ('ig-dashboard', 'Instagram Growth Dashboard',
   'Social Growth sub-tab in Team: follower chart, reach/views cards, post-performance table, recruit funnel. Powered by ig-insights.js → social_metrics + social_posts.',
   null, 'social', 'done', 3, 'medium', 10, 'manual', null, now()),
  ('ig-token', 'Connect Instagram API (token + Netlify)',
   'Long-lived Meta token for @dennis_t_larsen, add IG_ACCESS_TOKEN + IG_USER_ID to Netlify, redeploy, run first sync so the dashboard fills with live data.',
   'Extend the token in Meta''s Access Token Debugger, add the two env vars in Netlify, redeploy, tap "Sync from Instagram."', 'social', 'todo', 2, 'quick', 20, 'manual', null, null),
  ('ig-fb-publish', 'Publish to Instagram + Facebook from Portal',
   'Build ig-publish.js so a drafted caption + Reel/photo posts to @dennis_t_larsen and the SOLAReview Page in one tap. Ties socials-agent.js drafts → live posts. Works in Dev Mode.',
   null, 'social', 'todo', 3, 'medium', 30, 'manual', 'ig-token', null),
  ('comment-dm', 'Comment-to-DM Lead Funnel (PIVOT / CHECK)',
   'Keyword auto-DM: "PIVOT" → recruit DM w/ comp breakdown; "CHECK" → homeowner DM linking /check. Run via GHL (if plan supports) or ManyChat free tier.',
   'Confirm whether your GHL plan includes IG/Messenger comment + DM automation; if not, create a free ManyChat account.', 'social', 'todo', 3, 'medium', 40, 'manual', null, null),
  ('fb-lead-ads', 'Facebook / Instagram Lead Ads → GHL',
   'Launch a FB/IG Lead Ad to recruit salespeople; pipe leads into GHL with tag candidate-applied so they land in the portal Hiring pipeline.',
   'Connect the Facebook page in GHL, set targeting + a starting daily budget.', 'social', 'todo', 2, 'medium', 50, 'manual', null, null),
  ('fb-lead-bridge', 'FB Lead → Candidates Pipeline Bridge',
   'ghl-candidate-sync.js: receive the GHL webhook and insert FB recruiting leads into the Supabase candidates table (dedupe by email/phone) so they show in the Hiring Pipeline.',
   null, 'social', 'todo', 3, 'medium', 60, 'manual', 'fb-lead-ads', null),
  ('fb-jobs', 'Facebook Jobs Listing (SOLAReview Page)',
   'Post a native Facebook Job listing for the Solar Sales Rep role on the SOLAReview Page; cross-post into local sales-jobs Groups.',
   'Create the Job post on the SOLAReview Page; forward applicants to GHL tag candidate-applied.', 'social', 'todo', 4, 'quick', 70, 'manual', null, null),

  -- 🛠️ CRM & Portal Features
  ('service-packages', 'Service Packages — 3-Tier Offering',
   'Add 3 bookable packages to /book + portal (Basic Diagnostic $149, Full Eval $249, Battery Consult $99 credited). Selection pre-fills diagnostic_fee + shows on sign+pay.',
   null, 'crm', 'todo', 3, 'medium', 10, 'manual', null, null),
  ('monitoring-sub', 'Monitoring Subscription Module',
   'Recurring $29/mo monitoring product via Stripe. Customer subscribes from their portal; admin sees active subscribers + MRR. Recurring revenue line.',
   null, 'crm', 'todo', 2, 'large', 20, 'manual', null, null),
  ('commission-calc', 'Commission Calculator — Finance Tab',
   'Per-rep commission calculation with date-range + rep filter, Mark-Paid, and a 1099 total. (Shipped inside the Finance → Commissions sub-tab.)',
   null, 'crm', 'done', 3, 'medium', 30, 'manual', null, now()),
  ('call-center', 'Call Center CSV Export + Outcome Tracking',
   'Dialer-ready CSV export + per-lead call-outcome tracking for Black Box leads. (Shipped as the Black Box Two-Way Dialer — dispositions, callback queue, ZIP focus.)',
   null, 'crm', 'done', 3, 'medium', 40, 'manual', null, now()),
  ('booking-ux', 'Auto-Redirect After Booking + First-Login Tour',
   'Auto-redirect to the portal magic link after booking + a first-login onboarding tour in the customer portal. (Shipped — _showPortalOnboarding + book.html redirect.)',
   null, 'crm', 'done', 3, 'medium', 50, 'manual', null, now()),

  -- 💰 Finance & Accounting Automation
  ('plaid-sync', 'Plaid Auto-Sync — Bank & Card Statements',
   'Nightly Plaid sync of GWCU/AmEx/Citi into the Finance expense ledger + deposit review queue. (Shipped and LIVE.)',
   null, 'finance', 'done', 2, 'large', 10, 'manual', null, now()),
  ('accounting', 'Accounting System — P&L / Statements / Reports',
   'Full accounting suite replacing the CPA bookkeeping: chart of accounts, P&L in the CPA''s QuickBooks layout, statements, 1099 prep, AI Advisor. (Shipped; direct QuickBooks-Online API sync is the only remaining sliver.)',
   null, 'finance', 'done', 3, 'large', 20, 'manual', null, now()),

  -- 👥 Staff & Hiring
  ('hiring', 'Hiring Pipeline — Careers + Candidates',
   'careers.html application flow → Supabase candidates table + GHL tag candidate-applied → portal Hiring pipeline with status tracking. (Shipped.)',
   null, 'staff', 'done', 3, 'medium', 10, 'manual', null, now()),

  -- 📱 Future Dev
  ('phone-app', 'PWA / Phone App Conversion',
   'Convert the portal to an installable PWA (manifest + service worker) so techs/setters add it to the home screen; offline Black Box canvassing + push for hot leads. (Push plumbing exists; manifest/SW pending.)',
   null, 'future', 'todo', 4, 'large', 10, 'manual', null, null),
  ('ghl-webhook', 'GHL AppointmentCreate Webhook — Auto-Populate Dates',
   'When a customer books via /book, GHL fires a webhook so diagnostic_date auto-populates. ghl-inbound.js already parses it — GHL-only config, ~10 min, no code.',
   'GHL: Automations → "FixMy Energy Solar Appointment Confirmation" → Add Webhook → POST to https://fixmy.energy/.netlify/functions/ghl-inbound → Save.', 'future', 'todo', 1, 'quick', 20, 'manual', null, null)

on conflict (key) do update set
  title         = excluded.title,
  description   = excluded.description,
  dennis_action = excluded.dennis_action,
  group_key     = excluded.group_key,
  status        = excluded.status,
  priority      = excluded.priority,
  effort        = excluded.effort,
  sort          = excluded.sort,
  source        = excluded.source,
  blocked_by    = excluded.blocked_by,
  completed_at  = case when excluded.status = 'done'
                       then coalesce(public.roadmap_items.completed_at, now())
                       else null end,
  updated_at    = now();

-- ── 3. Noteworthy shipped accomplishments (Completed / history) ─────────────
insert into public.roadmap_items
  (key, title, description, group_key, status, source, sort, completed_at) values
  ('acc-signpay',        'Sign & Pay page (Stripe Elements)',            'Combined customer agreement + card/ACH/check payment page — PCI-compliant, amount locked server-side.', 'history', 'done', 'manual', 10, timestamptz '2026-07-01'),
  ('acc-finance',        'Solar Review Finance — accounting system',     'Dashboard, P&L in the CPA''s QuickBooks layout, Sub Sheet, Commissions, Expenses, Statements, AI Advisor — designed to replace the $145/mo CPA bookkeeping.', 'history', 'done', 'manual', 20, timestamptz '2026-07-08'),
  ('acc-blackbox-dialer','Black Box Two-Way Dialer',                     'Power-dialer over Black Box leads with dispositions, callback queue, ZIP focus, and two-way note share with the canvass view.', 'history', 'done', 'manual', 30, timestamptz '2026-07-02'),
  ('acc-deposit-review', 'Plaid Deposit Capture + Review Queue',         'Incoming TT/NS override deposits captured from Plaid into a Revenue review queue with one-tap classification + auto-classify rules.', 'history', 'done', 'manual', 40, timestamptz '2026-07-12'),
  ('acc-personal-suite', 'Personal Finance Suite',                       'Dennis''s private Bookkeeper, Personal Loan module, Financial Coach, and Privacy opt-out tracker — service-role isolated.', 'history', 'done', 'manual', 50, timestamptz '2026-07-14'),
  ('acc-proposal-intel', 'Proposal Tool Intelligence upgrade',           'Measured inverter-output recovery, storage-scaled battery arbitrage, and honest NEM true-up math in the proposal builder.', 'history', 'done', 'manual', 60, timestamptz '2026-07-16'),
  ('acc-unified-card',   'Unified Lead Card across all portals',         'One buildLeadCard() renders the same lead card in Admin and Tech/Sales — SDCP badge, consistent actions, editor-routed by role.', 'history', 'done', 'manual', 70, timestamptz '2026-07-17'),
  ('acc-quoya-async',    'Quoya Async Photo Categorization',             'Photo upload decoupled from the AI call — uploads save instantly, categorization runs via a manual Sync button + nightly sweep. Fixed the job_photos schema mismatch behind failing uploads.', 'history', 'done', 'manual', 80, timestamptz '2026-07-22')
on conflict (key) do nothing;

-- ── 4. Keep the legacy `checked` boolean in sync with `status` ──────────────
update public.roadmap_items set checked = (status = 'done');
