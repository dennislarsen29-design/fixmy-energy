/**
 * Door booking must never complete without a reachable phone.
 *
 * Reported: booked at the door, lead activated, name + email present, PHONE EMPTY.
 * Cause: the confirm step rendered "I have (no phone yet) — is that the best number
 * to reach you?" with a ✓ Confirmed button under it, and `allOk` only counted
 * confirmations, never values.
 *
 *   node scratchpad/test-book-phone.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = (m) => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('about:blank');

  // Lift CV_CONFIRM_ITEMS + the value/missing helpers and run them for real.
  const a = SRC.indexOf('    var CV_CONFIRM_ITEMS = [');
  const b = SRC.indexOf('    // The same photo categories');
  const c = SRC.indexOf('    // Blank, or a placeholder we generated ourselves, is not a value.');
  const d = SRC.indexOf('    window.canvassBkConfirm = function(k) {');
  await page.evaluate(({ items, helpers }) => {
    eval(items + '\n' + helpers +
      '\nwindow.__items = CV_CONFIRM_ITEMS; window.__missing = _cvBkMissing; window.__valueOf = _cvBkValueOf;');
  }, { items: SRC.slice(a, b), helpers: SRC.slice(c, d) });

  const missing = (key, lead) => page.evaluate(({ key, lead }) => {
    const it = window.__items.find(i => i.key === key);
    return window.__missing(it, lead);
  }, { key, lead });

  try {
    // ── 1. the reported lead ────────────────────────────────────────────────
    console.log('\n[1] a Black Box lead with no phone (the report)');
    {
      const lead = { first_name: 'Raymond', last_name: 'Byrne', phone: null,
                     email: 'Rsbyrn2003@yahoo.com', address: '16829 Acebo Dr, San Diego, CA 92128' };
      if (await missing('phone', lead)) ok('phone is flagged missing — cannot be ticked');
      else bad('a blank phone can still be confirmed — the reported bug');
      if (!(await missing('name', lead))) ok('name is present, so it stays confirmable');
      else bad('name wrongly flagged');
    }

    // ── 2. junk values must not count ───────────────────────────────────────
    console.log('\n[2] values that only look real');
    {
      if (await missing('phone', { phone: '619555' })) ok('a partial number does not count');
      else bad('6-digit phone accepted');
      // ⚠ "(619) 555-0100 ext" strips to exactly 10 digits and IS valid — an extension
      // with digits is the real malformed case, since we cannot dial it.
      if (await missing('phone', { phone: '(619) 555-0100 x1234' })) ok('a number with an extension is refused');
      else bad('undiallable extension accepted');
      if (!(await missing('phone', { phone: '6195550100' }))) ok('a clean 10-digit number counts');
      else bad('valid number rejected');
      if (!(await missing('phone', { phone: '1 (619) 555-0100' }))) ok('leading 1 + formatting is accepted');
      else bad('formatted number rejected');
      if (await missing('name', { first_name: '', last_name: '' })) ok('an empty name is flagged');
      else bad('empty name accepted');
    }

    // ── 3. optional fields stay optional ────────────────────────────────────
    console.log('\n[3] fields that must NOT block a booking');
    {
      const noEmail = { first_name: 'Ray', last_name: 'Byrne', phone: '6195550100', email: null };
      if (!(await missing('email', noEmail))) ok('a missing email does not block the booking');
      else bad('email wrongly required — reps would be stuck at the door');
      if (!(await missing('appt', {}))) ok('appointment (no field) never blocks');
      else bad('appt wrongly flagged');
      if (!(await missing('title', {}))) ok('who-is-home never blocks');
      else bad('title wrongly flagged');
    }

    // ── 4. the wiring ───────────────────────────────────────────────────────
    console.log('\n[4] wiring');
    {
      if (/required:true \}/.test(SRC.slice(a, b)) || /required:true/.test(SRC.slice(a, b))) ok('name + phone marked required');
      else bad('no required flags');

      const render = SRC.match(/CV_CONFIRM_ITEMS\.forEach\(function\(item\)[\s\S]*?\n        \}\);/);
      if (render && /_cvBkMissing\(item, lead\)/.test(render[0])) ok('the render asks whether a value is missing');
      else bad('render still offers Confirmed unconditionally');
      if (render && /&#43; Add /.test(render[0])) ok('offers "Add <field>" instead of Confirmed when blank');
      else bad('no Add control');

      if (/var allOk = doneCount === CV_CONFIRM_ITEMS\.length && !missing\.length;/.test(SRC)) ok('Next stays disabled while a value is missing');
      else bad('Next can still be reached with a blank phone');
      if (/Still needed before this can be booked/.test(SRC)) ok('names what is still needed');
      else bad('no explanation of what is blocking');

      const conf = SRC.match(/window\.canvassBkConfirm = function[\s\S]*?\n    \};/);
      if (conf && /_cvBkMissing\(it, _cvBk\.lead\)\) \{ canvassBkFix/.test(conf[0])) ok('confirm re-routes to the prompt rather than ticking a blank');
      else bad('confirm can still tick a blank value');

      const fix = SRC.match(/window\.canvassBkFix = async function[\s\S]*?\n    \};/);
      if (fix && /d\.length !== 10/.test(fix[0])) ok('the Fix prompt refuses a malformed number');
      else bad('Fix would save a half-typed phone');
      if (fix && /upd\.phone = d\.length === 10 \? d : null;/.test(fix[0])) ok('stores clean digits');
      else bad('stores the raw typed string');
    }

  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
