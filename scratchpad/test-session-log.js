/**
 * The Session Log listed the same door twice.
 *
 * Reported with 2803 Morningside Trl showing "Not Home / just now" on two rows, and
 * 3033 Via Loma showing "Warm / 1h ago" on two rows. All three writers unshifted
 * blind, and canvassReopen exists precisely so a rep can re-disposition a door — so
 * the log filled with duplicates, the older one showing a stale outcome.
 *
 *   node scratchpad/test-session-log.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ⚠️ about:blank has NO localStorage (SecurityError). The writer persists there, so the
// harness needs a real origin.
const srv = http.createServer((_, res) => { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<!doctype html><title>t</title>'); }).listen(8147);

const SRC = fs.readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('http://localhost:8147/');

  // Lift the real writer and run it against a real localStorage.
  const a = SRC.indexOf('  window._cvPushKnockHistory = function(entry) {');
  const b = SRC.indexOf('  window.adminCanvassKnock = async function(id, knockStatus) {');
  await page.evaluate(src => { eval(src); }, SRC.slice(a, b));

  const push = e => page.evaluate(e => window._cvPushKnockHistory(e), e);
  const log  = () => page.evaluate(() => JSON.parse(localStorage.getItem('bbKnockHistory') || '[]'));

  try {
    console.log('\n[1] the reported case — re-dispositioning the same door');
    {
      await push({ id: 'd1', address: '2803 MORNINGSIDE TRL', knockStatus: 'not_home', ts: '2026-08-12T22:00:00Z' });
      await push({ id: 'd1', address: '2803 MORNINGSIDE TRL', knockStatus: 'not_home', ts: '2026-08-12T22:40:00Z' });
      let h = await log();
      if (h.length === 1) ok('one door, one entry');
      else bad('still ' + h.length + ' entries — the reported duplicate');
      if (h[0] && h[0].ts === '2026-08-12T22:40:00Z') ok('and it is the LATEST disposition, not the first');
      else bad('kept the stale entry: ' + JSON.stringify(h[0]));
    }

    console.log('\n[2] a door that genuinely changed outcome');
    {
      await push({ id: 'd2', address: '1220 VIA RAMON', knockStatus: 'not_home', ts: '2026-08-12T20:00:00Z' });
      await push({ id: 'd2', address: '1220 VIA RAMON', knockStatus: 'booked',   ts: '2026-08-12T22:50:00Z' });
      const h = await log();
      const mine = h.filter(x => x.id === 'd2');
      if (mine.length === 1) ok('a come-back that later books shows once');
      else bad(mine.length + ' entries for one door');
      if (mine[0].knockStatus === 'booked') ok('showing Booked, not the earlier Not Home');
      else bad('shows ' + mine[0].knockStatus);
      if (h[0].id === 'd2') ok('and it moves to the top of the log');
      else bad('stale ordering: top is ' + h[0].id);
    }

    console.log('\n[3] different doors are NOT collapsed');
    {
      await page.evaluate(() => localStorage.removeItem('bbKnockHistory'));
      // Two real leads on the same street — must both survive.
      await push({ id: 'a1', address: '3033 VIA LOMA VISTA, ESCONDIDO', knockStatus: 'warm', ts: '2026-08-12T21:00:00Z' });
      await push({ id: 'a2', address: '3033 VIA LOMA, SAN DIEGO',      knockStatus: 'warm', ts: '2026-08-12T21:05:00Z' });
      const h = await log();
      if (h.length === 2) ok('two distinct lead ids both kept (dedupe is by id, never by address)');
      else bad('collapsed distinct leads: ' + JSON.stringify(h));
    }

    console.log('\n[4] the cap still holds, and a re-knock does not consume a slot');
    {
      await page.evaluate(() => localStorage.removeItem('bbKnockHistory'));
      for (let i = 0; i < 30; i++) await push({ id: 'x' + i, address: 'addr ' + i, knockStatus: 'not_home', ts: '2026-08-12T2' + (i % 10) + ':00:00Z' });
      let h = await log();
      if (h.length === 25) ok('capped at 25');
      else bad('length ' + h.length);
      const before = h.length;
      await push({ id: 'x29', address: 'addr 29', knockStatus: 'warm', ts: '2026-08-12T23:59:00Z' });
      h = await log();
      if (h.length === before) ok('re-dispositioning an existing door does not push another out');
      else bad('length changed to ' + h.length);
      if (h.filter(x => x.id === 'x29').length === 1) ok('and it appears exactly once');
      else bad('duplicated at the cap boundary');
    }

    console.log('\n[5] input safety');
    {
      const before = (await log()).length;
      await push(null);
      await push({ address: 'no id' });
      if ((await log()).length === before) ok('an entry with no id is ignored rather than corrupting the log');
      else bad('wrote a junk entry');
    }

    console.log('\n[6] all three writers go through it');
    {
      const calls = (SRC.match(/window\._cvPushKnockHistory\(\{/g) || []).length;
      if (calls === 3) ok('admin canvass, rep route and door booking all call the shared writer');
      else bad(calls + ' call sites — expected 3');
      const raw = SRC.split('\n').filter(l => /hist\.unshift\(/.test(l));
      if (raw.length === 1) ok('exactly one raw unshift left (inside the writer itself)');
      else bad(raw.length + ' raw unshifts — a caller still bypasses the dedupe');
      const bookEntry = (SRC.match(/knockStatus: 'booked', ts: new Date\(\)\.toISOString\(\) \}\);/) || [])[0];
      if (SRC.indexOf("name: ((lead.first_name||'')+' '+(lead.last_name||'')).trim(),\n        knockStatus: 'booked'") > -1)
        ok('a booked entry now carries the name like every other entry');
      else bad('booked entries still drop the name');
    }

  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
