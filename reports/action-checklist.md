# Dennis's action checklist (kept current by Claude — nagged until done or dismissed)
Status: [ ] open · [x] done · [-] dismissed

## A. Make Meta trackable (≈20 min total)
- [ ] A1. Open Meta Ads Manager → each ACTIVE ad → Edit → "Website URL" → add URL parameters (the box under the URL): `utm_source=facebook&utm_medium=paid&utm_campaign=<name-of-campaign>` → Publish.
- [x] A2. 2026-10-28: Meta has 2 campaigns ("Powerwall · Oct", "Installer rescue · Oct"), both NOT DELIVERING because the ad account shows "Payment unsettled". $321 spent total, 1 website schedule each.
- [x] A0. (done 2026-10-28) Tap "Verify payment method" in Meta Ads app (Solar Review account) and fix the card so ads can run.
- [ ] A3. Google Ads: Settings → Account settings → Auto-tagging ON (confirm).
- [ ] A4. Decide: add "How did you hear about us?" dropdown to /book and the setter form? (Claude builds it, 10 min.)

## B. Search Console (≈10 min, after deploy)
- [x] B1. (done 2026-11-02) Search Console → URL inspection → paste https://fixmy.energy/electricians → Request indexing.
- [x] B2. (done 2026-11-02) Same for /careers.
- [x] B0. 2026-10-28: requested indexing for 5 blog/installer pages (freedom-forever-bankruptcy, sdge-electric-rates-2026, sunrun-vivint, vitl-power, petersen-dean).
- [x] B0b. (done 2026-11-02) /contact, /sungevity, then remaining not-indexed pages.
- [x] B3. (done 2026-11-02) Same for /southern-california-solar-repair and 5 county pages.
- [ ] B4. Same for the 20 city pages (5/day over 4 days). List is in sitemap.xml.

## C. Close the loop on sold jobs
- [ ] C1. When a job sells: mark sold in Pipeline, assign the electrician, same day.
- [ ] C2. After EVERY diagnostic: open the job → write customer report → Schedule box → "Results Review" → pick a day within 48 hours. (Staff text now says this.)

## D. Electricians
- [ ] D1. Send Claude the electrician names/contacts for Calexico, Orange County, Inland Empire when you have them.
- [ ] D2. Post the electrician job on Indeed (free) and Craigslist (gigs/skilled trades) per area.

## E. Freedom Forever / financing partners
- [ ] E1. Decide a price for a "PTO completion" service (or "free evaluation, quote after").
- [ ] E2. Then Claude drafts the outreach email to EnFin, Participate, GoodLeap, EverBright, Sunrun, Credit Human.

## G. W-9s and ops notifications (added 2026-10-28)
- [ ] G1. After deploy: every Setter/Tech sees the W-9 form at next login (Ops can skip). Check Team tab for "W-9 on file" badges.
- [ ] G2. Save the W-9 admin password (given to you in chat) in your password manager; change W9_ADMIN_KEY in Netlify if you want your own.
- [ ] D3. Enter phone numbers + tick the automatic text/email boxes on each Ops Partner card (Team tab).

## F. Ads
- [ ] F1. Send Claude: current Google Ads monthly spend, and which video ads (Quinn vs Quoya) run where. Then compare cost per booked evaluation.

## H. New SEO pages (added 2026-10-29, after deploy)
- [ ] H1. Request indexing in Search Console (5/day) for the 5 new guides first: /solar-panels-not-producing, /solar-inverter-replacement, /solar-monitoring-offline, /add-powerwall-to-existing-solar, /solar-system-health-check. Then the 19 new city pages (list is in sitemap.xml).
- [x] H2. (done 2026-11-02) Submit sitemap.xml again in Search Console (Sitemaps → resubmit) so Google sees all 79 pages.
- [ ] H3. Utah (Salt Lake City, UT): after deploy, request indexing for /utah-solar-repair and then the 16 city pages (5/day). Pages are in sitemap.xml.
- [ ] H4. Utah operations: bookings from Utah are flagged Virtual automatically (50+ miles from every Tech). To allow in-person visits there, enter a Utah ZIP as a Tech's home base (Team card). Tell Claude who the Utah electrician/partner is so we can assign jobs to them.
- [ ] H5. Setter recruiting: post the setter job on LinkedIn (1 free post), Facebook groups, UCSD/SDSU/college boards, Nextdoor, using links like https://fixmy.energy/careers?utm_source=linkedin&utm_medium=job-board&utm_campaign=setter-nov . Applicants show their source in the Hiring tab.
- [ ] H6. Review the careers page income claims ($50-90K year-1 average, $150K top performer): keep only what you can back up with real payroll numbers.

## I. Added 2026-11-02 (deploy went live today)
- [x] I1. (done 2026-11-02) Search Console: the hub, LA, Orange and Riverside pages were already indexed; San Bernardino County indexing requested.
- [x] I2. (Dennis added it 2026-11-02; takes effect after the next deploy) Netlify env var VIRTUAL_MEET_URL = a meet.google.com link (Site configuration → Environment variables), then trigger a deploy.
- [ ] I3. Tell Claude: Axia paid on 11/6 (mark $2,438.10 DC share received); Vijay Ranu $300 keep/delete; "go" to delete the two stale job costs (Sandberg $15,272, Dennis Test $300).
- [ ] I4. Utah compliance questions (HB 57 registration/bond, W-2 vs 1099 reps, contractor license) → counsel or Utah Division of Consumer Protection. Parked in S.U.N., not blocking.
- [ ] H1b. 2026-11-02: the 5 new guides are requested. Still to request (5/day): /utah-solar-repair, then the Utah and California city pages from sitemap.xml.

## J. Higher priority (added 2026-11-03)
- [ ] J1. SDG&E: get listed in the Trade Professional directory / Trade Professional Alliance (needs the CSLB license, so confirm with Cosmic first). Parked: Dennis can't do the TPA now.
- [ ] J2. SDG&E: call the solar contractor support center and ask whether there is a referral path for independent solar repair contractors when a customer calls about a high bill.
- [ ] J3. San Diego Community Power: ask about a partner or referral path (they get the same high-bill calls and already run battery programs).
- [ ] J4. Referral program built 2026-11-03 (feature branch). To finish: (a) run supabase/migrations/20261103_referrals.sql in the Supabase SQL editor, (b) confirm Level 3 amounts, (c) legal review of multi-level payouts, (d) say "Deploy".
