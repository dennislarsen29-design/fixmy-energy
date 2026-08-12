/**
 * Two field reports, opposite symptoms:
 *   - a WARM door landed in Admin → Leads (it must stay in Black Box until booked)
 *   - a door BOOKED at the door never appeared in Leads at all
 *
 *   node scratchpad/test-warm-booked.js
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
}).listen(8141);

async function boot(page, opts) {
  await page.addInitScript(o => {
    window.__updates = [];       // every customers.update payload
    window.__activity = [];      // every lead_activity insert
    window.__ghlCalls = 0;
    window.__failSave = o.failSave || false;   // simulate a rejected write
    window.__emptySave = o.emptySave || false; // simulate a write matching zero rows
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: cb => cb({ coords: { latitude: 33.02, longitude: -117.07, accuracy: 5, speed: 0, heading: null } }),
               watchPosition: () => 1, clearWatch: () => {} }
    });
    const realFetch = window.fetch.bind(window);
    window.fetch = async (u, opt) => {
      const s = String(u);
      if (s.includes('ghl-book')) { window.__ghlCalls++; return { ok: true, status: 200, json: async () => ({ ok: true, appointmentId: 'appt_1' }) }; }
      if (s.includes('/rest/v1/')) return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
      if (s.includes('localhost')) return realFetch(u, opt);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
    const AV = '2026-07-30-setter-split', SV = '2026-08-06';
    const rowsFor = t => t === 'rep_agreements' ? [
      { id: 1, agreement_version: AV, signed_at: new Date().toISOString(), source: null },
      { id: 2, agreement_version: SV, signed_at: new Date().toISOString(), source: 'sub_sheet_ack' }
    ] : [];
    const tbl = t => {
      const c = {}; let isUpdate = false;
      ['select','eq','or','is','not','gte','lte','order','limit','range','in','upsert','neq','ilike'].forEach(m => {
        c[m] = () => c;
      });
      c.update = v => { isUpdate = true; if (t === 'customers') window.__updates.push(v); return c; };
      c.insert = v => { if (t === 'lead_activity') window.__activity.push(v); return c; };
      c.then = r => {
        if (isUpdate && t === 'customers' && window.__failSave) return r({ data: null, error: { message: 'permission denied for table customers' } });
        if (isUpdate && t === 'customers' && window.__emptySave) return r({ data: [], error: null });
        if (isUpdate && t === 'customers') return r({ data: [{ id: 'door-1' }], error: null });
        return r({ data: rowsFor(t), error: null });
      };
      return c;
    };
    window.supabase = { createClient: () => ({ from: tbl }) };
  }, opts);

  await page.goto('http://localhost:8141/portal.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    window.CURRENT_ROLE = 'setter';
    await loadSalesDashboard({ id: 'setter1', name: 'New Hire', role: 'setter' });
    Object.keys(window.BB_TRAINING_MODULES || {}).forEach(m => { window._bbCerts[m] = { version: 't1', at: new Date().toISOString() }; });
    salesSetView('canvass');
    window._cvLeadsRef().push({
      id: 'door-1', first_name: 'Catherine', last_name: 'Rios', phone: '6195550100',
      email: 'c@example.com', address: '900 Test St, San Diego, CA 92128',
      lat: 33.02, lng: -117.07, black_box: true, lead_source: 'orphaned_list'
    });
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  try {
    // ── 1. WARM stays in Black Box ─────────────────────────────────────────
    console.log('\n[1] a warm door stays in Black Box (Catherine Rios)');
    {
      const page = await browser.newPage();
      await page.route('**://*/**', r => r.request().url().includes('localhost') ? r.continue()
        : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
      await boot(page, {});
      await page.evaluate(async () => { await canvassKnock('door-1', 'warm'); });
      await page.waitForTimeout(500);
      const u = await page.evaluate(() => window.__updates);
      const activating = u.filter(x => x.black_box === false);
      if (!activating.length) ok('nothing sets black_box:false — it stays quarantined');
      else bad('STILL ACTIVATES: ' + JSON.stringify(activating));
      if (u.some(x => x.knock_status === 'warm')) ok('the warm disposition is recorded');
      else bad('warm was not written at all');
      if (u.some(x => x.rep_id === 'setter1')) ok('the rep keeps ownership of the door');
      else bad('rep_id not stamped');
      if (!u.some(x => x.step === 1 || x.lead_category === 'fixmy')) ok('no pipeline fields written');
      else bad('pipeline fields written: ' + JSON.stringify(u));
      const inRoute = await page.evaluate(() =>
        window._cvLeadsRef().filter(l => !l.knock_status || l.knock_status === 'come_back').length);
      if (inRoute === 0) ok('the door still leaves the route (does not keep resurfacing)');
      else bad('warm door is still an open door');
      await page.close();
    }

    // ── 2. BOOKED activates, and a failed save is not silent ───────────────
    console.log('\n[2] a booking that saves cleanly');
    {
      const page = await browser.newPage();
      await page.route('**://*/**', r => r.request().url().includes('localhost') ? r.continue()
        : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
      await boot(page, {});
      const DAY = await page.evaluate(() => { const d = new Date(Date.now() + 3*86400000);
        return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); });
      await page.evaluate(() => canvassStartBooking('door-1'));
      await page.waitForTimeout(300);
      await page.evaluate(d => canvassBkSet('date', d), DAY);
      await page.evaluate(() => canvassBkSet('start', '16:00'));
      await page.evaluate(() => canvassBkStep(2));   // the step that owns #cvBkStatus
      await page.waitForTimeout(200);
      await page.evaluate(async () => { await canvassCommitBooking(); });
      await page.waitForTimeout(600);
      const u = await page.evaluate(() => window.__updates);
      if (u.some(x => x.black_box === false && x.step === 1)) ok('booking DOES activate into Leads');
      else bad('a clean booking did not activate: ' + JSON.stringify(u));
      // Without setter_name the 20/20 split cannot be computed and the door rep is
      // paid nothing — the dialer has always stamped it, Doors never did.
      if (u.some(x => x.setter_name === 'New Hire')) ok('the door rep is credited as the setter');
      else bad('setter_name not stamped — a door-booked deal loses the setter split');
      const closed = await page.evaluate(() => (document.getElementById('editorSlot') || {}).innerHTML === '');
      if (closed) ok('the booking panel closes on success');
      else bad('panel left open after a successful save');
      await page.close();
    }

    console.log('\n[3] the Wilton case — the save fails');
    {
      const page = await browser.newPage();
      await page.route('**://*/**', r => r.request().url().includes('localhost') ? r.continue()
        : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
      await boot(page, { failSave: true });
      const DAY = await page.evaluate(() => { const d = new Date(Date.now() + 3*86400000);
        return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); });
      await page.evaluate(() => canvassStartBooking('door-1'));
      await page.waitForTimeout(300);
      await page.evaluate(d => canvassBkSet('date', d), DAY);
      await page.evaluate(() => canvassBkSet('start', '16:00'));
      await page.evaluate(() => canvassBkStep(2));   // the step that owns #cvBkStatus
      await page.waitForTimeout(200);
      await page.evaluate(async () => { await canvassCommitBooking(); });
      await page.waitForTimeout(600);
      const slot = await page.evaluate(() => (document.getElementById('editorSlot') || {}).innerText || '');
      if (/NOT saved/i.test(slot)) ok('the rep is told the lead was NOT saved');
      else bad('failure was silent — the reported bug: "' + slot.slice(0, 120) + '"');
      if (/permission denied/i.test(slot)) ok('and the real reason is shown');
      else bad('no cause given');
      if (/retry|again/i.test(slot)) ok('offers a retry');
      else bad('no way to retry');
      const act = await page.evaluate(() => window.__activity);
      if (!act.some(a => (a.outcome || '') === 'booked')) ok('no "booked" activity row is logged against an unsaved booking');
      else bad('logged booked in lead_activity while customers was never updated — the exact fingerprint');
      const stillOpen = await page.evaluate(() =>
        window._cvLeadsRef().some(l => l.id === 'door-1' && l.knock_status !== 'booked'));
      if (stillOpen) ok('the door is not marked booked locally either');
      else bad('local record claims booked');

      // A retry must not book a SECOND calendar appointment.
      const before = await page.evaluate(() => window.__ghlCalls);
      await page.evaluate(async () => { await canvassCommitBooking(); });
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => window.__ghlCalls);
      if (before === 1 && after === 1) ok('a save retry does not double-book the calendar');
      else bad('ghl-book called ' + after + ' times');
      await page.close();
    }

    console.log('\n[4] a write that matches zero rows is also a failure');
    {
      const page = await browser.newPage();
      await page.route('**://*/**', r => r.request().url().includes('localhost') ? r.continue()
        : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
      await boot(page, { emptySave: true });
      const DAY = await page.evaluate(() => { const d = new Date(Date.now() + 3*86400000);
        return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); });
      await page.evaluate(() => canvassStartBooking('door-1'));
      await page.waitForTimeout(300);
      await page.evaluate(d => canvassBkSet('date', d), DAY);
      await page.evaluate(() => canvassBkSet('start', '16:00'));
      await page.evaluate(() => canvassBkStep(2));   // the step that owns #cvBkStatus
      await page.waitForTimeout(200);
      await page.evaluate(async () => { await canvassCommitBooking(); });
      await page.waitForTimeout(600);
      const slot = await page.evaluate(() => (document.getElementById('editorSlot') || {}).innerText || '');
      if (/NOT saved/i.test(slot) && /no matching lead/i.test(slot)) ok('an update touching 0 rows is reported, not treated as success');
      else bad('zero-row update passed as a save: "' + slot.slice(0, 120) + '"');
      await page.close();
    }

    console.log('\n[5] source guards');
    {
      if (!/if \(knockStatus === 'warm' \|\| knockStatus === 'interested'\) \{\s*var updates = \{ rep_id: person\.id, step: 1/.test(SRC))
        ok('the warm-activation block is gone from canvassKnock');
      else bad('warm still activates');
      if (!/if \(knockStatus === 'interested'\) \{\s*await c2\.from\('customers'\)\.update\(\{ step: 1/.test(SRC))
        ok('the admin canvass copy is gone too');
      else bad('admin canvass can still activate a warm door');
      if (/_saveErr/.test(SRC) && /\.select\('id'\)/.test(SRC)) ok('the booking write is checked');
      else bad('booking write is unchecked again');
      // Only bookings and explicit admin/rep actions may activate.
      // Assert the four legitimate activation sites BY NAME. A count is brittle here —
      // both a per-line filter and an Object.assign strip misfired against correct code.
      const sites = {
        'admin activate button': /activateBlackBoxLead[\s\S]{0,900}?black_box: false/,
        'dialer booking':        /if \(outcome === 'booked'\)[\s\S]{0,200}?black_box: false/,
        'Save to My Leads':      /lead_source: 'self_generated', black_box: false/,
        'door booking':          /rep_id: _bkCloserId[\s\S]{0,300}?black_box: false/
      };
      const absent = Object.keys(sites).filter(k => !sites[k].test(SRC));
      if (!absent.length) ok('all 4 legitimate activation sites intact');
      else bad('missing activation site(s): ' + absent.join(', '));
      // And the disposition handler must contain none.
      const knockFn = (SRC.match(/window\.canvassKnock = async function[\s\S]*?\n    \};/) || [''])[0]
        .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      if (!/black_box: ?false/.test(knockFn)) ok('canvassKnock activates nothing');
      else bad('canvassKnock can still activate a lead');
    }

  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
