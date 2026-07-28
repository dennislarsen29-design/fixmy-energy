-- ═══ New roadmap task: recorded Welcome / Term-Confirmation Call (2026-07-28, per Dennis) ═══
-- Virtual term-confirmation interview (CallPilot/Sunrun-style TPV) delivered via SMS+email link,
-- wired through GHL (delivery) and Quoya (AI processing). Carries its own build prompt with the
-- full legal research + script so the board's 📋 Prompt button works without a PROMPTS entry.
insert into public.roadmap_items
  (key, title, description, dennis_action, group_key, status, priority, effort, sort, source, prompt) values
  ('welcome-call-verification',
   'Recorded Welcome / Term-Confirmation Call (GHL + Quoya)',
   'Add a recorded "Welcome Call" -- a virtual term-confirmation interview, similar to CallPilot / Sunrun-style third-party verification -- that locks in the customer''s understanding of the signed agreement, captures a valid CA-compliant recording consent, verifies identity via an uploaded ID, and creates an audit-proof record in case of a dispute, chargeback, or regulatory audit. Delivered automatically via GHL SMS + email link after Sign & Pay / contract signing on FixMy diagnostic, battery retrofit, and New Solar deals.',
   'Decide build-vs-buy: license a TPV vendor like CallPilot (fast, adds a paid third-party dependency) vs. build an in-house AI voice-agent flow on GHL/Twilio (slower, fully owned, but dialer-notes.js already proves out the speech-to-text + Claude pattern in this codebase). Also decide: (1) who can access uploaded driver''s license images and how long to retain them, (2) whether every sold ticket needs this or just battery/new-solar/larger jobs, (3) get the final script attorney-reviewed before launch -- this research is a starting point, not legal advice.',
   'crm', 'todo', 2, 'large', 6, 'manual',
   'Add a recorded "Welcome Call" — a virtual term-confirmation interview similar to CallPilot''s AI-powered third-party verification (TPV) or Sunrun-style post-sale quality-assurance calls — to the FixMy.Energy / Solar Review portal, wired through GHL (delivery) and Quoya (AI processing, matching the existing Anthropic-vision pattern already used for photo categorization).

GOAL
A sales-friendly, fast way to get a recorded confirmation from every customer that: they understand the agreement they signed, no side promises were made, they understand their cancellation rights, and their identity matches the signer on file — creating an audit-proof record for disputes, chargebacks, or a regulatory inquiry. Delivered automatically via SMS + email link so the customer can complete it on their own phone in a few minutes, no app download.

CONTEXT — mirror these existing patterns, don''t rebuild them
- sign_token / sign.html / sign-init.js / sign-complete.js is the exact existing pattern for a token-gated customer-facing link: generate a UUID token with an expiry, store it on customers, text+email a "fixmy.energy/welcome?t=TOKEN" link, validate server-side before showing anything.
- SMS delivery MUST go through GHL LC Phone, not Twilio — this is an existing authoritative decision in CLAUDE.md ("SMS Tooling Decision"). Trigger a GHL workflow via webhook, same shape as ghl-diag-agreement.js.
- Email delivery uses Resend (RESEND_API_KEY), same pattern as rep-onboard.js / agent-report-digest.js.
- ID photo upload should reuse the job_photos storage-bucket pattern (Supabase Storage + a DB row), but MUST NOT be dumped in the same customer-visible photo grid — driver''s license images are sensitive PII and need their own access-restricted table/bucket, service-role-gated like the personal_* tables (RLS enabled, no anon policies), not anon-key readable like job_photos is today.
- Quoya (netlify/functions/lib/quoya.js pattern) already does Anthropic-vision categorization server-side, after upload, off the critical path — the ID-verification pass (does the uploaded photo look like a real driver''s license, does the printed name plausibly match the signer name on file) should follow the exact same decoupled pattern: save first, verify async, never block the customer''s flow on an AI call.
- Trigger point: fire the Welcome Call link the same moment Sign & Pay completes (sign-complete.js) for tickets that go through Sign & Pay, OR a manual "Send Welcome Call" button in the admin/tech lead editor (mirroring the existing sign-link share popup''s Copy Link / Text It buttons) for battery retrofit / new-solar deals that don''t route through Sign & Pay.

BUILD-VS-BUY — needs a decision before implementation, not assumed
Option 1 — License an existing TPV vendor (CallPilot or similar), lower engineering lift. CallPilot (callpilot.app) is a real, SOC 2-certified product built for exactly this: AI-powered third-party verification with identity verification, an "Intelligent Virtual Interviewer" that runs the actual call, sentiment/liveness analysis, and a secure portal — built specifically in response to deceptive door-to-door solar/home-improvement sales practices. Solar Review would trigger a verification session via their API/webhook after a sale, they place/receive the call and run the script, and post results back to a Solar Review webhook (same shape as ghl-status-update.js ingesting an external status change). Fast to launch, offloads telephony + compliance liability to a vendor, but adds a recurring paid dependency and a contract negotiation.
Option 2 — Build an in-house AI voice-agent flow on GHL/Twilio Voice (or another conversational-AI voice API), higher engineering lift but fully owned, no per-call vendor fee, and reuses in-house Claude tooling already proven in this codebase (dialer-notes.js already does live speech-to-text + Claude summarization for the Black Box dialer — genuinely similar technology, could share code). Needs real telephony infra (outbound/inbound call handling, recording storage, transcription) that doesn''t exist in this codebase today — this is the larger lift of the two options.
Recommendation for Dennis to weigh in on: given dialer-notes.js already proves out live speech-to-text + Claude summarization in this exact codebase, Option 2 may be more buildable than it looks — but Option 1 (CallPilot) is faster to ship and offloads legal/compliance risk to a vendor built for this exact problem. Get a CallPilot pricing quote before committing to build vs buy.

LEGAL RESEARCH — grounding for the script, NOT a substitute for attorney review before launch
- California is an all-party ("two-party") consent state for recording phone calls (Penal Code 632, extended to cell/cordless calls by 632.7). Every party must consent BEFORE recording starts. Violations carry criminal penalties (fine up to $2,500, up to 1 year in jail) and civil liability under Penal Code 637.2 ($5,000 statutory damages per call, no proof of actual harm required, and courts have held each recorded call can be a separate violation). This means the recording-consent question MUST be asked and affirmatively answered before any other substantive question is asked on the recording — Dennis''s question #1 already gets this right, it just has to stay literally first, no exceptions, every time.
- California''s Home Solicitation Sales Act (Civil Code 1689.5 et seq.) gives the buyer the right to cancel until midnight of the 3rd business day after signing (5th business day if the buyer is a senior citizen). The written contract must carry a conspicuous cancellation notice near the signature line in at least 10-point bold type, AND the seller must separately inform the buyer ORALLY of the right to cancel at the time of signing. If the written notice is missing or non-compliant, the cancellation window stays open indefinitely. The Welcome Call''s right-to-cancel question is a second, recorded confirmation that the oral disclosure actually happened and was understood — valuable evidence if a customer later disputes the timeline.
- The FTC''s federal Cooling-Off Rule (16 CFR 429) independently gives a 3-business-day cancellation right for door-to-door sales over $25 — it runs alongside the CA state right, whichever is more protective controls; both should be referenced in the script''s cancellation question, not just the state one.
- California Business & Professions Code 7159 (home improvement contracts) and 7169 (Solar Energy System Disclosure Document, effective 2019 per AB 1070) require every residential solar contract to carry a specific disclosure document on the contract''s cover page, printed boldface 16-point type, covering total system cost including financing costs, savings assumptions, and the complaint/cancellation process. The Welcome Call should confirm the customer received AND reviewed this specific document, not just "the agreement" generically — worth a dedicated question distinct from Dennis''s general "did you get a copy of the agreement" question.
- TCPA: since this is a servicing/verification contact to an existing signed customer (not a cold marketing call), sending the link via SMS/email should qualify as a lower-bar "prior express consent" informational message rather than needing prior express WRITTEN marketing consent — but best practice is to have the primary sale agreement itself include a line authorizing contact by call/text/email for account servicing and this specific verification step, so consent is documented in writing at the point of sale, not just assumed.
- The battery-limitation question (Dennis''s question on backup power) and the "no side promises" question (Dennis''s question about being promised anything outside the notated agreement) aren''t tied to a specific statute — they''re anti-misrepresentation safeguards. The CPUC''s California Solar Consumer Protection Guide specifically flags exaggerated-savings claims and misunderstood backup-power capability as the most common consumer complaint categories in residential solar, so these questions directly target the two most litigated/disputed misrepresentation categories in the industry, not just a generic CYA.
- Identity/PII handling: the uploaded driver''s license image is sensitive PII. Store it access-restricted (service-role gateway only, no anon-key read path), define a retention policy (how long Solar Review keeps a copy and who can view it — likely admin/ops only), and never surface it in any customer-facing or partner-facing view. This mirrors the existing personal_* tables'' RLS-enabled-no-policies pattern already used elsewhere in this codebase for sensitive data.

THE SCRIPT — Dennis''s 11 questions verbatim, then recommended additions grounded in the research above

Core questions (verbatim from Dennis, do not reword):
1. Do you understand this call is being recorded?
2. Are you [insert homeowner name]?
3. Do you own the home listed on [customer address]?
4. Did you sign up with [Tech name]?
5. Can you confirm your email by saying and spelling?
6. Did you get a copy of the agreement sent to your email notated?
7. Were you promised anything outside of the notated information on your agreement?
8. Do you understand your right to cancel?
9. Do you understand that a backup battery is not an infinite source of energy and will go dead when you use all the power; it may have limitations on hardware attempted to backup to in the home like a welder, AC unit, heater, EV charger, etc?
10. Do you understand we will begin pulling permits and incurring fees on your behalf to complete the project?
11. Could you please rate your experience with [tech] on a star rating of 1-5?
Plus the closing instruction Dennis gave: "Please upload your Drivers License that matches the application here or email to Info@fixmy.energy"

Recommended additions (grounded in the legal research above, present to Dennis for approval before adding to the live script — do not silently insert these into the recorded flow without his sign-off):
A. "Did you receive and review the Solar Energy System Disclosure Document that shows the total cost of your system, including any financing costs?" — targets the specific BPC 7169 boldface disclosure document, distinct from "the agreement" generically.
B. "Do you understand that any savings estimates you were shown are projections, not guarantees, and that your actual utility bill and savings may vary?" — targets the CPUC''s most commonly litigated complaint category (exaggerated savings claims).
C. "Do you understand that permit approval and utility interconnection timelines are set by the city/county and your utility, not by Solar Review, and are not guaranteed by a specific date?" — targets the second most common dispute category (installation/interconnection delay complaints).
D. "The name and date of birth on the ID you are about to upload should match the name on your signed agreement — can you confirm that?" — ties the identity-verification step directly to fraud/elder-abuse prevention, not just a generic ID grab.
E. A closing line logging where the customer can request a copy of this recording or ask follow-up questions (Solar Review contact info), read on every call for transparency and to close the audit trail cleanly.

DATA MODEL (draft, confirm exact fields when building)
customers: welcome_call_status (none|sent|in_progress|completed|failed), welcome_call_token, welcome_call_token_expires_at, welcome_call_completed_at, welcome_call_recording_url, welcome_call_transcript, id_verified_status (pending|matched|mismatch|skipped).
New restricted table (or storage bucket) for the uploaded ID image itself, service-role gated only — do not reuse job_photos or any anon-readable table.

STEPS
1. Get Dennis''s build-vs-buy decision (CallPilot quote vs in-house voice-agent build) before writing any call/recording infrastructure.
2. Get the final script (Dennis''s 11 questions + whichever of the 5 recommended additions Dennis approves) reviewed by an attorney — this research is a starting point, not legal sign-off.
3. Decide which tickets require this (all sold jobs, or just battery retrofit/new-solar/tickets above a size threshold).
4. Build the token-gated link + SMS/email delivery (mirror sign_token/sign.html), the restricted ID-upload storage, and the customer record fields above.
5. Wire the AI processing (transcription + pass/fail scoring per question, ID-name-match check) through Quoya''s existing decoupled async pattern if building in-house, or through CallPilot''s webhook if licensing.
6. Surface a Welcome Call status badge + "Send Welcome Call" button in the admin/tech lead editor, and a way to play back the recording/read the transcript from the editor.
7. Document the flow and the legal citations above in CLAUDE.md once built, and mark this roadmap item done.')
on conflict (key) do nothing;
