/**
 * "Where are the AI transcriptions being logged? I don't see anything here."
 *
 * They were always saved (customers.notes + lead_activity). The Doors card rendered
 * only the LAST note, truncated to 60 chars — so a multi-sentence AI summary showed as
 * a fragment, and any later note hid it completely. Dialing has had a real 4-entry feed
 * the whole time.
 *
 *   node scratchpad/test-notes-feed.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

const srv = http.createServer((_, res) => { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<!doctype html><title>t</title>'); }).listen(8149);

const AI_NOTE = '🎙 Homeowner said their SunPower system stopped reporting about eight months ago and nobody has been out since. Wife handles the bills and is home after 5. Interested in an evaluation but wants to talk it over first.';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  await page.goto('http://localhost:8149/');

  // Lift the real renderers: _parseNotes, bbDialFeedHtml and the new shared feed.
  const parseA = SRC.indexOf('  function _parseNotes(raw) {');
  const parseB = SRC.indexOf('  function _appendNote(', parseA);
  const feedA  = SRC.indexOf('  function bbDialFeedHtml(lead) {');
  const feedB  = SRC.indexOf('\n  }', feedA) + 4;
  const cvA    = SRC.indexOf('  window._cvFeedOpen = window._cvFeedOpen || {};');
  const cvB    = SRC.indexOf('  window.adminCanvassKnock = async function(id, knockStatus) {');

  await page.evaluate(({ p, f, c }) => {
    window.esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    window.CURRENT_ROLE = 'setter';
    eval(p); eval(f); eval(c);
    window.__parse = _parseNotes;
  }, { p: SRC.slice(parseA, parseB), f: SRC.slice(feedA, feedB), c: SRC.slice(cvA, cvB) });

  const notes = JSON.stringify([
    { ts: '2026-08-12T18:00:00Z', by: '🚪 Knock — Dennis Larsen', text: 'Not Home: Gated.' },
    { ts: '2026-08-12T19:00:00Z', by: '🚪 Knock — Dennis Larsen', text: AI_NOTE },
    { ts: '2026-08-12T20:00:00Z', by: '🚪 Knock — Dennis Larsen', text: 'Warm' }
  ]);
  const render = (open) => page.evaluate(({ notes, open }) => {
    window._cvFeedOpen = {};
    if (open) window._cvFeedOpen['L1'] = true;
    return window._cvNotesFeedHtml({ id: 'L1', notes: notes });
  }, { notes, open });

  try {
    console.log('\n[1] collapsed — the default a rep sees at a door');
    {
      const h = await render(false);
      if (/Notes \(3\)/.test(h)) ok('shows how many notes exist (3)');
      else bad('no count: ' + h.slice(0, 160));
      const collapsedText = await page.evaluate(html => { const d = document.createElement('div'); d.innerHTML = html; return d.innerText; }, h);
      if (/[🎙🎤]\s*1/.test(collapsedText)) ok('badges that 1 of them is an AI note');
      else bad('no AI badge — a rep cannot tell a transcript is there: ' + collapsedText.slice(0, 120));
      if (/Warm/.test(h)) ok('still previews the newest note');
      else bad('no preview');
    }

    console.log('\n[2] expanded — the whole point');
    {
      const h = await render(true);
      const text = await page.evaluate(html => { const d = document.createElement('div'); d.innerHTML = html; return d.innerText; }, h);
      if (/stopped reporting about eight months ago/.test(text)) ok('the AI summary is readable in full');
      else bad('AI summary still not shown');
      if (/nobody has been out since/.test(text) && /home after 5/.test(text)) ok('nothing is truncated mid-sentence');
      else bad('summary is cut off: ' + text.slice(0, 200));
      if (/Not Home: Gated/.test(text)) ok('older notes are visible too, not just the newest');
      else bad('only the latest note renders');
    }

    console.log('\n[3] the old behaviour is genuinely gone');
    {
      const h = await render(false);
      const preview = (h.match(/font-style:italic[^>]*>([\s\S]*?)<\/div>/) || [, ''])[1];
      if (preview.length > 60 || !/…/.test(preview)) ok('the collapsed preview is no longer capped at 60 chars');
      else bad('still truncating hard');
      if ((SRC.match(/text\.slice\(0,60\)|text\.slice\(0,80\)/g) || []).length === 0) ok('no 60/80-char note truncation left on any card');
      else bad('a card still truncates notes to a fragment');
    }

    console.log('\n[4] empty and edge cases');
    {
      const h = await page.evaluate(() => window._cvNotesFeedHtml({ id: 'L2', notes: null }));
      if (/No notes yet/.test(h)) ok('a fresh door says so rather than rendering nothing');
      else bad('empty state missing');
      if (!/\(0\)/.test(h)) ok('no "(0)" count on an empty feed');
      else bad('renders a zero count');
      const legacy = await page.evaluate(() => window._cvNotesFeedHtml({ id: 'L3', notes: 'plain text note from before the JSON feed' }));
      if (/plain text note/.test(legacy)) ok('legacy plain-text notes still render');
      else bad('legacy notes lost');
    }

    console.log('\n[5] wiring');
    {
      const mounts = (SRC.match(/_cvNotesFeedHtml\(lead\)/g) || []).length;
      if (mounts === 3) ok('mounted on all three door cards (rep route, admin canvass, admin Black Box)');
      else bad(mounts + ' mounts — expected 3');
      if (/window\._cvFeedOpen\[id\] = !window\._cvFeedOpen\[id\]/.test(SRC)) ok('open state lives outside the DOM, so a GPS tick cannot slam it shut');
      else bad('state kept in the DOM — the documented re-render trap');
      if (/h \+= '<div style="margin-top:4px;">' \+ bbDialFeedHtml\(lead\) \+ '<\/div>'/.test(SRC)) ok('expands into the SAME feed renderer Dialing uses');
      else bad('a second feed renderer was introduced');
    }

    console.log('\n[6] the save path was never the problem — confirm it still holds');
    {
      if (/await bbLogActivity\(leadId, 'door_knock', null, _aiConsentTag\(\) \+ noteText\)/.test(SRC))
        ok('Stop & Summarize still writes the note to the lead');
      else bad('the AI stop no longer saves');
      if (/var _aiNote = await _aiNoteFromHarvest\(_aiH, 'door_knock', id/.test(SRC))
        ok('dispositioning still folds a live recording into the saved note');
      else bad('harvest-on-disposition lost');
    }

  } finally {
    await browser.close();
    srv.close();
  }

  console.log('\n' + '─'.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
