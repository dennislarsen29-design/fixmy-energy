/**
 * /booked — verifies the booking confirmation moved onto its own URL, that the
 * conversion fires exactly once and only on paid clicks, and that the page
 * never invents a confirmation it can't back up.
 *
 *   node scratchpad/test-booked.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = (m) => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

// ── static server, with /book and /booked mapped like netlify.toml ──────────
function serve(port) {
  return http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/book') p = '/book.html';
    if (p === '/booked') p = '/booked.html';
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); return res.end('nope');
    }
    const ext = path.extname(f);
    res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html' : 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(port);
}

// Everything the page loads from the network is stubbed: no Google, no GHL.
async function stub(page, { conversions }) {
  await page.route('**://*/**', async (route) => {
    const url = route.request().url();
    if (url.includes('localhost')) return route.continue();

    // Record Google Ads conversion beacons
    if (url.includes('google-analytics.com') || url.includes('googletagmanager.com') ||
        url.includes('googleadservices.com') || url.includes('doubleclick.net')) {
      if (/u8R7COLKt7AcEMDgisFD/.test(url)) conversions.push(url);
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });

  await page.addInitScript(() => { window.fbq = function () {}; });
}

// The pages declare `function gtag(){dataLayer.push(arguments)}` at top level,
// which overwrites any stub we install — so conversions must be counted out of
// dataLayer itself, not from a wrapper. (Counting from a stub silently reports
// zero for BOTH the fires-correctly and never-fires cases.)
const convCount = (page) => page.evaluate(() =>
  (window.dataLayer || []).filter(a => a && a[0] === 'event' && a[1] === 'conversion' &&
    a[2] && /u8R7COLKt7AcEMDgisFD/.test(String(a[2].send_to || ''))).length);

async function bookOn(page, base, { email, gclid, gbraid, apptOk = true }) {
  const q = gclid ? '?gclid=' + gclid : (gbraid ? '?gbraid=' + gbraid : '');
  await page.goto(base + '/book' + q, { waitUntil: 'domcontentloaded' });

  // Stub the booking function call and drive the success path directly, so the
  // test exercises OUR handoff logic rather than Google Places / GHL.
  await page.evaluate((opts) => {
    const result = opts.apptOk
      ? { ok: true, appointmentId: 'appt_abc123' }
      : { ok: true, appointmentId: null, apptError: 'calendar rejected' };
    const label = 'Mon, Aug 17 · 3:00 – 5:00 PM';
    const ph = '(619) 555-0142';
    const em = opts.email || '';
    const _appointmentBooked = !!result.appointmentId && !result.apptError;
    sessionStorage.setItem('fmBooking', JSON.stringify({
      id: result.appointmentId || ('req_' + Date.now()),
      label: label,
      appointmentBooked: _appointmentBooked,
      email: em || null,
      phone10: ph.replace(/\D/g, '').slice(-10)
    }));
    window.location.href = '/booked';
  }, { email, apptOk });

  await page.waitForURL(/\/booked/, { timeout: 5000 });
}

(async () => {
  const port = 8099;
  const server = serve(port);
  const base = 'http://localhost:' + port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  try {
    // ── 1. the real /book page actually hands off ────────────────────────────
    console.log('\n[1] /book hands off to /booked');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await page.goto(base + '/book', { waitUntil: 'domcontentloaded' });

      const src = await page.evaluate(() => document.documentElement.innerHTML);
      if (/sessionStorage\.setItem\('fmBooking'/.test(src)) ok('book.html stashes fmBooking');
      else bad('book.html does NOT stash fmBooking');
      if (/window\.location\.href = '\/booked'/.test(src)) ok('book.html redirects to /booked');
      else bad('book.html does NOT redirect to /booked');
      await ctx.close();
    }

    // ── 2. confirmation renders on the new URL ───────────────────────────────
    console.log('\n[2] /booked renders the confirmation');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await bookOn(page, base, { email: 'erik@example.com', gclid: 'TEST_GCLID_1' });

      const url = page.url();
      if (/\/booked$/.test(url)) ok('URL is exactly /booked');
      else bad('URL is not clean /booked: ' + url);
      if (!/[?&](email|phone|code)=/i.test(url)) ok('no PII in the URL');
      else bad('PII leaked into the URL: ' + url);

      const body = await page.evaluate(() => document.body.innerText);
      if (/congratulations/i.test(body)) ok('shows "Congratulations!"');
      else bad('missing headline — got: ' + body.slice(0, 120));
      if (/Mon, Aug 17/.test(body)) ok('shows the booked slot');
      else bad('slot label missing');
      await ctx.close();
    }

    // ── 3. conversion fires on a paid click, once ────────────────────────────
    console.log('\n[3] conversion fires once on a paid click');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await bookOn(page, base, { email: 'erik@example.com', gclid: 'TEST_GCLID_1' });

      const n = await convCount(page);
      if (n === 1) ok('conversion fired exactly once');
      else bad('expected 1 conversion, got ' + n);

      const dl = await page.evaluate(() => (window.dataLayer || []).filter(x => x && x.event === 'booking_confirmed').length);
      if (dl === 1) ok('dataLayer booking_confirmed pushed once (for GTM)');
      else bad('expected 1 dataLayer event, got ' + dl);

      // Refresh must not re-count.
      await page.reload({ waitUntil: 'domcontentloaded' });
      const n2 = await convCount(page);
      if (n2 === 0) ok('refresh does not re-fire the conversion');
      else bad('refresh re-fired the conversion ' + n2 + 'x');
      await ctx.close();
    }

    // ── 4. gbraid (iOS paid click) also counts — the fix ─────────────────────
    console.log('\n[4] gbraid counts as a paid click');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await bookOn(page, base, { email: 'erik@example.com', gbraid: 'TEST_GBRAID_1' });
      const n = await convCount(page);
      if (n === 1) ok('gbraid click fired the conversion');
      else bad('gbraid click did NOT fire the conversion (got ' + n + ')');
      await ctx.close();
    }

    // ── 5. organic booking must NOT inflate the campaign ─────────────────────
    console.log('\n[5] organic booking fires no Ads conversion');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await bookOn(page, base, { email: 'erik@example.com' });
      const n = await convCount(page);
      if (n === 0) ok('no Ads conversion without a paid click');
      else bad('organic booking fired ' + n + ' conversion(s)');

      const body = await page.evaluate(() => document.body.innerText);
      if (/congratulations/i.test(body)) ok('customer still sees the confirmation');
      else bad('organic customer lost the confirmation');
      await ctx.close();
    }

    // ── 6. direct hit with no booking — honest, and no conversion ────────────
    console.log('\n[6] /booked visited directly');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await page.goto(base + '/booked?gclid=X', { waitUntil: 'domcontentloaded' });

      const body = await page.evaluate(() => document.body.innerText);
      if (/no booking found/i.test(body)) ok('shows "No booking found"');
      else bad('invented a confirmation: ' + body.slice(0, 140));
      if (!/congratulations/i.test(body)) ok('does not claim a booking');
      else bad('claims a booking it cannot back up');
      const n = await convCount(page);
      if (n === 0) ok('no conversion counted');
      else bad('counted ' + n + ' phantom conversion(s)');
      await ctx.close();
    }

    // ── 7. portal handoff ────────────────────────────────────────────────────
    console.log('\n[7] portal magic-link handoff');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await bookOn(page, base, { email: 'erik@example.com', gclid: 'G1' });
      const href = await page.evaluate(() => (document.getElementById('portalManual') || {}).href || '');
      if (/portal\?email=erik%40example\.com&code=6195550142/.test(href)) ok('magic link built with email + phone code');
      else bad('magic link wrong: ' + href);
      const cd = await page.evaluate(() => document.getElementById('redirectCountdown').textContent);
      if (/Opening your portal/i.test(cd)) ok('countdown to the portal is running');
      else bad('no countdown: ' + cd);
      await ctx.close();
    }

    // ── 8. no email — must not redirect to a broken magic link ───────────────
    console.log('\n[8] booking without an email');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await bookOn(page, base, { email: '' });
      await page.waitForTimeout(600);
      const body = await page.evaluate(() => document.body.innerText);
      if (/text you a confirmation/i.test(body)) ok('shows the "we\'ll text you" state');
      else bad('wrong no-email state: ' + body.slice(0, 140));
      if (/\/booked$/.test(page.url())) ok('stays on /booked (no broken portal link)');
      else bad('navigated away to ' + page.url());
      await ctx.close();
    }

    // ── 9. appointment rejected by GHL — honest wording ──────────────────────
    console.log('\n[9] GHL rejected the appointment');
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const conversions = [];
      await stub(page, { conversions });
      await bookOn(page, base, { email: 'erik@example.com', gclid: 'G1', apptOk: false });
      const body = await page.evaluate(() => document.body.innerText);
      if (/request received/i.test(body)) ok('says "Request Received" not "Congratulations"');
      else bad('claimed a confirmed booking: ' + body.slice(0, 140));
      await ctx.close();
    }

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
