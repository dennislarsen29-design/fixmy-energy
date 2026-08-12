/**
 * Manual time override on the Doors booking flow.
 *
 * Six fixed 2-hour windows could not express "I get home at 5:45" or "give me an
 * hour, not two" — so the rep wrote down a time the homeowner never agreed to.
 * Dialing has had free entry since it was built; this is Doors catching up.
 *
 *   node scratchpad/test-book-time.js
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
}).listen(8139);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**://*/**', r => r.request().url().includes('localhost')
    ? r.continue()
    : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  await page.addInitScript(() => {
    window.__booked = [];      // ghl-book payloads
    window.__updates = [];     // customers.update payloads
    // ⚠️ navigator.geolocation is a read-only accessor — a plain assignment is
    // silently dropped and sends canvassInit down the no-GPS path.
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: cb => cb({ coords: { latitude: 33.02, longitude: -117.07, accuracy: 5, speed: 0, heading: null } }),
        watchPosition: () => 1,
        clearWatch: () => {}
      }
    });
    const realFetch = window.fetch.bind(window);
    window.fetch = async function (u, o) {
      const s = String(u);
      if (s.includes('ghl-book')) {
        window.__booked.push(JSON.parse(o.body));
        return { ok: true, status: 200, json: async () => ({ ok: true, appointmentId: 'appt_1' }) };
      }
      if (s.includes('/rest/v1/')) return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
      if (s.includes('localhost')) return realFetch(u, o);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
    const AGREEMENT_VERSION = '2026-07-30-setter-split', SUB_VERSION = '2026-08-06';
    const rowsFor = t => t === 'rep_agreements' ? [
      { id: 1, agreement_version: AGREEMENT_VERSION, signed_at: new Date().toISOString(), source: null },
      { id: 2, agreement_version: SUB_VERSION, signed_at: new Date().toISOString(), source: 'sub_sheet_ack' }
    ] : [];
    const tbl = t => {
      const c = {};
      ['select','eq','or','is','not','gte','lte','order','limit','range','in','insert','upsert','neq','ilike'].forEach(m => c[m] = () => c);
      c.update = v => { if (t === 'customers') window.__updates.push(v); return c; };
      c.then = r => r({ data: rowsFor(t), error: null });
      return c;
    };
    window.supabase = { createClient: () => ({ from: tbl }) };
  });

  const label = () => page.evaluate(() => {
    const s = document.getElementById('editorSlot');
    return s ? s.innerText.replace(/\s+/g, ' ') : '';
  });
  const nextEnabled = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('#editorSlot button')].find(x => /Next/.test(x.textContent));
    return b ? !b.disabled : null;
  });

  try {
    await page.goto('http://localhost:8139/portal.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      window.CURRENT_ROLE = 'setter';
      await loadSalesDashboard({ id: 'setter1', name: 'New Hire', role: 'setter' });
      Object.keys(window.BB_TRAINING_MODULES || {}).forEach(m => { window._bbCerts[m] = { version: 't1', at: new Date().toISOString() }; });
      salesSetView('canvass');
      // Put a real lead on the route rather than driving the whole GPS box query.
      window._cvLeadsRef().push({
        id: 'door-1', first_name: 'Raymond', last_name: 'Byrne', phone: '6195550100',
        email: 'ray@example.com', address: '16829 Acebo Dr, San Diego, CA 92128',
        lat: 33.02, lng: -117.07, black_box: true, lead_source: 'orphaned_list'
      });
    });
    // A date safely in the future so "past time" is never accidentally true.
    const DAY = await page.evaluate(() => {
      const d = new Date(Date.now() + 3 * 86400000);
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    });

    console.log('\n[1] the presets still work and still mean two hours');
    await page.evaluate(() => canvassStartBooking('door-1'));
    await page.waitForTimeout(400);
    await page.evaluate(d => canvassBkSet('date', d), DAY);
    await page.evaluate(() => canvassBkSet('start', '16:00'));
    await page.waitForTimeout(200);
    let t = await label();
    if (/4pm–6pm/.test(t)) ok('a 4pm preset still reads back as 4pm–6pm');
    else bad('preset label wrong: ' + t.slice(0, 160));
    if (await nextEnabled()) ok('Next is enabled');
    else bad('Next disabled on a valid preset');
    if (/pick an exact time/i.test(t)) ok('the override is offered');
    else bad('no way into the override — the reported gap');

    console.log('\n[2] an exact time the homeowner actually gave');
    await page.evaluate(() => canvassBkCustom(true));
    await page.waitForTimeout(200);
    t = await label();
    if (/exact time/i.test(t) && await page.locator('#editorSlot input[type="time"]').count()) ok('a free time field appears');
    else bad('no time input in custom mode');
    if (/window length/i.test(t)) ok('window length is selectable');
    else bad('length is still fixed');
    await page.evaluate(() => canvassBkSet('start', '17:45'));
    await page.evaluate(() => canvassBkMins(60));
    await page.waitForTimeout(200);
    t = await label();
    if (/5:45pm–6:45pm/.test(t)) ok('5:45pm + 1 hr reads back as 5:45pm–6:45pm');
    else bad('custom label wrong: ' + t.slice(0, 200));
    if (await nextEnabled()) ok('Next is enabled on a custom time');
    else bad('Next disabled on a valid custom time');
    await page.evaluate(() => canvassBkMins(90));
    await page.waitForTimeout(200);
    if (/5:45pm–7:15pm/.test(await label())) ok('1½ hr moves the end, not the start');
    else bad('90-minute window wrong: ' + (await label()).slice(0, 200));

    console.log('\n[3] the window the rep chose is what actually gets booked');
    await page.evaluate(() => canvassBkMins(60));
    await page.evaluate(() => canvassBkStep(1));
    await page.waitForTimeout(200);
    t = await label();
    if (/5:45pm–6:45pm/.test(t)) ok('the confirm step reads the custom window out loud');
    else bad('confirm step lost the custom window: ' + t.slice(0, 200));
    await page.evaluate(async () => { await canvassCommitBooking(); });
    await page.waitForTimeout(600);
    const sent = await page.evaluate(() => window.__booked[0] || null);
    const upd  = await page.evaluate(() => (window.__updates.find(u => u.arrival_end) || null));
    if (sent) {
      const mins = (new Date(sent.endISO) - new Date(sent.startISO)) / 60000;
      if (mins === 60) ok('GHL receives a 60-minute appointment, not a hardcoded 120');
      else bad('GHL got a ' + mins + '-minute window');
      const st = new Date(sent.startISO);
      if (st.getHours() === 17 && st.getMinutes() === 45) ok('the start is 5:45pm local');
      else bad('start was ' + st.toString());
    } else bad('nothing was sent to ghl-book');
    if (upd && (new Date(upd.arrival_end) - new Date(upd.diagnostic_date)) / 60000 === 60) ok('arrival_end on the lead matches the chosen window');
    else bad('arrival_end wrong: ' + JSON.stringify(upd));

    console.log('\n[4] guards');
    await page.evaluate(() => canvassStartBooking('door-1'));
    await page.waitForTimeout(300);
    // A time earlier today must not be bookable.
    const TODAY = await page.evaluate(() => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); });
    await page.evaluate(d => canvassBkSet('date', d), TODAY);
    await page.evaluate(() => canvassBkCustom(true));
    await page.evaluate(() => canvassBkSet('start', '00:01'));
    await page.waitForTimeout(200);
    t = await label();
    if (/already passed/i.test(t)) ok('a time earlier today is called out');
    else bad('no warning on a past time');
    if (!(await nextEnabled())) ok('and Next is blocked');
    else bad('a past appointment can still be booked');

    // Leaving custom must not silently keep a non-preset start.
    await page.evaluate(d => canvassBkSet('date', d), DAY);
    await page.evaluate(() => canvassBkSet('start', '17:45'));
    await page.evaluate(() => canvassBkCustom(false));
    await page.waitForTimeout(200);
    // _cvBk is closure-private on purpose — assert through what the rep can see.
    t = await label();
    if (!/5:45pm/.test(t)) ok('a non-preset start is dropped when returning to the grid');
    else bad('17:45 survived into a grid that shows nothing selected — it would book anyway');
    const anySelected = await page.evaluate(() =>
      [...document.querySelectorAll('#editorSlot button')].some(b => /–/.test(b.textContent) && /141, ?198, ?63/.test(b.getAttribute('style') || '')));
    if (!anySelected) ok('no preset is left highlighted');
    else bad('a preset still reads as selected');
    if (!(await nextEnabled())) ok('Next is blocked until a window is picked again');
    else bad('Next enabled with no time selected');

    console.log('\n[5] a GPS tick must not destroy the booking');
    await page.evaluate(() => canvassStartBooking('door-1'));
    await page.waitForTimeout(300);
    await page.evaluate(d => canvassBkSet('date', d), DAY);
    await page.evaluate(() => { canvassBkCustom(true); canvassBkSet('start', '17:45'); });
    await page.waitForTimeout(200);
    const survived = await page.evaluate(() => {
      renderSales();                        // what a GPS tick does
      const s = document.getElementById('editorSlot');
      return { txt: s ? s.innerText.replace(/\s+/g,' ') : '' };
    });
    if (/5:45pm/.test(survived.txt)) ok('the booking survives a full re-render');
    else bad('a GPS tick wiped the booking panel: "' + survived.txt.slice(0, 100) + '"');
    // _cvUiBusy is closure-private; assert the shipped line by source.
    if (/if \(_cvBk\) return true;/.test(SRC)) ok('_cvUiBusy suppresses the GPS tick outright while booking');
    else bad('no busy guard — the tick still fires mid-booking');

    if (!errors.length) ok('no page errors throughout');
    else bad('page errors: ' + errors.join(' | '));

  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
