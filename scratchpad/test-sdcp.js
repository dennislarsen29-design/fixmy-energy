/**
 * SDCP badge audit.
 *
 * Reported from the field on 1136 Via Felicidad, Escondido 92029 — "this ZIP is SDCP
 * and there's no badge." Escondido city is actually Clean Energy Alliance, so the
 * missing badge was correct — but auditing it found two real defects:
 *   1. a SECOND SDCP_ZIPS shadowing the first
 *   2. the whole north/central unincorporated county missing (Fallbrook, Lakeside,
 *      Ramona, Valley Center are all SDCP and all real door territory)
 *
 *   node scratchpad/test-sdcp.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('about:blank');

  // Lift the real definitions and run them.
  const a = SRC.indexOf('  // ── San Diego Community Power (SDCP) territory');
  const b = SRC.indexOf('  var adminRecentAgreements = [];');
  await page.evaluate(src => { eval(src); }, SRC.slice(a, b));
  const st = z => page.evaluate(z => window.sdcpZipStatus(z), z);
  const badge = z => page.evaluate(z => window.sdcpBadgeHtml(z), z);

  try {
    console.log('\n[1] one list, not two');
    {
      const defs = (SRC.match(/var SDCP_ZIPS = new Set\(/g) || []).length;
      if (defs === 1) ok('exactly one SDCP_ZIPS definition');
      else bad(defs + ' definitions — they will drift again');
      // Every card that shows membership must ask the shared helper. The lead-card
      // mini-badge keeps its own .mini-badge markup (different CSS class by design)
      // but still derives the STATE from sdcpZipStatus — that is the thing that drifts.
      const cards = ['gpSdcp = window.sdcpBadgeHtml', 'bbSdcpStatus = window.sdcpZipStatus',
                     'dialSdcp = window.sdcpBadgeHtml', 'tSdcp = window.sdcpBadgeHtml',
                     '_sdcpSt = (typeof window.sdcpZipStatus'];
      const missing = cards.filter(c => SRC.indexOf(c) < 0);
      if (!missing.length) ok('all 5 card surfaces derive membership from the shared helper');
      else bad('still hand-rolling: ' + missing.join(', '));
    }

    console.log('\n[2] the reported address');
    {
      if (await st('92029') === 'mixed') ok('92029 reads as MIXED, not a flat no');
      else bad('92029 = ' + await st('92029'));
      const h = await badge('92029');
      if (/SDCP\?/.test(h)) ok('renders an "SDCP?" verify badge instead of silence');
      else bad('still renders nothing: ' + h);
      if (/postal city does not settle it/i.test(h)) ok('the tooltip explains why it is uncertain');
      else bad('no explanation on the badge');
    }

    console.log('\n[3] member cities still resolve');
    {
      const yes = { '92101':'San Diego', '92037':'La Jolla', '91910':'Chula Vista',
                    '92024':'Encinitas', '92007':'Cardiff', '91932':'Imperial Beach',
                    '91941':'La Mesa', '91950':'National City', '92128':'Rancho Bernardo' };
      let bads = [];
      for (const [z, n] of Object.entries(yes)) if (await st(z) !== 'yes') bads.push(z + ' (' + n + ')');
      if (!bads.length) ok('all 9 member-city samples confirmed');
      else bad('lost: ' + bads.join(', '));
    }

    console.log('\n[4] unincorporated county — the real gap');
    {
      const add = { '92028':'Fallbrook', '92040':'Lakeside', '92065':'Ramona',
                    '92082':'Valley Center', '92003':'Bonsall', '92036':'Julian',
                    '92004':'Borrego Springs', '92061':'Pauma Valley', '92059':'Pala',
                    '92060':'Palomar Mtn', '92066':'Ranchita', '92070':'Santa Ysabel',
                    '92086':'Warner Springs', '91934':'Jacumba' };
      let bads = [];
      for (const [z, n] of Object.entries(add)) if (await st(z) !== 'yes') bads.push(z + ' (' + n + ')');
      if (!bads.length) ok('all 14 unincorporated communities now badge (Fallbrook, Lakeside, Ramona, Valley Center…)');
      else bad('still missing: ' + bads.join(', '));
      // and the ones that were already right
      const had = ['91901','91935','91977','91962','91906'];
      let keep = [];
      for (const z of had) if (await st(z) !== 'yes') keep.push(z);
      if (!keep.length) ok('the east-county zips that already worked still work');
      else bad('regressed: ' + keep.join(', '));
    }

    console.log('\n[5] must NOT badge — other CCAs and no-CCA cities');
    {
      const no = { '92008':'Carlsbad (CEA)', '92009':'Carlsbad (CEA)', '92014':'Del Mar (CEA)',
                   '92075':'Solana Beach (CEA)', '92069':'San Marcos (CEA)', '92081':'Vista (CEA)',
                   '92054':'Oceanside (CEA)', '92056':'Oceanside (CEA)',
                   '92064':'Poway (no CCA)', '92071':'Santee (no CCA)',
                   '92020':'El Cajon (no CCA)', '91945':'Lemon Grove (no CCA)',
                   '92118':'__skip__' };
      let bads = [];
      for (const [z, n] of Object.entries(no)) {
        if (n === '__skip__') continue;
        const s = await st(z);
        if (s === 'yes') bads.push(z + ' ' + n);
      }
      if (!bads.length) ok('no CEA or non-CCA city is badged as SDCP');
      else bad('WRONGLY badged: ' + bads.join(', '));
      if (await badge('92008') === '') ok('Carlsbad renders no badge at all');
      else bad('Carlsbad got a badge');
    }

    console.log('\n[6] a MIXED zip must never drive money or the route');
    {
      // The proposal rebate + the Focus SDCP sort must stay on the strict set.
      const strictSites = [
        /build\.sdcpRebate\s*=\s*\(_sdcpZipM && typeof SDCP_ZIPS!=='undefined' && SDCP_ZIPS\.has\(/,
        /build\.sdcpRebate = \(_zm && typeof SDCP_ZIPS!=='undefined' && SDCP_ZIPS\.has\(/,
        /var z = extractZip\(l\.address \|\| ''\); return z && SDCP_ZIPS\.has\(z\);/
      ];
      let miss = strictSites.filter(r => !r.test(SRC)).length;
      if (!miss) ok('rebate math and Focus SDCP still use the strict set');
      else bad(miss + ' strict site(s) changed — a "maybe" could now apply a rebate');
      // A zip in both sets would resolve 'yes' (SDCP_ZIPS is checked first) and
      // silently start driving rebate money. Every declared-mixed zip must stay mixed.
      const declared = (SRC.match(/var SDCP_MIXED_ZIPS = new Set\(\[([\s\S]*?)\]\)/) || [,''])[1];
      const mixedZips = (declared.match(/'(\d{5})'/g) || []).map(x => x.replace(/'/g, ''));
      let leaked = [];
      for (const z of mixedZips) if (await st(z) !== 'mixed') leaked.push(z + '=' + await st(z));
      if (mixedZips.length && !leaked.length) ok('all ' + mixedZips.length + ' mixed zips stay mixed (never promoted to yes)');
      else bad('leaked into the strict set: ' + leaked.join(', '));
    }

    console.log('\n[7] input safety');
    {
      if (await st('') === '' && await st(null) === '') ok('empty / null zip is safe');
      else bad('blank zip produced a status');
      if (await badge(null) === '') ok('no badge for a lead with no zip');
      else bad('badge rendered without a zip');
    }

  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
