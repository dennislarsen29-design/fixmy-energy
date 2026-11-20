# Internal findings: what Solar Review already has for Utah (checked in the live database and repo, 2026-11-20)

These are first-hand facts from the company's own systems, not web research.

## Black Box (Doors and Dialing lead pool) in Utah
- Total customer rows with a Utah address: 9. Of these, 6 are Black Box (orphaned-list) leads and 3 are normal leads (last one created 2026-10-22).
- The 6 Black Box Utah leads were last created on 2026-07-25. Zero were created in the last 30 days. So the owner is right: Utah is not receiving new Black Box data.
- Of the 6: all 6 have an owner name and coordinates, but only 1 has a phone number. A Dialing queue for Utah is effectively empty; a Doors route is limited to 6 houses.
- The nightly pipeline (bb-auto-pipeline-background.js, Phase 1c) does include 46 Utah cities in its PermitStack rotation, across the top 8 installers, with `&state=UT` on the request. The per-city tally saved in pipeline_state `permit_region_coverage` shows almost every Utah city returned "ok" once and "empty" 7 to 17 times, versus California cities that return many "ok" results. Conclusion: the pull runs but PermitStack returns essentially no Utah permits. Whether PermitStack covers Utah is unverified.
- The most recent nightly run (2026-11-20) completed. Its Tracerfy skip-trace step failed with "Insufficient credits ... need 504 more credits". Phone numbers for any new Utah leads cannot be bought until credits are added.
- Owner names for California leads come from the SanGIS county parcel file loaded into a locked `parcel_owners` table. No equivalent exists for Utah.

## What already exists for Utah
- Public SEO pages: /utah-solar-repair, /solar-repair-salt-lake-city-ut and 16 Utah city pages (in sitemap). Search Console indexing requests for the Utah pages are still on the owner's checklist (item H3).
- Bookings from a Utah address are flagged Virtual Evaluation automatically (more than 50 miles from every Tech home base). The Virtual Evaluation books a 45-minute Google Meet slot.
- Spring Solar is the Utah installation partner (ops id ops_hatkat). Utah proposals finance through Credit Human (20 years at 8.99%), include the Rocky Mountain Power Wattsmart battery incentive line, and use the Artemis external agreement flow for Option 1 and Sign & Pay for single-product options. Utah leads skip the CPUC guide.
- A Utah Diagnostic Service Agreement variant exists (Utah governing law, Salt Lake County courts).
- A new customer-portal "Your Usage Data (Green Button)" upload is live for virtual evaluations.
- Utah team: Cody Larsen sells in Utah. A new rep, Brent Lewis, was onboarded for a Salt Lake appointment.
- The portal treats Utah compliance as a watch item, not a gate (HB 57 retailer registration and bond, W-2 versus 1099 reps, contractor license, Utah cancel notice, city solicitor permits). It is parked as a low-priority S.U.N. queue item.
- Doors and Dialing: Doors builds a GPS route from Black Box leads that have latitude and longitude; Dialing queues Black Box leads that have a phone number. Both depend entirely on the Black Box pool, so with 6 Utah leads neither is usable in Utah yet. Dialing has a script, AI notes, a Focus ZIP filter and a callback queue. Doors has a map, dispositions and doorstep booking.
- Lead source tools that work anywhere: the New Lead form, Lead Locker purchased leads (webhook), /book (virtual flip by address), Meta ads with per-ad tracking.
