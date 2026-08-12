/**
 * A Setter's booking must land on a closing Tech's portal.
 *
 * Rule (per Dennis 2026-08-12): if the setter is ALSO a Tech they keep it; if not it
 * goes to Dennis. The setter keeps read-only sight of it because their 20% rides on it.
 *
 *   node scratchpad/test-closer-routing.js
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
}).listen(8143);

async function boot(browser, person, closerRow) {
  const page = await browser.newPage();
  await page.route('**://*/**', r => r.request().url().includes('localhost') ? r.continue()
    : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.addInitScript(o => {
    window.__updates = []; window.__upserts = []; window.__alerts = [];
    window.__closerRow = o.closerRow;   // null = no saved list (day-one seed path)
    window.alert = m => window.__alerts.push(String(m));
    Object.defineProperty(navigator, 'geolocation', { configurable: true,
      value: { getCurrentPosition: cb => cb({ coords: { latitude: 33.02, longitude: -117.07, accuracy: 5, speed: 0, heading: null } }),
               watchPosition: () => 1, clearWatch: () => {} } });
    const realFetch = window.fetch.bind(window);
    window.fetch = async (u, opt) => {
      const s = String(u);
      if (s.includes('ghl-book')) return { ok: true, status: 200, json: async () => ({ ok: true, appointmentId: 'a1' }) };
      if (s.includes('/rest/v1/')) return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
      if (s.includes('localhost')) return realFetch(u, opt);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
    const AV = '2026-07-30-setter-split', SV = '2026-08-06';
    const tbl = t => {
      const c = {}; let isUpdate = false, isUpsert = false, eqs = {};
      ['or','is','not','gte','lte','order','limit','range','in','ilike','select'].forEach(m => c[m] = () => c);
      c.eq = (k, v) => { eqs[k] = v; return c; };
      c.neq = () => c;
      c.update = v => { isUpdate = true; if (t === 'customers') window.__updates.push(v); return c; };
      c.insert = () => c;
      c.upsert = v => { isUpsert = true; window.__upserts.push({ table: t, value: v }); return c; };
      c.maybeSingle = () => c;
      c.then = r => {
        if (isUpsert) return r({ data: null, error: null });
        if (isUpdate && t === 'customers') return r({ data: [{ id: 'door-1' }], error: null });
        if (t === 'pipeline_state') return r({ data: window.__closerRow, error: null });
        if (t === 'rep_agreements') return r({ data: [
          { id: 1, agreement_version: AV, signed_at: new Date().toISOString(), source: null },
          { id: 2, agreement_version: SV, signed_at: new Date().toISOString(), source: 'sub_sheet_ack' }
        ], error: null });
        // The "Booked by me" query is the only customers SELECT with setter_name set.
        if (t === 'customers' && eqs.setter_name) return r({ data: [{
          id: 'ho-1', first_name: 'Paul', last_name: 'Wilton', address: '5 Elm St, San Diego, CA 92128',
          rep_id: 'tech4', setter_name: eqs.setter_name, step: 1, diagnostic_date: '2026-08-20T23:00:00.000Z'
        }], error: null });
        return r({ data: [], error: null });
      };
      return c;
    };
    window.supabase = { createClient: () => ({ from: tbl }) };
  }, { closerRow });

  await page.goto('http://localhost:8143/portal.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(async p => {
    window.CURRENT_ROLE = p.role;
    await loadSalesDashboard(p);
    Object.keys(window.BB_TRAINING_MODULES || {}).forEach(m => { window._bbCerts[m] = { version: 't1', at: new Date().toISOString() }; });
  }, person);
  return page;
}

async function bookAtDoor(page) {
  await page.evaluate(() => {
    salesSetView('canvass');
    window._cvLeadsRef().push({ id: 'door-1', first_name: 'A', last_name: 'B', phone: '6195550100',
      email: 'a@b.com', address: '1 Test St, San Diego, CA 92128', lat: 33.02, lng: -117.07,
      black_box: true, lead_source: 'orphaned_list' });
  });
  const DAY = await page.evaluate(() => { const d = new Date(Date.now()+3*86400000);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); });
  await page.evaluate(() => canvassStartBooking('door-1'));
  await page.waitForTimeout(250);
  await page.evaluate(d => canvassBkSet('date', d), DAY);
  await page.evaluate(() => canvassBkSet('start', '16:00'));
  await page.evaluate(() => canvassBkStep(2));
  await page.waitForTimeout(150);
  await page.evaluate(async () => { await canvassCommitBooking(); });
  await page.waitForTimeout(500);
  return page.evaluate(() => window.__updates.find(u => u.knock_status === 'booked') || null);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const SAVED = { value: { ids: ['tech4', 'tm_huang'], names: ['dennis larsen', 'cristina huang'] } };
  try {
    console.log('\n[1] a Setter who cannot close — booking goes to Dennis');
    {
      const page = await boot(browser, { id: 'setter1', name: 'New Hire', role: 'setter' }, SAVED);
      const u = await bookAtDoor(page);
      if (u && u.rep_id === 'tech4') ok('rep_id is the closer (tech4 / Dennis), not the setter');
      else bad('routed to ' + (u && u.rep_id));
      if (u && u.setter_name === 'New Hire') ok('setter_name records who actually booked it');
      else bad('setter_name = ' + (u && u.setter_name));
      await page.close();
    }

    console.log('\n[2] a Setter who IS a closing Tech — they keep it');
    {
      const page = await boot(browser, { id: 'tm_huang', name: 'Cristina Huang', role: 'setter' }, SAVED);
      const u = await bookAtDoor(page);
      if (u && u.rep_id === 'tm_huang') ok('a closer keeps their own booking');
      else bad('taken off the closer: rep_id=' + (u && u.rep_id));
      if (u && u.setter_name === 'Cristina Huang') ok('still credited as the setter (self-set + self-close)');
      else bad('setter_name = ' + (u && u.setter_name));
      await page.close();
    }

    console.log('\n[3] day one — no saved list yet');
    {
      // Dennis named Christina Hackman, Christina Huang and himself. They must route
      // correctly before an admin has ever opened the Team tab.
      const p1 = await boot(browser, { id: 'x1', name: 'Christina Hackman', role: 'setter' }, null);
      const u1 = await bookAtDoor(p1);
      if (u1 && u1.rep_id === 'x1') ok('Christina Hackman closes her own on the seed list');
      else bad('Hackman routed to ' + (u1 && u1.rep_id));
      await p1.close();
      const p2 = await boot(browser, { id: 'x2', name: 'Someone Else', role: 'setter' }, null);
      const u2 = await bookAtDoor(p2);
      if (u2 && u2.rep_id === 'tech4') ok('an unlisted setter still routes to Dennis');
      else bad('routed to ' + (u2 && u2.rep_id));
      await p2.close();
    }

    console.log('\n[4] the setter keeps read-only sight of it');
    {
      const page = await boot(browser, { id: 'setter1', name: 'New Hire', role: 'setter' }, SAVED);
      await page.evaluate(() => salesSetView('leads'));
      await page.waitForTimeout(400);
      const body = await page.evaluate(() => document.getElementById('dashBody').innerText);
      if (/booked by me/i.test(body)) ok('a "Booked by me" section renders');
      else bad('handed-off deals are invisible to the setter who set them');
      if (/Paul Wilton/.test(body)) ok('the handed-off lead is listed');
      else bad('lead not shown');
      if (/closing:/i.test(body)) ok('it names who is closing it');
      else bad('no closer named');
      if (/view only|View only/.test(body)) ok('it is marked view-only');
      else bad('not marked read-only');
      const editable = await page.evaluate(() =>
        /ho-1/.test((document.getElementById('dashBody').innerHTML.match(/salesEditLead\('[^']*'\)/g) || []).join(',')));
      if (!editable) ok('no edit control is wired to it');
      else bad('the setter can open the editor on a handed-off lead');
      await page.close();
    }

    console.log('\n[5] a closer does NOT get a "Booked by me" query');
    {
      const page = await boot(browser, { id: 'tech4', name: 'Dennis Larsen', role: 'tech' }, SAVED);
      await page.evaluate(() => salesSetView('leads'));
      await page.waitForTimeout(400);
      const body = await page.evaluate(() => document.getElementById('dashBody').innerText);
      if (!/booked by me/i.test(body)) ok('closers see their leads normally, no handed-off section');
      else bad('a closer got a Booked-by-me list');
      await page.close();
    }

    console.log('\n[6] the admin toggle');
    {
      const page = await boot(browser, { id: 'tech4', name: 'Dennis Larsen', role: 'tech' }, SAVED);
      const saved = await page.evaluate(async () => {
        await window.bbSaveClosers([{ id: 'tm_hack', name: 'Christina Hackman' }]);
        return window.__upserts;
      });
      const row = saved.find(x => x.table === 'pipeline_state');
      if (row && row.value.key === 'closers') ok('saves to pipeline_state — no migration needed');
      else bad('wrong storage: ' + JSON.stringify(saved));
      if (row && row.value.value.ids.indexOf('tech4') > -1) ok('Dennis is always kept — he is the fallback target');
      else bad('the fallback closer can be removed, orphaning every routed booking');
      if (row && row.value.value.names.indexOf('christina hackman') > -1) ok('stores the name too, so a changed id still resolves');
      else bad('id-only storage');
      const failMsg = await page.evaluate(async () => {
        document.body.insertAdjacentHTML('beforeend', '<span id="teamCloserMsg"></span>');
        const orig = window.supabase.createClient;
        window.supabase.createClient = () => ({ from: () => { const c = {};
          ['select','eq','update','insert'].forEach(m => c[m] = () => c);
          c.upsert = () => c; c.then = r => r({ data: null, error: { message: 'denied' } }); return c; } });
        await window.teamSaveClosers();
        window.supabase.createClient = orig;
        return document.getElementById('teamCloserMsg').textContent;
      });
      if (/not saved/i.test(failMsg)) ok('a failed save says so rather than reporting success');
      else bad('failed save reported as: "' + failMsg + '"');
      await page.close();
    }

    console.log('\n[7] source');
    {
      if (/rep_id: _bkCloserId/.test(SRC)) ok('the door booking writes the closer');
      else bad('door booking still assigns the booker');
      if (/act\.rep_id = window\.bbCloserForBooking\(_dialPerson\)/.test(SRC)) ok('the dialer booking writes the closer');
      else bad('dialer booking still assigns the booker');
      if (!/team_members[\s\S]{0,120}can_close/.test(SRC)) ok('no new team_members column is selected (would 400 the Team tab pre-migration)');
      else bad('a can_close column crept into a select');
    }

  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
