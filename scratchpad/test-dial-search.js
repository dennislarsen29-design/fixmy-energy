/**
 * The callback-number lookup on Dialing.
 *
 * Reported: "the phone number lookup feature was removed from Dialing options."
 * It was — c78892f cut the markup while every function behind it survived, so the
 * feature went dark but grep for its names still found everything.
 *
 *   node scratchpad/test-dial-search.js
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
}).listen(8137);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.route('**://*/**', r => r.request().url().includes('localhost')
    ? r.continue()
    : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  await page.addInitScript(() => {
    // Two leads in the queue, plus one that is NOT loaded — the callback case that
    // matters most is a number outside the current bucket.
    const LEADS = [
      { id: 'q1', first_name: null, last_name: null, address: '123 Test St, San Diego, CA 92128',
        phone: '6195550100', title_owner: 'CASEY OWEN J', black_box: true, lead_source: 'orphaned_list',
        dial_status: null, dialed_at: null, callback_at: null, dial_attempts: 0, lead_score: 50, lat: 33, lng: -117 },
      { id: 'q2', first_name: null, last_name: null, address: '456 Other Ave, Poway, CA 92064',
        phone: '7605551234', title_owner: 'SMITH JOHN', black_box: true, lead_source: 'orphaned_list',
        dial_status: null, dialed_at: null, callback_at: null, dial_attempts: 0, lead_score: 40, lat: 33, lng: -117 }
    ];
    const REMOTE = [
      { id: 'far1', first_name: 'Raymond', last_name: 'Byrne', address: '16829 Acebo Dr, San Diego, CA 92128',
        phone: '8585559999', black_box: true, lead_source: 'orphaned_list', notes: null }
    ];
    window.__searchUrls = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = async function (url, opts) {
      const u = String(url);
      if (u.includes('/rest/v1/')) {
        // A phone search carries the number in the querystring; the queue load does not.
        if (/phone=like\./.test(u)) {
          window.__searchUrls.push(u);
          const m = u.match(/phone=like\.\*(\d+)/);
          const hit = m ? REMOTE.filter(r => r.phone.slice(-10) === m[1]) : [];
          return { ok: true, status: 200, json: async () => hit, text: async () => JSON.stringify(hit) };
        }
        return { ok: true, status: 200, json: async () => LEADS, text: async () => JSON.stringify(LEADS) };
      }
      if (u.includes('localhost')) return realFetch(url, opts);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
    // ⚠ The training gate sits DOWNSTREAM of the rep-agreement gate: with no signed
    // agreement, loadSalesDashboard routes to the signing screen and returns before it
    // ever defines salesSetView. The stub has to be a fully onboarded rep.
    const AGREEMENT_VERSION = '2026-07-30-setter-split', SUB_VERSION = '2026-08-06';
    const rowsFor = (table) => table === 'rep_agreements' ? [
      { id: 1, agreement_version: AGREEMENT_VERSION, signed_at: new Date().toISOString(), source: null },
      { id: 2, agreement_version: SUB_VERSION, signed_at: new Date().toISOString(), source: 'sub_sheet_ack' }
    ] : [];
    const tbl = (table) => {
      const c = {};
      ['select','eq','or','is','not','gte','lte','order','limit','range','in','update','insert','upsert','neq','ilike','maybeSingle'].forEach(m => { c[m] = () => c; });
      c.then = res => res({ data: rowsFor(table), error: null });
      return c;
    };
    window.supabase = { createClient: () => ({ from: tbl }) };
  });

  try {
    await page.goto('http://localhost:8137/portal.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      window.CURRENT_ROLE = 'tech';
      await loadSalesDashboard({ id: 'tech4', name: 'Dennis Larsen', role: 'tech' });
      // Certified, so the hard training gate lets us reach Dialing.
      Object.keys(window.BB_TRAINING_MODULES || {}).forEach(function(m) {
        window._bbCerts[m] = { version: 't1', at: new Date().toISOString() };
      });
      salesSetView('dialer');
    });
    await page.waitForTimeout(2500);

    console.log('\n[1] the control is on screen');
    const input = page.locator('#bbDialSearchInput');
    if (await input.count()) ok('the search field renders on Dialing');
    else bad('STILL MISSING — the reported bug');
    if (await page.locator('button[onclick="bbDialSearchPhone()"]').count() === 1) ok('the Find button renders');
    else bad('no Find button');
    if (!errors.length) ok('no page errors');
    else bad('render threw: ' + errors.join(' | '));

    console.log('\n[2] a number already in the queue');
    await input.fill('619 555 0100');
    await page.locator('button[onclick="bbDialSearchPhone()"]').click();
    await page.waitForTimeout(600);
    let st = await page.evaluate(() => ({
      pinned: bbDialPinnedId,
      body: document.getElementById('dashBody').innerText.replace(/\s+/g, ' '),
      searched: (window.__searchUrls || []).length
    }));
    if (st.pinned === 'q1') ok('pins the matching lead without a round trip');
    else bad('pinned=' + st.pinned);
    if (st.searched === 0) ok('a lead already loaded is matched locally — no query');
    else bad('queried the server for a lead it already had');
    if (/pinned from search/i.test(st.body)) ok('the card says it is pinned, not queue order');
    else bad('no pinned banner');
    if (/back to queue/i.test(st.body)) ok('offers a way back to the queue');
    else bad('rep would be stuck on the pinned lead');

    console.log('\n[3] a callback from a number NOT in the loaded queue');
    await page.evaluate(() => bbDialUnpin());
    await page.waitForTimeout(300);
    await page.locator('#bbDialSearchInput').fill('8585559999');
    await page.locator('button[onclick="bbDialSearchPhone()"]').click();
    await page.waitForTimeout(800);
    st = await page.evaluate(() => ({
      body: document.getElementById('dashBody').innerText.replace(/\s+/g, ' '),
      searched: (window.__searchUrls || []).length
    }));
    if (st.searched > 0) ok('falls back to a server query for an unloaded number');
    else bad('never queried — an unqueued callback is unreachable');
    if (/Raymond Byrne/i.test(st.body)) ok('the found lead is opened');
    else bad('result not rendered: ' + st.body.slice(0, 200));
    st = await page.evaluate(() => ({
      pinned: bbDialPinnedId,
      inQueue: bbDialQueue.some(x => x.id === 'far1'),
      body: document.getElementById('dashBody').innerText.replace(/\s+/g, ' ')
    }));
    if (st.pinned === 'far1') ok('selecting the result opens that lead');
    else bad('pinned=' + st.pinned);
    if (st.inQueue) ok('folded into bbDialQueue so dispositions and notes work on it');
    else bad('not in the queue — logging against it would lose its history');
    if (/858/.test(st.body)) ok('the card shows the number that called back');
    else bad('number not on the card');

    console.log('\n[4] bad input');
    await page.evaluate(() => bbDialUnpin());
    await page.waitForTimeout(300);
    await page.locator('#bbDialSearchInput').fill('619');
    await page.locator('button[onclick="bbDialSearchPhone()"]').click();
    await page.waitForTimeout(400);
    let body = await page.evaluate(() => document.getElementById('dashBody').innerText);
    if (/at least 7 digits/i.test(body)) ok('too-short input is explained, not silently ignored');
    else bad('no guidance on a short number');
    await page.locator('#bbDialSearchInput').fill('6195550000');
    await page.locator('button[onclick="bbDialSearchPhone()"]').click();
    await page.waitForTimeout(800);
    body = await page.evaluate(() => document.getElementById('dashBody').innerText);
    if (/no match found/i.test(body)) ok('a genuine miss says so');
    else bad('a miss renders like nothing happened');

    console.log('\n[5] the deletion is gated');
    if (/id="bbDialSearchInput"/.test(SRC)) ok('the markup exists in source');
    else bad('markup missing');
    const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    ['bbDialSearchPhone()', 'bbDialSelectResult(', 'bbDialUnpin()'].forEach(fn => {
      if (stripped.indexOf(fn) >= 0) ok(fn + ' is reachable from markup');
      else bad(fn + ' is orphaned code again');
    });

  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
