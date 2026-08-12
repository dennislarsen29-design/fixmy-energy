/**
 * Drive the real portal: an uncertified setter must be bounced to training, and the
 * tour must actually open without throwing. Source assertions are not proof — the
 * dialer's isPinned bug passed every static check while the view threw on render.
 *
 *   node scratchpad/test-training-boot.js
 */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const ok  = m => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0]; if (p === '/' || p === '/portal') p = '/portal.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(f));
}).listen(8144);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.route('**://*/**', r => r.request().url().includes('localhost') ? r.continue()
    : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (u, o) => String(u).includes('localhost') ? realFetch(u, o)
      : ({ ok: true, status: 200, json: async () => [], text: async () => '[]' });
    // ⚠ The training gate sits DOWNSTREAM of the rep-agreement gate: without a signed
    // agreement, loadSalesDashboard routes to the signing screen and returns before it
    // ever defines salesSetView. The stub has to be a fully onboarded rep.
    const AGREEMENT_VERSION = '2026-07-30-setter-split', SUB_VERSION = '2026-08-06';
    const rowsFor = (table) => {
      if (table === 'rep_agreements') return [
        { id: 1, agreement_version: AGREEMENT_VERSION, signed_at: new Date().toISOString(), source: null },
        { id: 2, agreement_version: SUB_VERSION, signed_at: new Date().toISOString(), source: 'sub_sheet_ack' }
      ];
      return [];
    };
    const tbl = (table) => { const c = {};
      ['select','eq','or','is','not','gte','lte','order','limit','range','in','update','insert','upsert','neq'].forEach(m => c[m] = () => c);
      c.then = r => r({ data: rowsFor(table), error: null }); return c; };
    window.supabase = { createClient: () => ({ from: tbl }) };
  });

  try {
    await page.goto('http://localhost:8144/portal.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    console.log('\n[live] uncertified setter');
    const r = await page.evaluate(async () => {
      window.CURRENT_ROLE = 'setter';
      window.person = { id: 'setter1', name: 'New Hire', role: 'setter' };
      window._bbCerts = {};                       // nothing certified
      try { await loadSalesDashboard(window.person); } catch (e) { return { err: 'boot: ' + e.message }; }
      const outstanding = window.bbModulesOutstanding('setter');
      const complete    = window.bbTrainingComplete('setter');
      try { salesSetView('dialer'); } catch (e) { return { err: 'setView: ' + e.message }; }
      const body = (document.getElementById('dashBody') || {}).innerText || '';
      return { outstanding, complete,
               view: sessionStorage.getItem('salesView_setter1'),
               locked: /is locked/i.test(body), walkthrough: /walkthrough/i.test(body) };
    });
    if (r.err) { bad(r.err); }
    else {
      if (!r.complete) ok('training reads as incomplete (' + r.outstanding.join(', ') + ' outstanding)');
      else bad('an uncertified setter read as complete');
      if (r.view === 'training') ok('salesSetView("dialer") bounced them to training');
      else bad('landed on ' + r.view + ' — the gate did not hold');
      if (r.locked) ok('the training tab explains the lock');
      else bad('no lock explanation rendered');
      if (r.walkthrough) ok('the walkthrough is offered');
      else bad('walkthrough missing');
    }

    console.log('\n[live] the tour opens and a question blocks Next');
    const t = await page.evaluate(async () => {
      try { bbStartTour('why'); } catch (e) { return { err: 'startTour: ' + e.message }; }
      const host = document.getElementById('bbTourHost');
      const txt = host ? host.innerText : '';
      const nextDisabled = !!(host && host.querySelector('button[disabled]'));
      return { opened: !!host && txt.length > 20, hasQ: /check yourself/i.test(txt), nextDisabled };
    });
    if (t.err) bad(t.err);
    else {
      if (t.opened) ok('the tour renders');
      else bad('tour did not open');
      if (t.hasQ) ok('the question renders on the step');
      else bad('no question rendered');
      if (t.nextDisabled) ok('Next is disabled until answered');
      else bad('Next is not blocked');
    }

    console.log('\n[live] certified rep is not gated');
    const c = await page.evaluate(async () => {
      try { bbTourClose(); } catch(e) {}
      window._bbCerts = { foundations: { version: 't1' }, dialing: { version: 't1' } };
      const complete = window.bbTrainingComplete('setter');
      try { salesSetView('dialer'); } catch (e) { return { err: 'setView: ' + e.message }; }
      return { complete, view: sessionStorage.getItem('salesView_setter1') };
    });
    if (c.err) bad(c.err);
    else {
      if (c.complete) ok('certified track reads complete');
      else bad('still incomplete after certification');
      if (c.view === 'dialer') ok('Dialing is now reachable');
      else bad('still gated after certification (landed on ' + c.view + ')');
    }

    const real = errors.filter(e => !/MIME type/.test(e));
    console.log('\n' + (real.length ? '\x1b[31mpage errors: ' + real.join(' | ') + '\x1b[0m' : '  no page errors'));
    if (real.length) fail++;
  } finally { await browser.close(); srv.close(); }

  console.log('\n' + '─'.repeat(52));
  console.log(fail ? fail + ' failed' : 'all passed');
  process.exitCode = fail ? 1 : 0;
})();
