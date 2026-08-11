/**
 * "Loading dial queue…" / "Loading your week…" forever.
 *
 * Neither loader had a network timeout. A stalled mobile request never resolves AND
 * never rejects, so the existing .catch handlers could not fire, the loading guard
 * latched true, and the panel stayed on its placeholder until a full page reload.
 *
 *   node scratchpad/test-stuck-loading.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = (m) => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

// Run the real bbLoadRepScore against a supabase client that never settles.
async function runScore(page, { hang }) {
  return page.evaluate(async ({ src, hang }) => {
    const start = src.indexOf('  var _bbScore = null, _bbScoreAt = 0');
    const end   = src.indexOf('  window.bbMountRepScore =');
    const block = src.slice(start, end);

    // Minimal stubs for everything the block touches.
    // ⚠️ Without these the client constructor throws BEFORE any query, so the run
    // fails instantly and the timeout is never exercised — step 1 then passes for
    // entirely the wrong reason.
    window.SUPA_URL = 'https://example.supabase.co';
    window.SUPA_KEY = 'anon-test-key';
    window.BB_SCORE_TTL = 120000;
    window.WEEKLY_HOURS_TARGET = 30;
    window._weekStart = (d) => new Date(d.getTime() - 3 * 86400000);
    window.bbRepName = () => 'Dennis Larsen';
    window._repCanonical = (n) => String(n || '').toLowerCase();
    const never = new Promise(() => {});                       // never settles
    const good  = { data: [], error: null };
    window.supabase = { createClient: () => ({
      from: () => ({ select: () => ({ gte: () => ({ limit: () => (hang ? never : good) }) }) })
    })};

    let load, scoreHtml, loadingFlag;
    eval(block + `
      BB_NET_TIMEOUT_MS = 1200;   // shorten the real race so the test stays quick
      load = bbLoadRepScore;
      scoreHtml = window._bbRepScoreboardHtml;
      loadingFlag = () => _bbScoreLoading;
    `);

    const t0 = Date.now();
    const out = await load(true);
    const ms = Date.now() - t0;
    return { ms, out, html: scoreHtml("call"), stillLoading: loadingFlag(), reason: out && out.netReason };
  }, { src: SRC, hang });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('about:blank');

  try {
    // ── 1. the reported symptom ─────────────────────────────────────────────
    console.log('\n[1] scoreboard against a hung connection');
    {
      const r = await runScore(page, { hang: true });
      // Must actually WAIT for the timeout — an instant return means it threw early
      // and the race was never the thing that saved it.
      if (r.ms >= 1000 && r.ms < 20000) ok('waited for the timeout (' + r.ms + 'ms) then gave up');
      else bad(r.ms < 1000 ? 'returned in ' + r.ms + 'ms — threw before the race ran' : 'hung for ' + r.ms + 'ms');
      if (r.out && r.out.netFail) ok('flagged as a network failure');
      else bad('did not flag netFail — a real zero week and a dead connection look identical');
      if (!r.stillLoading) ok('the loading guard was RELEASED (a retry is possible)');
      else bad('_bbScoreLoading latched true — every later attempt returns null forever');
      if (!/Loading your week/.test(r.html)) ok('no longer renders the eternal placeholder');
      else bad('still stuck on "Loading your week…"');
      if (/Retry/.test(r.html)) ok('offers a Retry button');
      else bad('no way for the rep to retry');
    }

    // ── 2. a healthy load is unaffected ─────────────────────────────────────
    console.log('\n[2] healthy load still works');
    {
      const r = await runScore(page, { hang: false });
      if (r.ms < 2000) ok('returns immediately when the network is fine');
      else bad('slow on a healthy load: ' + r.ms + 'ms');
      if (r.out && !r.out.netFail) ok('not flagged as failed');
      else bad('healthy load wrongly flagged: ' + r.reason);
      if (!/Retry/.test(r.html) && !/Loading your week/.test(r.html)) ok('renders the real scoreboard');
      else bad('did not render the scoreboard');
      if (!r.stillLoading) ok('guard released');
      else bad('guard left set on the happy path');
    }

    // ── 3. the wiring, in source ────────────────────────────────────────────
    console.log('\n[3] dial queue wiring');
    {
      if (/_bbWithTimeout\(bbDialLoadQueue\(\), 'dial queue'\)/.test(SRC)) ok('dial queue load is raced against a timeout');
      else bad('dial queue still has no timeout — it can hang forever');

      const guard = SRC.match(/if \(!bbDialLoaded\) \{[\s\S]*?\n      return;/);
      if (guard && /bbDialLoadError =/.test(guard[0])) ok('a timeout records a rep-facing reason');
      else bad('timeout produces no message');

      if (/bbDialLoadError=\\'\\';bbDialLoaded=false;renderBBDialerView\(\)/.test(SRC)) ok('Try again clears the error and reloads');
      else bad('no retry control');

      // The guard must be released on every path, including timeout.
      const score = SRC.match(/window\.bbLoadRepScore = async function[\s\S]*?return out;\n  \};/);
      if (score && /finally \{[\s\S]{0,220}_bbScoreLoading = false;/.test(score[0])) ok('_bbScoreLoading released in a finally');
      else bad('_bbScoreLoading not released in a finally — it can still latch');

      if (/var BB_NET_TIMEOUT_MS = 15000;/.test(SRC)) ok('timeout budget is a named constant');
      else bad('no timeout constant');
    }

  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
