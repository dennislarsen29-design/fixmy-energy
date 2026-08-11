/**
 * AI note-taker durability.
 *
 * Reported: tap AI Notes → have a real conversation → tap a disposition → the notes
 * are gone. Root cause: _bbAiStop()/_cvAiStop() were only reachable from the
 * "Stop & Summarize" button, so a rep who dispositioned instead left the transcript
 * in _bbAiFinal until the NEXT recording reset it to ''.
 *
 *   node scratchpad/test-ainote-save.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = (m) => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

// Lift the AI helper block out of portal.html and run it against stubs, so the real
// harvest/summarize/fallback logic is exercised rather than a reimplementation.
function helperBlock() {
  const start = SRC.indexOf('  var _bbAiRec = null, _bbAiActive = false');
  const end = SRC.indexOf('  function _bbAiSetBtn(');
  const tail = SRC.indexOf('  async function _aiNoteFromHarvest(');
  const tailEnd = SRC.indexOf('\n  }', SRC.indexOf("return note;", tail)) + 4;
  return SRC.slice(start, end) + SRC.slice(SRC.indexOf('  var AI_SUMMARY_WAIT_MS'), tailEnd);
}

async function boot(page, { summaryOk = true, slow = false } = {}) {
  await page.goto('about:blank');
  await page.evaluate(({ block, summaryOk, slow }) => {
    window.__logged = [];
    window.bbLogActivity = async (id, ch, outcome, note) => { window.__logged.push({ id, ch, outcome, note }); };
    window._aiConsentTag = () => '[consent] ';
    window._aiNoteFailText = () => 'AI summary unavailable right now.';
    window._bbAiSetBtn = () => {};
    window._cvAiSetBtn = () => {};
    window.BB_DIAL_OUTCOMES = {};
    window.fetch = async () => {
      if (slow) await new Promise(r => setTimeout(r, 12000));   // exceeds the wait budget
      return { json: async () => (summaryOk
        ? { note: 'SUMMARY: homeowner interested, SunPower system, wants a callback.' }
        : { error: 'Your credit balance is too low', detail: 'billing' }) };
    };
    // The block is written against file-scope vars; eval it into a function scope and
    // hoist the pieces we exercise onto window.
    eval(block + `
      window.__h = { get bbActive(){return _bbAiActive;}, set bbActive(v){_bbAiActive=v;},
                     get bbFinal(){return _bbAiFinal;},  set bbFinal(v){_bbAiFinal=v;},
                     get bbLead(){return _bbAiLeadId;},  set bbLead(v){_bbAiLeadId=v;},
                     get cvActive(){return _cvAiActive;},set cvActive(v){_cvAiActive=v;},
                     get cvFinal(){return _cvAiFinal;},  set cvFinal(v){_cvAiFinal=v;},
                     get cvLead(){return _cvAiLeadId;},  set cvLead(v){_cvAiLeadId=v;},
                     harvestBb: _bbAiHarvest, harvestCv: _cvAiHarvest,
                     noteFrom: _aiNoteFromHarvest };
    `);
  }, { block: helperBlock(), summaryOk, slow });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();

  try {
    // ── 1. the reported flow ────────────────────────────────────────────────
    console.log('\n[1] record → disposition without pressing Stop');
    {
      await boot(page);
      const r = await page.evaluate(async () => {
        window.__h.bbActive = true;
        window.__h.bbFinal = 'Hi is this John yes it is we installed with SunPower back in 2019 and nobody answers the phone anymore ';
        window.__h.bbLead = 'lead-A';
        const h = window.__h.harvestBb();
        const note = await window.__h.noteFrom(h, 'dialer', 'lead-A', null);
        return { harvested: !!h, note, stillActive: window.__h.bbActive, leftover: window.__h.bbFinal };
      });
      if (r.harvested) ok('the live recording is harvested at disposition time');
      else bad('nothing harvested — the transcript would be lost');
      if (/SUMMARY:/.test(r.note)) ok('summary folded into the disposition note');
      else bad('no note produced: ' + r.note);
      if (!r.stillActive) ok('recognition is stopped');
      else bad('recognition left running');
      if (r.leftover === '') ok('state cleared so the next lead cannot inherit it');
      else bad('transcript left in state: ' + r.leftover);
    }

    // ── 2. the silent-overwrite that made it unrecoverable ──────────────────
    console.log('\n[2] a second recording cannot wipe an unsaved first');
    {
      await boot(page);
      const r = await page.evaluate(async () => {
        window.__h.bbActive = true; window.__h.bbFinal = 'first call about a broken inverter and no service '; window.__h.bbLead = 'lead-A';
        const h1 = window.__h.harvestBb();
        const n1 = await window.__h.noteFrom(h1, 'dialer', 'lead-A', null);
        // rep moves on and records lead B
        window.__h.bbActive = true; window.__h.bbFinal = 'second call entirely different homeowner '; window.__h.bbLead = 'lead-B';
        const h2 = window.__h.harvestBb();
        const n2 = await window.__h.noteFrom(h2, 'dialer', 'lead-B', null);
        return { n1, n2, h1: !!h1, h2: !!h2 };
      });
      // The note is RETURNED so the caller writes it atomically with the outcome;
      // bbLogActivity is only the cross-lead rescue path.
      if (r.n1) ok('the first call produced a note before the second started');
      else bad('first call lost');
      if (r.n2) ok('the second call produced its own note');
      else bad('second call lost');
      if (r.h1 && r.h2) ok('each recording harvested independently');
      else bad('a harvest returned nothing');
    }

    // ── 3. AI down → raw transcript still saved ─────────────────────────────
    console.log('\n[3] summarizer failing must not lose the words');
    {
      await boot(page, { summaryOk: false });
      const note = await page.evaluate(async () => {
        window.__h.bbActive = true;
        window.__h.bbFinal = 'homeowner said their true up was four thousand dollars in March and they are furious ';
        window.__h.bbLead = 'lead-C';
        const h = window.__h.harvestBb();
        return await window.__h.noteFrom(h, 'dialer', 'lead-C', null);
      });
      if (/true up was four thousand/.test(note)) ok('raw transcript kept when the AI fails');
      else bad('words lost on AI failure: ' + note);
      if (/AI summary unavailable/i.test(note)) ok('note says why it is unsummarized');
      else bad('no explanation in the note');
      if (!/credit balance/i.test(note)) ok('no vendor billing text in the rep-facing note');
      else bad('billing text leaked into the note');
    }

    // ── 4. slow API must not block the rep ──────────────────────────────────
    console.log('\n[4] a hung summarizer falls back inside the budget');
    {
      await boot(page, { slow: true });
      const t0 = Date.now();
      const note = await page.evaluate(async () => {
        window.__h.bbActive = true;
        window.__h.bbFinal = 'this call must still be saved even though the summarizer never answers at all ';
        window.__h.bbLead = 'lead-D';
        const h = window.__h.harvestBb();
        return await window.__h.noteFrom(h, 'dialer', 'lead-D', null);
      });
      const ms = Date.now() - t0;
      if (ms < 11000) ok('gave up after ~' + Math.round(ms / 1000) + 's rather than hanging');
      else bad('blocked the rep for ' + ms + 'ms');
      if (/must still be saved/.test(note)) ok('raw transcript saved on timeout');
      else bad('lost on timeout: ' + note);
    }

    // ── 5. cross-lead safety ────────────────────────────────────────────────
    console.log('\n[5] recording belonging to another lead');
    {
      await boot(page);
      const r = await page.evaluate(async () => {
        window.__h.bbActive = true;
        window.__h.bbFinal = 'this conversation was recorded on the previous customer entirely ';
        window.__h.bbLead = 'lead-A';
        const h = window.__h.harvestBb();
        // queue moved on — rep is now dispositioning lead-B
        const note = await window.__h.noteFrom(h, 'dialer', 'lead-B', null);
        return { note, logged: window.__logged };
      });
      if (r.note === '') ok('not attached to the wrong customer');
      else bad('mislabelled onto lead-B: ' + r.note);
      if (r.logged.length === 1 && r.logged[0].id === 'lead-A') ok('written to the lead it was recorded on instead');
      else bad('not recovered to lead-A: ' + JSON.stringify(r.logged));
    }

    // ── 6. wiring in the real disposition paths ─────────────────────────────
    console.log('\n[6] both disposition paths call the harvest');
    {
      const dial = SRC.match(/async function bbDialCommit[\s\S]*?var updates = \{ dial_status/);
      if (dial && /_bbAiHarvest\(\)/.test(dial[0])) ok('bbDialCommit harvests before writing');
      else bad('bbDialCommit does not harvest');
      if (dial && /_aiNoteFromHarvest\(_aiH, 'dialer', lead\.id/.test(dial[0])) ok('dialer folds the AI note into the disposition');
      else bad('dialer note not folded in');

      const knock = SRC.match(/window\.canvassKnock = async function[\s\S]*?bbLogActivity\(id, 'door_knock'/);
      if (knock && /_cvAiHarvest\(\)/.test(knock[0])) ok('canvassKnock harvests before writing');
      else bad('canvassKnock does not harvest');
      if (knock && /_cvNoteDraft\[id\] \|\| ''/.test(knock[0])) ok('an unsaved typed door note is rescued too');
      else bad('typed door draft still lost on disposition');

      if (/saved automatically when you disposition/.test(SRC)) ok('dialer tells the rep it saves itself');
      else bad('no reassurance text on the dialer');
      if (/saved automatically when you pick an outcome/.test(SRC)) ok('doors tells the rep it saves itself');
      else bad('no reassurance text on doors');

      // One save routine, not two — the divergence that caused this bug.
      // ⚠️ Count real CALLS — a bare /dialer-notes/ search also hits prose comments and
      // reported 3 when there is exactly one call site.
      const stops = (SRC.match(/fetch\('\/\.netlify\/functions\/dialer-notes'/g) || []).length;
      if (stops === 1) ok('only ONE place calls the summarize endpoint');
      else bad('summarize endpoint called from ' + stops + ' places — they will drift');
    }

  } finally {
    await browser.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
