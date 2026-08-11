/**
 * Three field requests on the Black Box card:
 *   1. no vendor / pipeline language in a rep's view (proprietary)
 *   2. an editable phone field
 *   3. both spouses off the title as usable contacts
 *
 *   node scratchpad/test-owner-contacts.js
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

  // Lift the owner-parsing helpers and run them for real.
  const start = SRC.indexOf('  var BB_ENTITY_RX =');
  const end   = SRC.indexOf('  function _bbEntityBadgeHtml(');
  const tail0 = SRC.indexOf('  function _bbOwnerContacts(');
  const tail1 = SRC.indexOf('  // One line telling the rep');
  await page.evaluate(({ a, b }) => {
    window.esc = (s) => String(s == null ? '' : s);
    eval(a + '\n' + b + '\nwindow.__parse = _bbOwnerParse; window.__contacts = _bbOwnerContacts;');
  }, { a: SRC.slice(start, end), b: SRC.slice(tail0, tail1) });

  const contacts = (raw) => page.evaluate(r => window.__contacts(r), raw);
  const parsed   = (raw) => page.evaluate(r => window.__parse(r), raw);

  try {
    // ── 1. both spouses off a family trust (the reported example) ───────────
    console.log('\n[1] BYRNE RAYMOND & SANDRA REVOCABLE FAMILY TRUST 09-27-');
    {
      const c = await contacts('BYRNE RAYMOND & SANDRA REVOCABLE FAMILY TRUST 09-27-');
      if (c.length === 2) ok('found both spouses');
      else bad('expected 2 contacts, got ' + JSON.stringify(c));
      if (c[0] && c[0].full === 'Raymond Byrne') ok('primary is Raymond Byrne');
      else bad('primary wrong: ' + JSON.stringify(c[0]));
      if (c[1] && c[1].full === 'Sandra Byrne') ok('second is Sandra Byrne');
      else bad('second wrong: ' + JSON.stringify(c[1]));
      const p = await parsed('BYRNE RAYMOND & SANDRA REVOCABLE FAMILY TRUST 09-27-');
      if (!/09-27/.test(p.display)) ok('the dangling partial date is stripped from the card');
      else bad('partial date still renders: ' + p.display);
    }

    // ── 2. the ampersand-no-space form, with a middle initial ───────────────
    console.log('\n[2] STRICKER MICHAEL&AMIE F');
    {
      const c = await contacts('STRICKER MICHAEL&AMIE F');
      if (c.length === 2) ok('both names found without spaces around &');
      else bad('got ' + JSON.stringify(c));
      if (c[0] && c[0].full === 'Michael Stricker' && c[1] && c[1].full === 'Amie Stricker') ok('Michael + Amie Stricker');
      else bad('names wrong: ' + JSON.stringify(c));
      if (!c.some(x => x.first.length < 2)) ok('the trailing middle initial is not treated as a person');
      else bad('middle initial became a contact');
    }

    // ── 3. single owner, and non-persons ────────────────────────────────────
    console.log('\n[3] cases that must NOT invent a spouse');
    {
      const one = await contacts('CASEY OWEN J');
      if (one.length === 1 && one[0].full === 'Owen Casey') ok('single owner yields exactly one contact');
      else bad('single owner wrong: ' + JSON.stringify(one));

      const co = await contacts('CAROLINE PROPERTIES LLC');
      if (co.length === 0) ok('a company yields no personal contacts');
      else bad('invented a person from a company: ' + JSON.stringify(co));

      const bare = await contacts('KOKJOHN FAMILY TRUST');
      if (bare.length === 0) ok('surname-only trust yields none (no given name exists)');
      else bad('invented a name: ' + JSON.stringify(bare));

      const empty = await contacts('');
      if (empty.length === 0) ok('empty owner is safe');
      else bad('empty produced ' + JSON.stringify(empty));
    }

    // ── 4. no vendor / pipeline language in the rep view ────────────────────
    console.log('\n[4] proprietary stack hidden from reps');
    {
      const note = SRC.match(/function _bbTrusteeNote[\s\S]*?\n  \}/);
      const body = note ? note[0] : '';
      if (!/Skip-trace resolves this one/.test(body)) ok('"Skip-trace resolves this one" removed');
      else bad('vendor pipeline text still shown to reps');
      if (/CURRENT_ROLE === 'admin'/.test(body)) ok('internal detail is admin-gated');
      else bad('no admin gate on the internal detail');
      if (/get their real name once they answer/.test(body)) ok('replaced with something actionable at a door');
      else bad('no rep-useful replacement');

      // The card renderers must not name vendors anywhere.
      // ⚠️ Strip comments FIRST. A [^']* span crosses newlines and will happily
      // match an explanatory comment block, failing with the code perfectly correct.
      const cardArea = SRC.slice(SRC.indexOf('function _bbAskForHtml'), SRC.indexOf('window.renderBBDialerView'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      // A vendor name in a fetch() URL is not visible in the UI, and admin-gated
      // lines are allowed by design — the rule is about what a REP can read.
      const leak = cardArea.split('\n').filter(function(l) {
        if (!/\b(Tracerfy|Tracefy|Regrid|SanGIS|PermitStack)\b/i.test(l)) return false;
        if (/\.netlify\/functions\//.test(l)) return false;
        if (/CURRENT_ROLE === 'admin'/.test(l)) return false;
        return true;
      });
      if (!leak.length) ok('no vendor name readable by a rep on either card');
      else bad('vendor leaked to reps: ' + leak[0].trim().slice(0, 90));

      // And the admin-only escape hatch must actually still be gated.
      if (/CURRENT_ROLE === 'admin' && data\.regrid_key_set === false/.test(SRC)) ok('the REGRID_KEY hint stays admin-only');
      else bad('admin-only diagnostic is no longer gated');
    }

    // ── 5. phone editing, on both surfaces ──────────────────────────────────
    console.log('\n[5] editable phone');
    {
      if (/function bbPhoneRowHtml\(lead\)/.test(SRC)) ok('bbPhoneRowHtml exists');
      else bad('no phone row renderer');
      const mounts = (SRC.match(/h \+= bbPhoneRowHtml\(lead\);/g) || []).length;
      if (mounts === 2) ok('mounted on BOTH the dialer and door cards');
      else bad('mounted ' + mounts + ' times — the two surfaces will differ');

      const save = SRC.match(/window\.bbSavePhone = async function[\s\S]*?\n  \};/);
      if (save && /digits\.length !== 10/.test(save[0])) ok('refuses a malformed number instead of saving it');
      else bad('would persist a half-typed phone');
      if (save && /_bbEmailEditing = id|_bbEmailEditing = null/.test(SRC)) ok('reuses the edit guard that suppresses the GPS re-render');
      else bad('a GPS tick could wipe the field mid-type');
      if (/_bbFmtPhone/.test(SRC)) ok('formats the number for display');
      else bad('no display formatting');
    }

    // ── 6. spouse buttons wired into both cards ─────────────────────────────
    console.log('\n[6] "on title" contacts wired in');
    {
      const mounts = (SRC.match(/h \+= _bbOwnerPeopleHtml\(lead\);/g) || []).length;
      if (mounts === 2) ok('rendered on both cards');
      else bad('rendered ' + mounts + ' times');
      if (/window\.bbUseOwnerContact = async function/.test(SRC)) ok('tapping a name saves it to the lead');
      else bad('no way to adopt the name');
      const use = SRC.match(/window\.bbUseOwnerContact[\s\S]*?\n  \};/);
      if (use && /first_name: first, last_name: last/.test(use[0])) ok('writes the existing first_name/last_name — no migration');
      else bad('does not write the standard name fields');
      const people = SRC.match(/function _bbOwnerPeopleHtml[\s\S]*?\n  \}/);
      if (people && /lead\.first_name && lead\.last_name/.test(people[0])) ok('hidden once a real name is already on file');
      else bad('would nag over an already-named lead');
      if (/_bbAskForHtml\(_nm, lead\)/.test(SRC) && /_bbAskForHtml\(_doorNm, lead\)/.test(SRC)) ok('Ask-for line can name both spouses on both surfaces');
      else bad('Ask-for not passed the lead');
    }

  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
