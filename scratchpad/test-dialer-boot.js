/**
 * Boot the REAL dialer view with a healthy stubbed network and see whether
 * "Loading dial queue…" ever clears. Reported still stuck on a device where the
 * scoreboard loads fine — so this is not the network.
 *
 * Per CLAUDE.md: renderBBDialerView writes into #dashBody which stays hidden until a
 * dashboard boots, and the queue loads over RAW PostgREST, so window.fetch must be
 * stubbed for /rest/v1/customers as well as the supabase client.
 *
 *   node scratchpad/test-dialer-boot.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function serve(port) {
  return http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/' || p === '/portal') p = '/portal.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('x'); }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(f));
  }).listen(port);
}

(async () => {
  const port = 8131;
  const srv = serve(port);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 400)); });

  // Everything external is stubbed; only localhost is real.
  await page.route('**://*/**', r => r.request().url().includes('localhost')
    ? r.continue()
    : r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  // Stub BOTH transports before any page script runs.
  await page.addInitScript(() => {
    window.__fetches = [];
    const LEADS = [{
      id: 'lead-1', first_name: null, last_name: null, address: '123 Test St, San Diego, CA 92128',
      phone: '6195550100', email: null, title_owner: 'BYRNE RAYMOND & SANDRA REVOCABLE FAMILY TRUST 09-27-',
      apn: '27413027', lat: 33.02, lng: -117.07, dnc: false, black_box: true,
      lead_source: 'orphaned_list', original_installer: 'SunPower', install_year: 2019,
      dial_status: null, dialed_at: null, callback_at: null, dial_attempts: 0, lead_score: 50, notes: null
    }];
    const realFetch = window.fetch.bind(window);
    window.fetch = async function (url, opts) {
      const u = String(url);
      window.__fetches.push(u.slice(0, 140));
      if (u.includes('/rest/v1/')) {
        return { ok: true, status: 200, json: async () => LEADS, text: async () => JSON.stringify(LEADS) };
      }
      if (u.includes('localhost')) return realFetch(url, opts);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };
    const tbl = () => {
      const chain = {};
      ['select','eq','or','is','not','gte','lte','order','limit','range','in','update','insert','upsert','neq'].forEach(m => {
        chain[m] = () => chain;
      });
      chain.then = (res) => res({ data: [], error: null });
      return chain;
    };
    window.supabase = { createClient: () => ({ from: tbl }) };
  });

  try {
    await page.goto(`http://localhost:${port}/portal.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // Boot a sales dashboard, then switch to the dialer — the documented harness path.
    const booted = await page.evaluate(async () => {
      window.CURRENT_ROLE = 'tech';
      const person = { id: 'tech4', name: 'Dennis Larsen', role: 'tech' };
      window.person = person;
      try {
        if (typeof loadSalesDashboard === 'function') await loadSalesDashboard(person);
      } catch (e) { return 'loadSalesDashboard threw: ' + e.message; }
      try {
        if (typeof salesSetView === 'function') salesSetView('dialer');
        else if (typeof renderBBDialerView === 'function') renderBBDialerView();
      } catch (e) { return 'dialer switch threw: ' + e.message; }
      return 'ok';
    });
    console.log('boot:', booted);

    // Give the queue load every chance, well past the 15s budget.
    for (const t of [1000, 3000, 6000, 10000, 17000]) {
      await page.waitForTimeout(t === 1000 ? 1000 : t - 0);
      const state = await page.evaluate(() => {
        const b = document.getElementById('dashBody');
        const txt = b ? b.innerText.slice(0, 200).replace(/\s+/g, ' ') : '(no dashBody)';
        return {
          loading: /Loading dial queue/.test(txt),
          timedOut: /timed out|Try again/i.test(txt),
          txt,
          flags: {
            bbDialLoaded: typeof bbDialLoaded !== 'undefined' ? bbDialLoaded : 'undef',
            bbDialLoading: typeof bbDialLoading !== 'undefined' ? bbDialLoading : 'undef'
          }
        };
      });
      console.log(`  after ~${t}ms  loaded=${state.flags.bbDialLoaded} loading=${state.flags.bbDialLoading} stuck=${state.loading} timeoutShown=${state.timedOut}`);
      if (!state.loading) { console.log('  → cleared:', state.txt.slice(0, 120)); break; }
      if (t === 17000) console.log('  → STILL STUCK. body:', state.txt.slice(0, 160));
    }

    console.log('\nfetches attempted:');
    const fetched = await page.evaluate(() => window.__fetches || []);
    fetched.slice(0, 12).forEach(f => console.log('   ', f));
    if (!fetched.length) console.log('    (none — bbDialLoadQueue never issued a request)');

    console.log('\nerrors:');
    console.log(errors.length ? errors.join('\n') : '  (none)');

    // ── pass/fail ────────────────────────────────────────────────────────
    const final = await page.evaluate(() => {
      const b = document.getElementById('dashBody');
      const t = b ? b.innerText : '';
      return { stuck: /Loading dial queue/.test(t), hasCard: /Next Call|Pinned from search|No fresh leads|Nothing worked yet|No callbacks/i.test(t), full: t.replace(/\s+/g,' ').slice(0, 400) };
    });
    const realErrors = errors.filter(e => !/unsupported MIME type/.test(e));
    let fail = 0;
    const ok = m => console.log('  \x1b[32m\u2713\x1b[0m ' + m);
    const bad = m => { fail++; console.log('  \x1b[31m\u2717\x1b[0m ' + m); };
    console.log('\nassertions:');
    if (!final.stuck) ok('the dialer clears "Loading dial queue…"');
    else bad('STILL STUCK on the loading placeholder');
    if (final.hasCard) ok('renders a real queue state');
    else bad('no lead card or empty-state rendered. body: ' + final.full);
    if (!realErrors.length) ok('no page errors during render');
    else bad('render threw: ' + realErrors.join(' | '));
    console.log('\n' + '\u2500'.repeat(52));
    console.log(fail ? fail + ' failed' : 'all passed');
    process.exitCode = fail ? 1 : 0;

  } finally {
    await browser.close();
    srv.close();
  }
})();
