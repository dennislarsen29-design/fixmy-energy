/**
 * The New Hire Walkthrough must WALK THE PORTAL, not just show text.
 *
 * Reported: the tour renders script/text cards. Cause — tour steps highlighted whatever
 * happened to be on screen, and a hire starts from the Training tab, so every portal
 * step fell through to "this one lives on the other tab".
 *
 *   node scratchpad/test-tour-portal.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/' || p === '/portal') p = '/portal.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(f));
}).listen(8151);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**://*/**', r => r.request().url().includes('localhost') ? r.continue()
    : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true,
      value: { getCurrentPosition: cb => cb({ coords: { latitude: 33.38, longitude: -117.25, accuracy: 5, speed: 0, heading: null } }),
               watchPosition: () => 1, clearWatch: () => {} } });
    const realFetch = window.fetch.bind(window);
    window.fetch = async (u, o) => {
      const s = String(u);
      if (s.includes('/rest/v1/')) return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
      if (s.includes('localhost')) return realFetch(u, o);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
    const AV = '2026-07-30-setter-split', SV = '2026-08-06';
    const tbl = t => { const c = {};
      ['select','eq','or','is','not','gte','lte','order','limit','range','in','update','insert','upsert','neq','ilike','maybeSingle'].forEach(m => c[m] = () => c);
      c.then = r => r({ data: t === 'rep_agreements' ? [
        { id:1, agreement_version: AV, signed_at: new Date().toISOString(), source: null },
        { id:2, agreement_version: SV, signed_at: new Date().toISOString(), source: 'sub_sheet_ack' }
      ] : [], error: null }); return c; };
    window.supabase = { createClient: () => ({ from: tbl }) };
  });

  const step = () => page.evaluate(() => {
    const host = document.getElementById('bbTourHost');
    const spot = document.querySelector('.bb-tour-spot');
    return {
      title: host ? (host.querySelector('.bb-tour-card div[style*="font-weight:800"]') || {}).textContent : null,
      text: host ? host.innerText.replace(/\s+/g, ' ') : '',
      spotted: !!spot,
      spotTag: spot ? (spot.getAttribute('data-tour') || spot.id || spot.tagName) : null,
      view: sessionStorage.getItem('salesView_setter1'),
      offTab: host ? /lives on the other tab/i.test(host.innerText) : false
    };
  });
  const nextTo = async (id) => {
    for (let i = 0; i < 40; i++) {
      const cur = await page.evaluate(() => window.__tourStepId && window.__tourStepId());
      if (cur === id) return true;
      await page.evaluate(() => bbTourNext());
      await page.waitForTimeout(220);
    }
    return false;
  };

  try {
    await page.goto('http://localhost:8151/portal.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      window.CURRENT_ROLE = 'setter';
      await loadSalesDashboard({ id: 'setter1', name: 'New Hire', role: 'setter' });
      // Expose the current step id so the harness can drive to a named step.
      // Expose the live index so the harness can answer the right option.
      window.__tourIdx = () => {
        const host = document.getElementById('bbTourHost');
        const m = host && host.innerText.match(/(\d+) of (\d+)/);
        return m ? parseInt(m[1], 10) - 1 : 0;
      };
    });

    console.log('\n[1] the hire is UNCERTIFIED — the tour must still reach the portal');
    {
      const gated = await page.evaluate(() => window.bbTrainingComplete('setter'));
      if (!gated) ok('training is genuinely incomplete (the gate is live)');
      else bad('harness rep is already certified — the gate is not being exercised');
      await page.evaluate(() => bbStartTour());
      await page.waitForTimeout(400);
      if (await page.evaluate(() => !!document.getElementById('bbTourHost'))) ok('the tour opens');
      else bad('tour did not open');
    }

    console.log('\n[2] walk it and see whether the portal actually moves');
    {
      const seen = [];
      let offTabCount = 0, spotted = 0, portalSteps = 0;
      for (let i = 0; i < 40; i++) {
        const s = await step();
        if (!s.text) break;
        seen.push({ view: s.view, spotted: s.spotted, tag: s.spotTag, offTab: s.offTab, title: s.title });
        if (s.offTab) console.log('      · off-tab: ' + s.title + ' (view=' + s.view + ')');
        if (s.offTab) offTabCount++;
        if (s.spotted) spotted++;
        if (s.view && s.view !== 'training') portalSteps++;
        const done = await page.evaluate(() => {
          const fin = [...document.querySelectorAll('#bbTourHost button')].find(x => /Finish/.test(x.textContent));
          const nxt = [...document.querySelectorAll('#bbTourHost button')].find(x => /^Next$/.test(x.textContent.trim()));
          if (nxt && !nxt.disabled) { nxt.click(); return false; }
          if (fin) { fin.click(); return true; }
          // Locked by a comprehension check — answer it correctly, since a wrong answer
          // explains and re-asks rather than advancing.
          const opts = [...document.querySelectorAll('#bbTourHost button[onclick^="bbTourAnswer"]')];
          if (opts.length) {
            const step = window.bbTourStepsFor(window.CURRENT_ROLE)[window.__tourIdx()];
            const right = step && step.check ? step.check.answer : 0;
            opts[right].click();
            return false;
          }
          return true;
        });
        await page.waitForTimeout(230);
        if (done) break;
      }
      const views = [...new Set(seen.map(s => s.view).filter(Boolean))];
      if (views.filter(v => v !== 'training').length >= 3) ok('the tour navigated real views: ' + views.join(' → '));
      else bad('the portal never moved. views seen: ' + JSON.stringify(views));
      if (spotted >= 6) ok(spotted + ' steps highlighted a real element on the page');
      else bad('only ' + spotted + ' steps highlighted anything');
      if (offTabCount === 0) ok('no step fell back to "this one lives on the other tab"');
      else bad(offTabCount + ' step(s) still could not find their element');
      const tags = [...new Set(seen.map(s => s.tag).filter(Boolean))];
      if (tags.some(t => t === 'lead-card')) ok('a real lead card was highlighted');
      else bad('never highlighted a lead card. tags: ' + JSON.stringify(tags));
      if (tags.some(t => t === 'dispositions')) ok('the disposition row was highlighted');
      else bad('dispositions never shown. tags: ' + JSON.stringify(tags));
    }

    console.log('\n[3] the demo lead');
    {
      const present = await page.evaluate(() => (window._cvLeadsRef() || []).some(l => l.id === '__tour_demo__'));
      const active  = await page.evaluate(() => window._bbTourDemoActive);
      if (!present && !active) ok('the demo lead is removed once the tour ends');
      else bad('a fake lead was left behind in the live route (present=' + present + ', active=' + active + ')');
    }

    console.log('\n[4] closing early also cleans up, and does not strand them');
    {
      await page.evaluate(() => { bbStartTour(); });
      await page.waitForTimeout(400);
      await page.evaluate(() => bbTourNext());   // into a portal step
      await page.waitForTimeout(300);
      const during = await page.evaluate(() => (window._cvLeadsRef() || []).some(l => l.id === '__tour_demo__'));
      if (during) ok('the demo lead is present WHILE touring (so cards are populated)');
      else bad('no demo lead during the tour — a new hire would see empty screens');
      await page.evaluate(() => bbTourClose());
      await page.waitForTimeout(350);
      const after = await page.evaluate(() => ({
        demo: (window._cvLeadsRef() || []).some(l => l.id === '__tour_demo__'),
        view: sessionStorage.getItem('salesView_setter1'),
        host: !!document.getElementById('bbTourHost')
      }));
      if (!after.demo) ok('closing early removes the demo lead too');
      else bad('demo lead survived an early close');
      if (after.view === 'training') ok('returns them to Training, not a screen the gate blocks');
      else bad('left on "' + after.view + '"');
      if (!after.host) ok('the overlay is gone');
      else bad('overlay left open');
    }

    console.log('\n[5] the gate is not permanently weakened');
    {
      const blocked = await page.evaluate(() => {
        window._bbCerts = {};                  // un-certify: finishing the tour certifies
        window._bbTourNavigating = false;
        salesSetView('dialer');
        return sessionStorage.getItem('salesView_setter1');
      });
      if (blocked === 'training') ok('an uncertified rep is still bounced out of Dialing normally');
      else bad('the training gate is now bypassable outside the tour — landed on ' + blocked);
    }

    if (!errors.length) ok('no page errors throughout');
    else bad('page errors: ' + errors.slice(0, 3).join(' | '));

  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
