# Local Scripts

## accela-scraper.js — Accela Citizen Access permit scraper

Scrapes solar permits from SD-area AHJ portals (not available via API).

### Setup (one-time)
```bash
npm install
npx playwright install chromium
```

### Usage
```bash
# All three portals, all 16 installers (~30-90 min)
node scripts/accela-scraper.js --city all

# Single city
node scripts/accela-scraper.js --city sandiego
node scripts/accela-scraper.js --city chulavista
node scripts/accela-scraper.js --city oceanside

# Single installer name (for testing)
node scripts/accela-scraper.js --city sandiego --name "Complete Solar Inc"

# npm shortcuts
npm run scrape-accela
npm run scrape-sd
```

### Output
CSV file written to `scripts/accela-permits-{city}-{date}.csv`.

### Import
Paste CSV contents into **portal.html → Admin → Import tab** → Parse CSV → Enrich All → Import.

### Portals
| City | URL |
|------|-----|
| San Diego (DSD) | https://aca.accela.com/sandiego/ |
| Chula Vista | https://aca.accela.com/chulavista/ |
| Oceanside | https://aca.accela.com/oceanside/ |

### Notes
- Runs headless Chromium — no visible browser window
- Accela portals are government sites with no bot detection; plain Playwright is sufficient
- If a portal URL changes, update `PORTALS` at the top of `accela-scraper.js`
- For platforms with aggressive fingerprint detection (Indeed, LinkedIn), consider Cloak Browser as an anti-detect layer

## seo-audit.js
`node scripts/seo-audit.js` crawls every public HTML page and writes `reports/seo-audit.md` (title/meta length, H1, canonical, JSON-LD validity, alt text, broken internal links, thin pages, duplicates, sitemap coverage). Free, offline.

## Market report (netlify/functions/market-report-background.js)
Hit `/.netlify/functions/market-report-background?city=Austin&state=TX` from fixmy.energy (origin-allowlisted). POST `{keywordCsv}` to include a Google Keyword Planner export. Files a report in the Agent Inbox (agent `seo`). Costs only Anthropic credits.
