/**
 * Training module, steps 1-3:
 *   1. rep_agreements source filter must not mistake a training cert for the agreement
 *   2. role -> module track, stacking (setter promoted to tech only owes `closing`)
 *   3. comprehension checks gate Next; wrong answers explain and retry
 *
 *   node scratchpad/test-training.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = (m) => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

// Balance-match a literal so nested braces inside strings don't truncate it.
function literal(name, open) {
  const at = SRC.indexOf('var ' + name + ' =');
  if (at < 0) return null;
  let i = SRC.indexOf(open, at), depth = 0, inStr = null;
  const close = open === '[' ? ']' : '}';
  for (; i < SRC.length; i++) {
    const ch = SRC[i], prev = SRC[i - 1];
    if (inStr) { if (ch === inStr && prev !== '\\') inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (!depth) return SRC.slice(SRC.indexOf(open, at), i + 1); }
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('about:blank');

  await page.evaluate(({ steps, tracks, modules }) => {
    window.esc = (s) => String(s == null ? '' : s);
    eval('window.BB_TOUR_STEPS = ' + steps + ';');
    eval('window.BB_TRAINING_TRACKS = ' + tracks + ';');
    eval('window.BB_TRAINING_MODULES = ' + modules + ';');
    window.bbTrainingTrackFor = (role) =>
      window.BB_TRAINING_TRACKS[String(role || '').toLowerCase()] || window.BB_TRAINING_TRACKS.setter;
    window.bbTourStepsFor = (role) => {
      const t = window.bbTrainingTrackFor(role);
      return window.BB_TOUR_STEPS.filter(st => t.indexOf(st.mod || 'foundations') >= 0);
    };
  }, { steps: literal('BB_TOUR_STEPS', '['), tracks: literal('BB_TRAINING_TRACKS', '{'), modules: literal('BB_TRAINING_MODULES', '{') });

  const stepsFor = (role) => page.evaluate(r => window.bbTourStepsFor(r).map(s => s.id + ':' + (s.mod || 'foundations')), role);

  try {
    // ── 1. the prerequisite ─────────────────────────────────────────────────
    console.log('\n[1] a training cert must never be read as the rep agreement');
    {
      const fn = SRC.match(/function _isRepAgreementRow\(r\)[\s\S]*?\n  \}/);
      if (fn) ok('_isRepAgreementRow exists');
      else bad('no predicate');
      if (fn && /if \(!src\) return true;/.test(fn[0])) ok('legacy NULL-source rows still count as agreements');
      else bad('legacy rows would be dropped');
      if (fn && /TRAINING_CERT_PREFIX\) === 0\) return false;/.test(fn[0])) ok('training certs excluded');
      else bad('a training cert would force every rep to re-sign');
      if (fn && /SUB_SHEET_ACK_SOURCE\) return false;/.test(fn[0])) ok('sub-sheet acks still excluded');
      else bad('sub-sheet ack regression');
      if (/\.find\(_isRepAgreementRow\)/.test(SRC)) ok('the login gate uses it');
      else bad('login gate still uses the old inline check');
      if (!/\.neq\('source'/.test(SRC)) ok('no server-side neq (NULL <> x is NULL)');
      else bad('server-side neq would drop legacy rows');
    }

    // ── 2. tracks stack ─────────────────────────────────────────────────────
    console.log('\n[2] role → modules');
    {
      const setter = await stepsFor('setter');
      const tech   = await stepsFor('tech');

      if (setter.length && tech.length) ok('both roles resolve to real step lists');
      else bad('a role resolved to nothing');

      const setterMods = new Set(setter.map(s => s.split(':')[1]));
      if (!setterMods.has('closing')) ok('a setter is never shown closing content');
      else bad('setter sees closing steps');

      const techMods = new Set(tech.map(s => s.split(':')[1]));
      if (techMods.has('foundations') && techMods.has('dialing')) ok('a tech gets the setter content too');
      else bad('tech track is missing shared modules');

      // Promotion: everything a setter did counts toward the tech track.
      const setterSet = new Set(setter);
      const outstanding = tech.filter(s => !setterSet.has(s));
      if (outstanding.every(s => s.endsWith(':closing'))) ok('promotion leaves ONLY closing outstanding');
      else bad('promotion would re-teach: ' + outstanding.slice(0, 4).join(', '));
      // ⚠ Until module D is authored this comparison is over an empty set and cannot
      // fail. Say so out loud rather than letting a green tick imply coverage.
      if (!outstanding.length) console.log('    \x1b[33m!\x1b[0m  (vacuous for now — no closing steps authored yet)');

      // The TRACK must still differ even while the content is empty, or promotion has
      // nothing to hang off later.
      const tt = await page.evaluate(() => window.bbTrainingTrackFor('tech'));
      const st2 = await page.evaluate(() => window.bbTrainingTrackFor('setter'));
      if (tt.includes('closing') && !st2.includes('closing')) ok('tech track declares closing, setter track does not');
      else bad('tracks do not differ — promotion could never add anything');

      // Which modules actually have content today.
      const byMod = await page.evaluate(() => {
        const m = {}; window.BB_TOUR_STEPS.forEach(s => { m[s.mod] = (m[s.mod] || 0) + 1; }); return m;
      });
      console.log('    authored steps per module: ' + JSON.stringify(byMod));

      const unknown = await stepsFor('');
      if (unknown.length === setter.length) ok('an unknown role falls back to the setter track (more training, not less)');
      else bad('unknown role got a different amount of training');

      const all = await page.evaluate(() => window.BB_TOUR_STEPS.every(s => !!s.mod));
      if (all) ok('every authored step carries a module');
      else bad('a step has no module and would leak into every track');
    }

    // ── 3. the checks ───────────────────────────────────────────────────────
    console.log('\n[3] comprehension checks');
    {
      const checked = await page.evaluate(() => window.BB_TOUR_STEPS.filter(s => s.check).map(s => s.id));
      if (checked.length >= 8) ok(checked.length + ' steps carry a question');
      else bad('only ' + checked.length + ' questions');

      const shape = await page.evaluate(() => window.BB_TOUR_STEPS.filter(s => s.check).every(s =>
        s.check.q && Array.isArray(s.check.options) && s.check.options.length >= 2 &&
        typeof s.check.answer === 'number' && s.check.options[s.check.answer] !== undefined && s.check.why));
      if (shape) ok('every question has options, a valid answer index and a why');
      else bad('a question is malformed');

      // The answer must never be guessable from position alone.
      const idxs = await page.evaluate(() => window.BB_TOUR_STEPS.filter(s => s.check).map(s => s.check.answer));
      if (new Set(idxs).size > 1) ok('correct answers are not all in the same position');
      else bad('every answer is option ' + idxs[0] + ' — guessable');

      if (/if \(cur && cur\.check && !_bbTourAnswered\[cur\.id\]\) return;/.test(SRC)) ok('Next is blocked until answered correctly');
      else bad('a rep can skip past an unanswered question');
      if (/Answer to continue/.test(SRC)) ok('the button says why it is disabled');
      else bad('silently disabled button');

      const ans = SRC.match(/window\.bbTourAnswer = function\(i\)[\s\S]*?\n  \};/);
      if (ans && /_bbTourTried\[st\.id\] === 1\) _bbTourFirstTry\[st\.id\] = true;/.test(ans[0])) ok('first-try correctness is recorded');
      else bad('no first-try scoring');
      if (ans && /if \(i === st\.check\.answer\)/.test(ans[0])) ok('only the right answer unlocks');
      else bad('any answer unlocks');
      if (ans && !/_bbTourAnswered\[st\.id\] = true;\s*\}\s*_bbTourRender/.test(ans[0].replace(/if \(i === st\.check\.answer\)[\s\S]*?\n/, ''))) ok('a wrong answer does not mark it answered');
      else bad('wrong answers still unlock');

      const chk = SRC.match(/function _bbTourCheckHtml\(st\)[\s\S]*?\n  \}/);
      if (chk && /Not quite &mdash; ' \+ esc\(c\.why\)/.test(chk[0])) ok('a wrong answer explains why before the retry');
      else bad('no explanation on a wrong answer');

      // Content rules from CLAUDE.md that these questions must not contradict.
      const all = JSON.stringify(await page.evaluate(() => window.BB_TOUR_STEPS.filter(s => s.check).map(s => s.check)));
      if (/no no-show fee|There is no no-show fee/i.test(all)) ok('teaches that there is NO no-show fee');
      else bad('the no-show-fee correction is not covered');
      if (/never name a programme|never name a dollar/i.test(all)) ok('teaches allude-but-never-specify on incentives');
      else bad('the incentive rule is not covered');
      if (/date AND the two-hour/i.test(all)) ok('teaches confirming date + window out loud');
      else bad('the booking confirmation rule is not covered');
    }


    // ── 4-6. certification, gate, certificate ───────────────────────────────
    console.log('\n[4] per-module certification');
    {
      // Modules with no authored content must be trivially satisfied, or the hard gate
      // locks the whole company out of Doors and Dialing forever.
      const cert = await page.evaluate(() => {
        window.BB_TOUR_STEPS = window.BB_TOUR_STEPS;
        window.TRAINING_VERSION = 't1';
        window.TRAINING_CERT_PREFIX = 'training_cert:';
        window._bbCerts = {};
        window.bbModuleHasContent = (mod) => window.BB_TOUR_STEPS.some(st => (st.mod || 'foundations') === mod);
        window.bbModuleCertified = (mod) => {
          if (!window.bbModuleHasContent(mod)) return true;
          const c = window._bbCerts[mod];
          return !!(c && c.version === window.TRAINING_VERSION);
        };
        window.bbModulesOutstanding = (role) =>
          window.bbTrainingTrackFor(role).filter(m => window.bbModuleHasContent(m) && !window.bbModuleCertified(m));
        window.bbTrainingComplete = (role) => window.bbModulesOutstanding(role).length === 0;
        const before = window.bbModulesOutstanding('setter');
        window._bbCerts = { foundations: { version: 't1' }, dialing: { version: 't1' } };
        const after = window.bbModulesOutstanding('setter');
        window._bbCerts = { foundations: { version: 't0' }, dialing: { version: 't1' } };
        const stale = window.bbModulesOutstanding('setter');
        return { before, after, stale, doorsEmpty: !window.bbModuleHasContent('doors') };
      });
      if (cert.doorsEmpty) ok('doors has no authored content (as expected today)');
      else bad('doors unexpectedly has content — recheck this assertion');
      // ⚠ These helpers are RE-DEFINED above for isolation, so this only proves the
      // shape of the rule, not the shipped code. The behavioural gate — that a rep who
      // finished everything available is not locked out by an empty module — lives in
      // scratchpad/test-training-boot.js, which drives the real portal.
      if (!cert.before.includes('doors')) ok('an empty module never blocks (shape only — see test-training-boot.js)');
      else bad('empty module blocks the gate: the whole company would be locked out');
      if (/bbModuleHasContent\(m\) && !bbModuleCertified\(m\)/.test(SRC)) ok('shipped bbModulesOutstanding filters content-less modules');
      else bad('the shipped filter would lock reps out on an unwritten module');
      if (cert.before.length === 2) ok('an untrained setter owes foundations + dialing');
      else bad('outstanding wrong: ' + JSON.stringify(cert.before));
      if (cert.after.length === 0) ok('certifying both clears the track');
      else bad('still outstanding after certification: ' + JSON.stringify(cert.after));
      if (cert.stale.includes('foundations')) ok('a stale TRAINING_VERSION re-opens that module');
      else bad('version bump does not force re-certification');

      const src = SRC;
      if (/source: TRAINING_CERT_PREFIX \+ m/.test(src)) ok('cert rows use the training_cert: prefix');
      else bad('cert row source wrong');
      if (/\.limit\(50\)/.test(src)) ok('the agreement fetch window was widened for cert rows');
      else bad('limit(10) would push the real agreement out of the window');
      if (/bbSetCertsFromRows\(agrRes\.data\)/.test(src)) ok('certs derive from the same login fetch');
      else bad('certs not loaded');
      if (/training_completed: true/.test(src)) ok('roll-up flag is earned, not ticked by hand');
      else bad('team_members.training_completed never set');
    }

    console.log('\n[5] the hard gate');
    {
      const gate = SRC.match(/window\.salesSetView = function\(v\)[\s\S]*?\n    \};/);
      if (gate && /v === 'canvass' \|\| v === 'dialer'/.test(gate[0])) ok('gate covers both Doors and Dialing');
      else bad('gate misses a surface');
      if (gate && /CURRENT_ROLE !== 'admin'/.test(gate[0])) ok('admin is never gated');
      else bad('admin would be locked out of their own portal');
      if (gate && /salesView = 'training'/.test(gate[0])) ok('an uncertified rep is routed to training');
      else bad('no redirect');
      if (gate && /_bbGateNotice = v/.test(gate[0])) ok('records which surface they wanted');
      else bad('rep would land on training with no explanation');
      if (/is locked<\/div>/.test(SRC)) ok('training tab explains the lock');
      else bad('no gate notice rendered');
      if (/&#128274; '\+label\+'/.test(SRC)) ok('the pills render as locked rather than silently bouncing');
      else bad('pills give no hint');
    }

    console.log('\n[6] the certificate');
    {
      if (/function _bbTourCertify\(mods, pid, pname\)/.test(SRC)) ok('certificate screen exists');
      else bad('no certificate');
      const c = SRC.match(/function _bbTourCertify[\s\S]*?\n  \}/);
      if (c && /bbTourScore\(\)/.test(c[0])) ok('shows the first-try score');
      else bad('no score on the certificate');
      if (c && /Perfect run|Passed clean/.test(c[0])) ok('tiers the result (gamified)');
      else bad('no tiering');
      if (c && /Modules earned/.test(c[0])) ok('lists the modules earned');
      else bad('modules not shown');
      if (c && /window\.print\(\)/.test(c[0])) ok('printable');
      else bad('no print control');
      if (/body\.bb-cert-open > \*:not\(#bbTourHost\)/.test(SRC)) ok('print CSS isolates the certificate');
      else bad('printing would dump the whole portal');
      if (c && /Promise\.resolve\(bbCertifyModules/.test(c[0])) ok('the DB write never blocks the screen');
      else bad('a failed write would cost the rep their certificate');
    }

  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
