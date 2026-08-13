/**
 * Live power-outage targeting.
 *
 * Reported as "I don't see that a feature got implemented." Two causes:
 *   1. the "⚡ Active outages" chip row was deleted by c78892f (4th thing from that
 *      commit, after the isPinned declarations, canvassAddDoor and the phone search)
 *   2. nothing distinguished "the feed is broken" from "no outages right now"
 *
 *   node scratchpad/test-outage.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8');
const SYNC = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'outage-sync.js'), 'utf8');
let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

const srv = http.createServer((_, res) => { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<!doctype html><title>t</title>'); }).listen(8155);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('http://localhost:8155/');

  // Lift the real outage block and render it for each feed state.
  const a = SRC.indexOf('  var bbOutageZips = [];');
  const b = SRC.indexOf('  // Admin Team Dashboard (inside the Black Box Dialer)');
  await page.evaluate(src => {
    window.esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    window.CURRENT_ROLE = 'setter';
    window.bbDialFocusZip = '';
    window.supabase = { createClient: () => ({ from: () => { const c = {};
      ['select','eq','maybeSingle'].forEach(m => c[m] = () => c); c.then = r => r({ data: null, error: null }); return c; } }) };
    eval(src);
    window.__row = (mode) => window._bbOutageRowHtml(mode);
    window.__set = (st) => {
      bbOutageZipsLoaded = true;
      bbOutageZips = st.zips || [];
      bbOutageSyncedAt = st.synced_at || null;
      bbOutageError = st.error || null;
      bbOutageRowFound = st.found !== false;
    };
  }, SRC.slice(a, b));

  const render = (state, mode) => page.evaluate(({ state, mode }) => {
    window.__set(state);
    const h = window.__row(mode || 'call');
    const d = document.createElement('div'); d.innerHTML = h;
    return { html: h, text: d.innerText.replace(/\s+/g, ' ') };
  }, { state, mode });

  const NOW = () => new Date(Date.now() - 5 * 60000).toISOString();

  try {
    console.log('\n[1] active outages — what a rep should see');
    {
      const r = await render({ zips: [{ zip: '92028', affected: 1240 }, { zip: '92065', affected: 310 }], synced_at: NOW() });
      if (/Power out now/i.test(r.text)) ok('the live outage row renders');
      else bad('nothing rendered: ' + r.text);
      if (/92028/.test(r.text) && /92065/.test(r.text)) ok('lists the affected ZIPs');
      else bad('ZIPs missing');
      if (/1,550/.test(r.text)) ok('totals the homes without power (1,550)');
      else bad('no total: ' + r.text);
      if (/5m ago/.test(r.text)) ok('shows how fresh the data is');
      else bad('no freshness stamp');
      if (/bbDialSetFocusZip\('92028'\)/.test(r.html)) ok('tapping a ZIP focuses the dial queue');
      else bad('chip is not wired on Dialing');
    }

    console.log('\n[2] the same row on DOORS');
    {
      const r = await render({ zips: [{ zip: '92028', affected: 1240 }], synced_at: NOW() }, 'door');
      if (/canvassFocusOutageZip\('92028'\)/.test(r.html)) ok('on Doors the chip sorts the route instead');
      else bad('Doors chip not wired: ' + r.html.slice(0, 160));
      if (/Power out now/i.test(r.text)) ok('Doors gets the same row (it was Dialing-only before)');
      else bad('Doors still has no outage row');
    }

    console.log('\n[3] ⚠ a broken feed must NOT look like a calm night');
    {
      const quiet  = await render({ zips: [], synced_at: NOW() });
      const broken = await render({ zips: [], synced_at: NOW(), error: 'ArcGIS 503' });
      const stale  = await render({ zips: [], synced_at: new Date(Date.now() - 6 * 3600000).toISOString() });
      const never  = await render({ zips: [], synced_at: null, found: false });
      if (/No active SDG&E outages right now/i.test(quiet.text)) ok('a genuinely quiet night says so');
      else bad('quiet state: ' + quiet.text);
      if (/not reporting/i.test(broken.text)) ok('an errored feed says it is not reporting');
      else bad('broken state looked like: ' + broken.text);
      if (broken.text !== quiet.text) ok('broken and quiet render DIFFERENTLY');
      else bad('a broken feed is indistinguishable from no outages — the reported bug');
      if (/not reporting/i.test(stale.text)) ok('a 6-hour-old snapshot counts as not reporting');
      else bad('stale data presented as current: ' + stale.text);
      if (/not reporting/i.test(never.text)) ok('a feed that has never written a row says so');
      else bad('never-synced state: ' + never.text);
    }

    console.log('\n[4] the cause is admin-only');
    {
      const repText = (await render({ zips: [], synced_at: NOW(), error: 'ArcGIS 503' })).text;
      if (!/ArcGIS/.test(repText)) ok('a rep does not see vendor error text');
      else bad('vendor detail leaked to a rep: ' + repText);
      await page.evaluate(() => { window.CURRENT_ROLE = 'admin'; });
      const adminText = (await render({ zips: [], synced_at: NOW(), error: 'ArcGIS 503' })).text;
      if (/ArcGIS 503/.test(adminText)) ok('an admin gets the real cause');
      else bad('admin cannot diagnose it: ' + adminText);
      await page.evaluate(() => { window.CURRENT_ROLE = 'setter'; });
    }

    console.log('\n[5] the sync records its own failures');
    {
      if (/failed_at/.test(SYNC) && /error: e\.message/.test(SYNC)) ok('a thrown error is written to the snapshot');
      else bad('the sync still fails silently');
      if (/readSnapshot/.test(SYNC)) ok('a failed run preserves the last known zips');
      else bad('a transient blip would blank the badges');
      if (/synced_at: prev && prev\.synced_at \|\| null/.test(SYNC)) ok('synced_at is NOT bumped on failure — staleness stays visible');
      else bad('a failed run would stamp itself as fresh');
    }

    console.log('\n[6] wiring');
    {
      if (/_bbOutageRowHtml\(mode\)/.test(SRC)) ok('mounted in the shared controls row (both motions)');
      else bad('not mounted');
      if (/_cvOutageZip/.test(SRC) && /aoz !== boz/.test(SRC)) ok('Doors sorts an outage ZIP to the front of the route');
      else bad('no route prioritisation');
      if (/if \(_cvOutageZip\)/.test(SRC) && !/filter\([^)]*_cvOutageZip/.test(SRC)) ok('it prioritises and never hides');
      else bad('outage focus is filtering doors out');
      if (/c\.outage \? \(/.test(SRC)) ok('the door script has an outage branch');
      else bad('door script unchanged');
      if (/inOutage \? _bbWarn/.test(SRC)) ok('the call script has an outage branch');
      else bad('call script unchanged');
      const scripts = SRC.slice(SRC.indexOf('function cvScriptBodyHtml'), SRC.length);
      if (/Did your solar keep anything/.test(SRC)) ok('both scripts ask the one question that lands');
      else bad('the key question is missing');
      if (/Do NOT quote a battery, a price/.test(SRC)) ok('and both forbid quoting a price or naming an incentive');
      else bad('no guard on pricing — a rep would quote a battery on an outage call');
    }

  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
