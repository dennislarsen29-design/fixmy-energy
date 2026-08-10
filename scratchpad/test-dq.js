/**
 * DQ'd disposition (Doors + Dialing) + commercial scan.
 *
 * The report: commercial buildings appearing in the Black Box door route, and no way
 * to permanently remove a property that doesn't qualify.
 *
 *   node scratchpad/test-dq.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORTAL = path.join(__dirname, '..', 'portal.html');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = (m) => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

const SRC = fs.readFileSync(PORTAL, 'utf8');

// Pull a named literal out of portal.html by balancing brackets — a regex can't do this
// reliably when the literal contains strings full of braces and brackets (which these do,
// being full of inline HTML).
function literal(name) {
  const at = SRC.indexOf('var ' + name + ' =');
  if (at < 0) return null;
  const start = SRC.search.call(SRC, /./) , open = SRC.indexOf('[', at) >= 0 && (SRC.indexOf('[', at) < SRC.indexOf('{', at) || SRC.indexOf('{', at) < 0) ? '[' : '{';
  const close = open === '[' ? ']' : '}';
  let i = SRC.indexOf(open, at), depth = 0, inStr = null;
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

  try {
    // ── 1. DQ exists on BOTH surfaces (the standing rule) ────────────────────
    console.log('\n[1] DQ present on Doors and Dialing');
    {
      const got = {
        CV_DOOR_OUTCOMES: literal('CV_DOOR_OUTCOMES'),
        BB_DIAL_OUTCOMES: literal('BB_DIAL_OUTCOMES'),
        BB_DIAL_WORKED:   literal('BB_DIAL_WORKED'),
        CV_DQ_REASONS:    literal('CV_DQ_REASONS')
      };
      for (const k in got) if (!got[k]) bad('could not extract ' + k);
      const doors = await page.evaluate(s => eval('(' + s + ')').map(o => o.key), got.CV_DOOR_OUTCOMES);
      const dial  = await page.evaluate(s => Object.keys(eval('(' + s + ')')), got.BB_DIAL_OUTCOMES);
      const worked= await page.evaluate(s => Object.keys(eval('(' + s + ')')), got.BB_DIAL_WORKED);

      if (doors.includes('disqualified')) ok('Doors has a disqualified outcome');
      else bad('Doors missing DQ — got ' + doors.join(','));
      if (dial.includes('disqualified')) ok('Dialing has a disqualified outcome');
      else bad('Dialing missing DQ — got ' + dial.join(','));
      if (worked.includes('disqualified')) ok('DQ moves a dialer lead to Worked');
      else bad('DQ not in BB_DIAL_WORKED');

      const reasons = await page.evaluate(s => eval('(' + s + ')').map(r => r.key), got.CV_DQ_REASONS);
      ['commercial', 'no_solar', 'multi_unit', 'mobile_home'].forEach(r => {
        if (reasons.includes(r)) ok('reason "' + r + '" offered');
        else bad('missing reason ' + r);
      });
    }

    // ── 2. DQ archives, and archiving is what removes it from both ───────────
    console.log('\n[2] DQ writes archived, never dnc');
    {
      const knock = SRC.match(/window\.canvassKnock = async function[\s\S]{0,1400}?bbLogActivity/);
      const body = knock ? knock[0] : '';
      if (/knockStatus === 'disqualified'\) upd\.archived = true/.test(body)) ok('door DQ sets archived');
      else bad('door DQ does not archive');
      if (!/upd\.dnc/.test(body)) ok('door DQ never sets dnc (rep must not kill phone eligibility)');
      else bad('door DQ touches dnc');

      const dial = SRC.match(/if \(outcome === 'disqualified'\) updates\.archived = true;/);
      if (dial) ok('dialer DQ sets archived');
      else bad('dialer DQ does not archive');
      if (!/outcome === 'disqualified'\) updates\.dnc/.test(SRC)) ok('dialer DQ never sets dnc');
      else bad('dialer DQ sets dnc');
      if (!/knockStatus === 'disqualified'\) upd\.black_box = false/.test(SRC)) ok('DQ does not use black_box:false (that means activated)');
      else bad('DQ misuses black_box');
    }

    // ── 3. both routes now exclude archived ─────────────────────────────────
    console.log('\n[3] archived is filtered out of the routes');
    {
      // ⚠️ Scope the slice to the QUERY, not the whole function — an under-sized window
      // makes this fail with the code perfectly correct (it did, at 900 chars).
      const box = SRC.match(/async function _canvassFetchBox[\s\S]*?\.limit\(1000\);/);
      if (!box) bad('could not locate the _canvassFetchBox query');
      else if (/archived\.is\.null,archived\.eq\.false/.test(box[0])) ok('rep GPS route excludes archived');
      else bad('rep route still serves archived doors');

      const fb = SRC.match(/result = await client\.from\('customers'\)\.select\(SEL\)[\s\S]{0,400}?limit\(80\);/);
      if (fb && /archived\.is\.null,archived\.eq\.false/.test(fb[0])) ok('rep no-GPS fallback excludes archived');
      else bad('no-GPS fallback still serves archived doors');

      if (/or=\(archived\.is\.null,archived\.eq\.false\)&select=' \+ adminSEL/.test(SRC)) ok('admin canvass excludes archived');
      else bad('admin canvass still serves archived doors');

      // The dialer already had this — assert it didn't regress.
      if (/or\(dnc\.is\.null,dnc\.eq\.false\),or\(archived\.is\.null,archived\.eq\.false\)/.test(SRC)) ok('dialer queue still excludes archived');
      else bad('dialer lost its archived filter');
    }

    // ── 4. no silent write — DQ demands a reason ────────────────────────────
    console.log('\n[4] DQ requires a reason before writing');
    {
      if (/o\.key === 'disqualified' \? 'canvassDisqualify/.test(SRC)) ok('DQ button opens the picker, does not commit');
      else bad('DQ button commits straight away');
      if (/window\.canvassDisqualify = function\(id\) \{ _cvDqFor = id/.test(SRC)) ok('canvassDisqualify only sets state');
      else bad('canvassDisqualify writes immediately');
      if (/_cvDqFor === lead\.id\) h \+= _cvDqPickerHtml/.test(SRC)) ok('picker renders FROM state (survives a GPS re-render)');
      else bad('picker not state-driven — a GPS tick would wipe it');
      if (/canvassSaveDq = async function[\s\S]{0,300}canvassKnock\(id, 'disqualified', \{ dqReason/.test(SRC)) ok('reason is passed through to the write');
      else bad('reason not carried into canvassKnock');
      if (/Disqualified — ' \+ \(CV_DQ_LABELS/.test(SRC)) ok('reason lands in the shared note feed');
      else bad('reason never recorded');
    }

    // ── 5. the heuristic itself ─────────────────────────────────────────────
    console.log('\n[5] commercial signal detection');
    {
      const fnSrc = SRC.match(/var _BB_COMM_STRONG = \[[\s\S]*?\n  \}\n\n  var _bbCommRunning/);
      if (!fnSrc) { bad('could not extract _bbCommercialSignals'); }
      else {
        await page.evaluate(s => { eval(s.replace(/\n  var _bbCommRunning[\s\S]*$/, '')); window.__sig = _bbCommercialSignals; }, fnSrc[0]);
        const t = async (lead) => page.evaluate(l => { const r = window.__sig(l); return r ? { strong: r.strong, reason: r.reason, why: r.why.join('|') } : null; }, lead);

        const commercial = await t({ address: '17210 Bernardo Center Dr, San Diego, CA', title_owner: 'CAROLINE PROPERTIES LLC' });
        if (commercial) ok('the reported parcel is flagged');
        else bad('the reported commercial parcel was NOT flagged');
        if (commercial && !commercial.strong) ok('…but only as a soft match (unchecked by default)');
        else if (commercial) bad('flagged as strong on an investor-style name alone');

        const plaza = await t({ address: '100 Main St', title_owner: 'WESTFIELD PLAZA ASSOCIATES' });
        if (plaza && plaza.strong) ok('"PLAZA" is a strong commercial signal');
        else bad('plaza not flagged strongly');

        const hoa = await t({ address: '5 Oak Ct', title_owner: 'OAK RIDGE HOMEOWNERS ASSOCIATION' });
        if (hoa && hoa.strong && hoa.reason === 'multi_unit') ok('HOA common area flagged as multi_unit');
        else bad('HOA not handled: ' + JSON.stringify(hoa));

        const suite = await t({ address: '900 Commerce Way STE 210, San Diego, CA 92126', title_owner: null });
        if (suite && suite.strong) ok('a suite number is a strong signal');
        else bad('suite number missed');

        const mobile = await t({ address: '12 Palm Way', title_owner: 'SMITH JOHN', apn: '7712345600' });
        if (mobile && mobile.strong && mobile.reason === 'mobile_home') ok('APN 77x detected as mobile home');
        else bad('mobile-home APN missed: ' + JSON.stringify(mobile));

        // ⚠️ The false-positive guard that matters most: ~17% of doors are landlord-owned
        // and landlords hold homes in LLCs and trusts.
        const llc = await t({ address: '8838 Greenview Pl, Spring Valley, CA 91977', title_owner: 'CASEY OWEN J & TRISTANA N LLC' });
        if (!llc) ok('a bare LLC-owned HOME is not flagged');
        else bad('bare LLC flagged — would hide real landlord doors: ' + JSON.stringify(llc));

        const trust = await t({ address: '17 Elm St', title_owner: 'KOKJOHN FAMILY TRUST 05-04-15' });
        if (!trust) ok('a family trust is not flagged');
        else bad('trust flagged — would hide real homeowners');

        const plain = await t({ address: '4521 Cardinal Dr, San Diego, CA 92123', title_owner: 'STRICKER MICHAEL&AMIE F' });
        if (!plain) ok('an ordinary home is not flagged');
        else bad('false positive on a plain home');
      }
    }

    // ── 6. the scan is confirm-before-change ────────────────────────────────
    console.log('\n[6] scan previews before it changes anything');
    {
      if (/bbApplyCommercialDq\(\)/.test(SRC) && /_bbRenderCommercialPreview/.test(SRC)) ok('scan renders a preview with a separate apply step');
      else bad('scan applies without a preview');
      if (/class="bbCommChk"[^>]*'\s*\+\s*\(x\.strong \? ' checked' : ''\)/.test(SRC)) ok('strong matches pre-checked, soft ones not');
      else bad('checkbox defaults not tied to signal strength');
      if (/\.or\('archived\.is\.null,archived\.eq\.false'\)[\s\S]{0,120}range\(off, off \+ 999\)/.test(SRC)) ok('scan skips already-archived leads');
      else bad('scan re-scans archived rows');
      if (/_bbEnrichOverlayClose\(\)/.test(SRC) && !/_bbCloseEnrichOverlay/.test(SRC)) ok('overlay close calls the function that exists');
      else bad('dead overlay-close handler');
    }

  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
