#!/usr/bin/env node
/**
 * accela-scraper.js
 * Scrapes solar permits from Accela Citizen Access portals for SD-area AHJs.
 *
 * Usage:
 *   node scripts/accela-scraper.js [--city sandiego|chulavista|oceanside|all] [--name "SunPower"]
 *
 * Examples:
 *   node scripts/accela-scraper.js --city all
 *   node scripts/accela-scraper.js --city sandiego --name "Complete Solar Inc"
 *
 * Output: accela-permits-{city}-{YYYY-MM-DD}.csv  (in scripts/ directory)
 * Import: paste output CSV into portal.html → Admin → Import tab → Parse CSV
 *
 * Requirements:
 *   npm install playwright
 *   npx playwright install chromium
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORTALS = {
  sandiego:   'https://aca.accela.com/sandiego/',
  chulavista: 'https://aca.accela.com/chulavista/',
  oceanside:  'https://aca.accela.com/oceanside/',
};

// Same list as PS_INSTALLERS in portal.html — kept in sync by hand, no build step.
const INSTALLER_NAMES = [
  { label: 'SunPower',            names: ['SunPower Corporation', 'Complete Solar Inc', 'BRS Field Ops'] },
  { label: 'Titan Solar',         names: ['Titan Solar Power', 'Titan Solar'] },
  { label: 'Sunnova',             names: ['Sunnova Energy International', 'Sunnova Energy'] },
  { label: 'Sullivan Solar',      names: ['Sullivan Solar Power', 'Sullivan Solar Power of California'] },
  { label: 'Petersen Dean',       names: ['Petersen-Dean', 'Petersen Dean', 'PetersenDean'] },
  { label: 'Sungevity',           names: ['Sungevity Inc', 'Horizon Solar Power', 'Solar Spectrum'] },
  { label: 'Kota Energy',         names: ['Kota Energy Group LLC', 'Kota Energy Group'] },
  { label: 'OneRoof Energy',      names: ['OneRoof Energy Inc'] },
  { label: 'Verengo',             names: ['Verengo Inc', 'Verengo Solar'] },
  { label: 'American Solar Direct', names: ['American Solar Direct Inc'] },
  { label: 'Freedom Forever',     names: ['Freedom Forever LLC'] },
  { label: 'ADT Solar',           names: ['ADT Solar LLC'] },
  { label: 'RGS Energy',          names: ['Real Goods Solar Inc', 'RGS Energy', 'Alteris Renewables'] },
  { label: 'Pink Energy',         names: ['Pink Energy'] },
  { label: 'Vision Solar',        names: ['Vision Solar'] },
  { label: 'Lumio',               names: ['Lumio Inc', '1st Light Energy'] },
  { label: 'Infinity Energy',     names: ['Infinity Energy Inc', 'Infinity Energy'] },
  { label: 'Suntuity Renewables', names: ['Suntuity Renewables', 'Suntuity'] },
  // Backfilled 2026-09-03 — Sunworks/SunPro Solar were live in PS_INSTALLERS and the nightly
  // pipeline's INSTALLERS array but were never mirrored here. Found while auditing this list
  // for the 5 new defunct-installer additions below — same "built in one place, not the
  // other" drift documented repeatedly in CLAUDE.md.
  { label: 'Sunworks',            names: ['Sunworks Inc', 'Sunworks United Inc'] },
  { label: 'SunPro Solar',        names: ['SunPro Solar Inc', 'SunPro Solar LLC'] },
  // Added 2026-09-03, per Dennis + a defunct-installer web sweep — see CLAUDE.md
  // "Defunct Solar Installer Database" Priority 1 table for sourcing/dates.
  { label: 'Solare Energy',       names: ['Solare Energy Inc', 'Solare Energy'] },
  { label: 'Simply Solar',        names: ['Simply Solar LLC', 'Simply Solar'] },
  { label: 'Harness Power',       names: ['Harness Power'] },
  { label: 'Solcius',             names: ['Solcius LLC', 'Solcius'] },
  { label: 'PosiGen',             names: ['PosiGen, PBC', 'PosiGen PBC', 'PosiGen'] },
];

function csvEsc(v) {
  const s = String(v == null ? '' : v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function extractYear(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/\b(20\d{2})\b/);
  return m ? m[1] : '';
}

function extractKw(text) {
  if (!text) return '';
  const m = text.match(/(\d+\.?\d*)\s*k[Ww]/);
  return m ? m[1] : '';
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Scrape one Accela portal for one company name.
 * Returns array of { address, installer, install_year, system_size_kw, notes, permit_id }
 */
async function scrapeAccelaForName(page, portalUrl, companyName, installerLabel) {
  const results = [];
  try {
    // Navigate to Building module search
    await page.goto(portalUrl + 'Cap/CapHome.aspx?module=Building&TabName=Building', {
      waitUntil: 'domcontentloaded', timeout: 30000
    });

    // Click General Search link (Accela standard layout)
    try {
      await page.click('a:has-text("General Search")', { timeout: 8000 });
    } catch {
      // Some portals label it differently
      try { await page.click('a:has-text("Search")', { timeout: 5000 }); } catch { /* continue */ }
    }
    await sleep(1500);

    // Try entering company name in the "Licensed Professional" business name field
    // Accela uses various field IDs — try common patterns
    const nameFieldSelectors = [
      '#ctl00_PlaceHolderMain_LicensedProfessional_txtBizName',
      '[id*="txtBizName"]',
      '[id*="BusinessName"]',
      '[name*="BizName"]',
      '[placeholder*="Business Name"]',
    ];
    let nameFieldFilled = false;
    for (const sel of nameFieldSelectors) {
      try {
        await page.fill(sel, companyName, { timeout: 3000 });
        nameFieldFilled = true;
        break;
      } catch { /* try next */ }
    }

    if (!nameFieldFilled) {
      // Fall back: try keyword/applicant field
      const fallbackSelectors = [
        '[id*="txtApplicantFirstName"]', '[id*="txtKeyword"]', '[id*="txtProjectName"]'
      ];
      for (const sel of fallbackSelectors) {
        try { await page.fill(sel, companyName, { timeout: 3000 }); nameFieldFilled = true; break; } catch { /* skip */ }
      }
    }
    if (!nameFieldFilled) return results;

    // Submit search
    try {
      await page.click('[id*="btnSearch"], [value="Search"], button:has-text("Search")', { timeout: 5000 });
    } catch { return results; }
    await sleep(2000);

    // Paginate results
    let pageNum = 1;
    while (pageNum <= 30) {
      // Extract permit rows from results table
      const rows = await page.$$eval('table.ACA_Grid_Section tr:not(:first-child), table[id*="gridList"] tr', trs => {
        return trs.map(tr => {
          const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
          return cells;
        }).filter(cells => cells.length > 2);
      }).catch(() => []);

      for (const cells of rows) {
        // Typical Accela column order: PermitNo, Type, ProjectName/Address, Status, Date
        // Column positions vary by portal — grab all text and parse heuristically
        const allText = cells.join(' | ');

        // Address detection: look for a cell that looks like a street address
        let address = '';
        for (const cell of cells) {
          if (/^\d+\s+[A-Za-z]/.test(cell) && cell.length > 8) { address = cell; break; }
        }
        if (!address) continue;

        // Date: look for MM/DD/YYYY or YYYY-MM-DD
        let dateStr = '';
        for (const cell of cells) {
          if (/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(cell)) { dateStr = cell; break; }
        }

        // Permit number: first cell usually
        const permitId = cells[0] || '';

        // kW from description
        const kw = extractKw(allText);

        results.push({
          address,
          installer: installerLabel,
          install_year: extractYear(dateStr),
          system_size_kw: kw,
          notes: `Accela ${permitId}`.trim(),
          permit_id: permitId,
        });
      }

      // Try to go to next page
      const nextBtn = await page.$('.aca-pager-next:not(.disabled), [id*="btnNext"]:not([disabled]), a:has-text("Next"):not(.disabled)');
      if (!nextBtn) break;
      try {
        await nextBtn.click();
        await sleep(1500);
        pageNum++;
      } catch { break; }
    }
  } catch (e) {
    console.error(`  Error scraping ${portalUrl} for "${companyName}":`, e.message);
  }
  return results;
}

async function scrapeCity(cityKey, targetInstallers) {
  const portalUrl = PORTALS[cityKey];
  if (!portalUrl) { console.error('Unknown city:', cityKey); return []; }

  console.log(`\n=== ${cityKey.toUpperCase()} — ${portalUrl} ===`);
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
  const page = await ctx.newPage();
  const allRecords = [];
  const seen = new Set();

  for (const ins of targetInstallers) {
    for (const name of ins.names) {
      console.log(`  Searching: ${name}`);
      const recs = await scrapeAccelaForName(page, portalUrl, name, ins.label);
      for (const r of recs) {
        const key = r.address.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!seen.has(key)) { seen.add(key); allRecords.push(r); }
      }
      console.log(`    → ${recs.length} results`);
      await sleep(800);
    }
  }

  await browser.close();
  console.log(`  Total unique: ${allRecords.length}`);
  return allRecords;
}

async function main() {
  const args = process.argv.slice(2);
  const cityArg = args[args.indexOf('--city') + 1] || 'all';
  const nameArg = args.indexOf('--name') !== -1 ? args[args.indexOf('--name') + 1] : null;

  const cities = cityArg === 'all' ? Object.keys(PORTALS) : [cityArg];
  const targetInstallers = nameArg
    ? [{ label: nameArg, names: [nameArg] }]
    : INSTALLER_NAMES;

  const dateStr = new Date().toISOString().slice(0, 10);
  let grandTotal = 0;

  for (const city of cities) {
    const records = await scrapeCity(city, targetInstallers);
    if (!records.length) continue;

    const outFile = path.join(__dirname, `accela-permits-${city}-${dateStr}.csv`);
    const csvLines = ['first_name,last_name,address,installer,install_year,system_size_kw,notes'];
    for (const r of records) {
      csvLines.push([
        '', '',
        csvEsc(r.address),
        csvEsc(r.installer),
        r.install_year || '',
        r.system_size_kw || '',
        csvEsc(r.notes || ''),
      ].join(','));
    }
    fs.writeFileSync(outFile, csvLines.join('\n'), 'utf8');
    console.log(`\nWrote ${records.length} records → ${outFile}`);
    grandTotal += records.length;
  }

  console.log(`\nDone. Total: ${grandTotal} unique permits across ${cities.length} portal(s).`);
  console.log('Import: paste CSV contents into portal.html → Admin → Import tab → Parse CSV');
}

main().catch(e => { console.error(e); process.exit(1); });
