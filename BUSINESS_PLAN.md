# FIXMy.Energy — Business Plan
**Solar Review Corp (DBA: FIXMy.Energy)**
San Diego, California | fixmy.energy
Last Updated: April 2026

---

## 1. Business Overview

FIXMy.Energy is a solar diagnostic and battery retrofit company serving Southern California homeowners with existing solar systems. The core insight: **millions of solar systems installed 5–15 years ago are underperforming, unmonitored, or incompatible with modern battery storage** — and homeowners don't know it.

We sell a fee-based diagnostic service that identifies problems, then convert a portion into higher-value battery retrofits, system expansions, and monthly monitoring subscriptions.

**Territory:** LA, Orange, Riverside, San Bernardino, San Diego counties

**Legal Entity:** Solar Review Corp (DBA: FIXMy.Energy)

---

## 2. Services & Revenue Model

### Service Menu

| Service | Customer Price | Company Net | Rep Commission |
|---------|---------------|-------------|----------------|
| Diagnostic Evaluation | $149–$499 | $149.40 | $99.60 |
| Battery Retrofit (Powerwall 3) | $19,999 | $3,299.40 | $2,199.60 |
| System Expansion / Panel Add | Per quote | 60% of gross | 40% of gross |
| Monitoring Subscription | $49.99/mo | $25.80/mo | $17.20/mo |

### Revenue Model
- **Diagnostic** = cash-flow entry point. Low resistance, immediate revenue.
- **Battery Retrofit** = primary profit driver. One close = $3,299 to company.
- **Monitoring** = recurring revenue. 100 active accounts = $2,580/mo passive.
- Diagnostic-to-retrofit conversion is the most important metric to track and optimize.

### Commission Formula
`Fixed Revenue − Fixed Costs = Gross Commission × 40% = Rep Pay`

Rep earns 40%, company keeps 60% of gross commission on every transaction.

---

## 3. Target Customer

**Primary:** Southern California homeowners with an existing solar system (installed 2010–2020) who:
- Are unhappy with their utility bill despite having solar
- Have never had their system professionally inspected
- Don't know if their system is working at full capacity
- Are interested in battery backup (post-wildfire / outage concerns)

**Secondary:** Homeowners considering solar for the first time. Dennis has 10+ years operating in new solar installation — this remains an active service line alongside diagnostics and retrofits.

**Psychographic:** Homeowners aged 40–65, household income $120K+, own their home, concerned about energy costs and grid reliability.

**Geographic focus (near-term):** San Diego County first, then expand north.

---

## 4. Sales Process (Steps 1–8)

The portal tracks every lead through 8 stages:

| Step | Status | Action Owner |
|------|--------|-------------|
| 1 | Evaluation Booked | Setter books appt |
| 2 | Photos Uploaded | Tech uploads site photos |
| 3 | Diagnostic Booked | Tech confirms diagnostic date |
| 4 | Analysis Done | Tech completes report |
| 5 | Battery Retrofit: Presentation Done — Follow Up Needed | Sales follow-up |
| 6 | Battery Retrofit: Presentation Done — Not Sold | Dead / nurture |
| 7 | Install Booked | Ops schedules install |
| 8 | Monitoring Online | Job complete |

**Sold trigger (moves Lead → Job):**
- `diagnostic` — Diagnostic completed and paid
- `battery_retrofit` — Loan signed, PPA signed, or $1,000 deposit collected
- `monitoring` — Subscription activated *(coming soon)*

---

## 5. Team Structure

| Role | Name | Function |
|------|------|----------|
| Admin / Owner | Dennis Larsen | Operations, strategy, installs (self) |
| Field Setter | Ronda | Door-to-door lead generation, books evals |
| Tech / Sales | Juan | Field diagnostics, battery sales |
| Tech / Sales | Ranie | Field diagnostics, battery sales |
| Tech / Sales | Michael Smith | Field diagnostics, battery sales |
| Ops Partner | Jon Klos | Installs |
| Ops Partner | John Espinoza | Installs |
| Ops Partner | Cosmic Solar | Installs |

**Onboarding/offboarding** is managed in the Admin portal → Team tab (DB-driven, no code changes needed).

---

## 6. Technology Stack

| System | Purpose |
|--------|---------|
| fixmy.energy | Public marketing site (Netlify, static HTML) |
| portal.html | Internal portal — leads, jobs, team, customer-facing |
| Supabase | Database (customers, rep_agreements, team_members, portal_credentials) |
| Go High Level (GHL) | CRM automation, SMS/email sequences, booking calendar |
| Sheet.best | Spreadsheet sync (backup / reporting) |
| Google Maps API | Address validation + satellite view in lead capture |

**GHL Webhook:** Fires on new lead submission and rep agreement signing.

---

## 7. Current State (April 2026)

### ✅ Built & Working
- Customer portal (login, progress tracker, steps 1–8)
- Admin portal (Leads tab, Jobs tab, Team tab)
- Rep portal (Ronda) — new lead form, map view, Leads/Jobs split (sold_type)
- Tech portal — Leads/Jobs, field job assignments, photo uploads
- Ops portal — assigned job view
- Agreement signing flow (digital signature, Supabase-backed, print-to-PDF)
- Team onboard/offboard (DB-driven via team_members table — "+ Add Member", Deactivate/Reactivate)
- GHL webhook integration on lead submit
- sold_type field (Diagnostic / Battery Retrofit / Monitoring) fully wired — drives Leads vs Jobs split across admin, tech, and rep portals
- Admin Leads: Tech + Ops filter dropdowns (DB-driven from team_members)
- Business Model page (token-gated /business-model.html, noindex, linked from Admin portal)

### 🔧 In Progress / Needs Testing
- GHL automation sequences (SMS/email confirmation, reminders, follow-ups)
- End-to-end lead flow: portal submit → GHL contact created → booking confirmation sent
- Monitoring subscription service (not yet launched)

### ❌ Not Yet Built
- Public marketing site content (SEO pages, service descriptions)
- Paid advertising (Google LSA, Meta ads)
- Customer review / referral flow
- Invoicing integration (currently manual)
- Reporting dashboard (revenue, conversion rates, rep performance)

---

## 8. Go-to-Market Strategy

### Phase 1 — Local Density (Now → Month 3)
**Goal:** 10–20 diagnostics/month, 2–4 battery retrofits/month

- **Field outreach:** Ronda + techs knock doors in neighborhoods with high solar density (Chula Vista, El Cajon, Santee, Poway, Escondido — high solar adoption zip codes). Target homes with visible panels.
- **Referral seeding:** Every completed diagnostic = ask for 2 referrals.
- **GHL follow-up automation:** Every booked eval gets automated reminders. Every no-close gets a 30/60/90-day nurture sequence.
- **Google Business Profile:** Fully optimized — photos, services, responses to reviews.

### Phase 2 — Digital Lead Gen (Month 2 → Month 6)
**Goal:** 30–50 diagnostics/month, 8–12 retrofits/month

- **Google Local Services Ads (LSA):** "Solar inspection San Diego," "solar battery backup," "solar not working." Pay per lead, not per click. Highest ROI for a local service business.
- **SEO landing pages:** `/solar-diagnostic-san-diego`, `/battery-backup-installation`, `/powerwall-installer-san-diego` — each targeting a high-intent keyword cluster.
- **Facebook/Instagram:** Before/after content, educational reels (why solar systems degrade), testimonials. Retarget site visitors with offer ads.

### Phase 3 — Scale (Month 6+)
**Goal:** $50K+/month revenue, multiple reps, expand to LA/OC

- Hire 2–3 additional field setters
- Launch monitoring subscription service
- Explore solar financing partnerships (increase battery retrofit close rate)
- Expand to LA and Orange County with local ops partners

---

## 9. Revenue Projections

### Conservative (Month 1–3)
| | Diagnostics | Battery Retrofits | Monitoring |
|--|------------|------------------|------------|
| Volume | 10/mo | 2/mo | 5 subs |
| Gross Revenue | $4,990 | $39,998 | $249.95/mo |
| Company Net | $1,494 | $6,598.80 | $129/mo |
| **Monthly Total** | | | **~$8,222** |

### Target (Month 4–6)
| | Diagnostics | Battery Retrofits | Monitoring |
|--|------------|------------------|------------|
| Volume | 30/mo | 8/mo | 25 subs |
| Gross Revenue | $14,970 | $159,992 | $1,249.75/mo |
| Company Net | $4,482 | $26,395.20 | $645/mo |
| **Monthly Total** | | | **~$31,522** |

**Key lever:** Every additional battery retrofit close is worth $3,299 to the company. Improving diagnostic-to-retrofit conversion rate from 20% → 35% roughly doubles revenue without adding a single new lead.

---

## 10. 90-Day Priority Roadmap

### Week 1–2 (Immediate)
- [ ] Run Supabase SQL: create team_members table, seed existing members
- [ ] Test full GHL automation end-to-end: lead submitted → contact created → SMS/email fires
- [ ] Verify booking confirmation goes out when eval is booked
- [ ] Dennis completes 5 diagnostics to establish baseline conversion data

### Month 1
- [ ] Ronda in field 4 days/week — target 3 booked evals/day
- [ ] Set up Google Business Profile (photos, services, get first 5 reviews)
- [ ] Set up Google Local Services Ads ($500/mo starting budget)
- [ ] Add SEO landing page: `/solar-diagnostic-san-diego`
- [ ] Build GHL 30/60/90-day nurture sequence for non-closes

### Month 2
- [ ] Launch Facebook/Instagram with 3 content pieces (educational format)
- [ ] Set up customer referral ask (automated GHL message 3 days post-diagnostic)
- [ ] Add reporting view to admin portal (conversion rate, revenue by rep)
- [ ] Evaluate adding 1 additional field setter

### Month 3
- [ ] Review diagnostic-to-retrofit conversion rate — identify top objection
- [ ] A/B test diagnostic price point ($299 vs $499) to optimize volume vs margin
- [ ] Launch monitoring subscription service in portal + GHL flow
- [ ] Evaluate expansion to Riverside/Orange County

---

## 11. Key Metrics to Track

| Metric | Target (Month 3) | Target (Month 6) |
|--------|-----------------|-----------------|
| Diagnostics/month | 20 | 50 |
| Diagnostic → Retrofit conversion | 20% | 30% |
| Battery retrofits/month | 4 | 15 |
| Active monitoring subs | 10 | 50 |
| Avg revenue per rep/month | $3K | $8K |
| Company net revenue/month | $12K | $40K |
| GHL lead response time | < 5 min | < 5 min |

---

## 12. Open Questions / Decisions Needed

- [ ] **Financing partner:** Do we integrate a solar loan partner to improve retrofit close rate? (GreenSky, Mosaic, etc.)
- [ ] **PPA model:** The portal mentions PPA signed as a retrofit trigger — is this being pursued?
- [ ] **Monitoring hardware:** What hardware/platform powers the monitoring subscription?
- [ ] **Licensing:** Are all techs CSLB licensed or operating under Dennis's license?
- [ ] **Insurance:** General liability + E&O coverage in place?
- [ ] **W-9s:** Collected from all 1099 reps?

---

*This document is maintained in the fixmy-energy repo and referenced during development sessions to ensure all technical work aligns with business priorities.*
