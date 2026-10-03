/* Signature capture — ONE shared "sign here" component (2026-10-03).
 *
 * Extracted from portal.html (the document-signing screens) so the Sign & Pay page uses the
 * IDENTICAL experience: tap the signature box -> modal with two ways to sign —
 *   "Type & Choose Style"  (type your name, pick one of 4 cursive styles)
 *   "Draw"                 (finger / mouse / pen on a signature pad)
 * Result shape (also what gets stored and validated server-side):
 *   { type:'typed', text, fontFamily }   or   { type:'drawn', dataUrl:'data:image/png;base64,…' }
 *
 * Usage:   SigCapture.open({ defaultName, initial, onDone: function(result){ … } })
 *          SigCapture.previewHtml(result)  -> small HTML preview of a captured signature
 * Self-contained: own overlay, own inline styles, no dependency on portal/sign page globals.
 */
(function (root) {
  var FONTS = [
    { label: 'Elegant', family: "'Brush Script MT','Segoe Script',cursive" },
    { label: 'Flowing', family: "'Lucida Handwriting','Apple Chancery',cursive" },
    { label: 'Bold', family: "'Segoe Print','Comic Sans MS',cursive" },
    { label: 'Formal', family: "'Bradley Hand','Herculanum',cursive" }
  ];
  var INK = '#1a3a6b';
  var st = null; // current capture state (only one modal at a time)

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }

  function open(opts) {
    opts = opts || {};
    close();
    var initial = opts.initial || null;
    var fontIdx = 0;
    if (initial && initial.type === 'typed') {
      FONTS.forEach(function (f, i) { if (f.family === initial.fontFamily) fontIdx = i; });
    }
    st = {
      mode: initial && initial.type === 'drawn' ? 'draw' : 'pick',
      text: (initial && initial.type === 'typed' ? initial.text : opts.defaultName) || '',
      fontIdx: fontIdx,
      hasDrawn: false,
      onDone: opts.onDone
    };
    var overlay = document.createElement('div');
    overlay.id = 'sigCapOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
    overlay.innerHTML = '<div id="sigCapBody" style="background:#1a1c17;border-radius:14px;padding:20px;max-width:520px;width:100%;color:#F3EDE3;font-family:inherit;"></div>';
    document.body.appendChild(overlay);
    render();
  }

  function close() {
    var o = $('sigCapOverlay');
    if (o) o.remove();
  }

  function render() {
    var body = $('sigCapBody');
    if (!body || !st) return;
    var pickOn = st.mode === 'pick';
    var tab = function (on) {
      return 'flex:1;padding:9px;border-radius:8px;border:1px solid ' + (on ? '#8DC63F' : 'rgba(255,255,255,0.15)') +
        ';background:' + (on ? 'rgba(141,198,63,0.14)' : 'transparent') + ';color:' + (on ? '#8DC63F' : '#aaa') +
        ';font-size:0.76rem;font-weight:700;cursor:pointer;width:auto;';
    };
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
      '<div style="font-size:0.95rem;font-weight:800;">&#9997;&#65039; Sign</div>' +
      '<button type="button" data-sig="cancel" style="width:auto;background:none;border:none;color:#888;font-size:1.3rem;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:14px;">' +
      '<button type="button" data-sig="mode-pick" style="' + tab(pickOn) + '">Type &amp; Choose Style</button>' +
      '<button type="button" data-sig="mode-draw" style="' + tab(!pickOn) + '">Draw</button>' +
      '</div>';
    if (pickOn) {
      h += '<input type="text" id="sigCapText" value="' + esc(st.text) + '" placeholder="Type your full name" autocomplete="off" autocorrect="off" spellcheck="false" style="width:100%;padding:10px 12px;background:#111;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#F3EDE3;font-size:16px;box-sizing:border-box;margin-bottom:14px;outline:none;"/>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        FONTS.map(function (f, i) {
          var active = st.fontIdx === i;
          return '<button type="button" data-sig="font-' + i + '" style="padding:14px 8px;border-radius:8px;border:2px solid ' + (active ? '#8DC63F' : 'rgba(255,255,255,0.15)') + ';background:#fff;cursor:pointer;text-align:center;width:auto;">' +
            '<div class="sigCapPrev" style="font-family:' + f.family + ';font-size:1.3rem;color:' + INK + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(st.text || 'Your Name') + '</div>' +
            '<div style="font-size:0.6rem;color:#888;margin-top:4px;">' + f.label + (active ? ' &#10003;' : '') + '</div></button>';
        }).join('') + '</div>';
    } else {
      h += '<div style="font-size:0.68rem;color:#888;margin-bottom:8px;">Draw with your finger or mouse below.</div>' +
        '<canvas id="sigCapCanvas" width="460" height="160" style="width:100%;height:160px;background:#fff;border-radius:8px;border:1px solid rgba(255,255,255,0.15);touch-action:none;display:block;"></canvas>' +
        '<button type="button" data-sig="clear" style="width:auto;margin-top:8px;padding:6px 14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:100px;color:#aaa;font-size:0.7rem;cursor:pointer;">Clear</button>';
    }
    h += '<div id="sigCapErr" style="color:#ff8a80;font-size:0.74rem;min-height:1em;margin-top:10px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;">' +
      '<button type="button" data-sig="cancel" style="flex:1;padding:11px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#aaa;font-weight:700;font-size:0.8rem;cursor:pointer;">Cancel</button>' +
      '<button type="button" data-sig="confirm" style="flex:1;padding:11px;background:#8DC63F;border:none;border-radius:10px;color:#000;font-weight:800;font-size:0.8rem;cursor:pointer;">Use This Signature</button>' +
      '</div>';
    body.innerHTML = h;

    body.onclick = function (e) {
      var t = e.target.closest ? e.target.closest('[data-sig]') : null;
      if (!t) return;
      var a = t.getAttribute('data-sig');
      if (a === 'cancel') close();
      else if (a === 'mode-pick') { st.mode = 'pick'; render(); }
      else if (a === 'mode-draw') { st.mode = 'draw'; render(); }
      else if (a === 'clear') clearDraw();
      else if (a === 'confirm') confirm();
      else if (a.indexOf('font-') === 0) { st.fontIdx = parseInt(a.slice(5), 10) || 0; render(); }
    };
    var input = $('sigCapText');
    if (input) input.oninput = function () {
      st.text = input.value;
      // Update just the previews — a full re-render per keystroke would steal focus.
      Array.prototype.forEach.call(document.querySelectorAll('.sigCapPrev'), function (el) { el.textContent = st.text || 'Your Name'; });
    };
    if (!pickOn) wireCanvas();
  }

  function wireCanvas() {
    var canvas = $('sigCapCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var drawing = false, last = null;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
    }
    canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); drawing = true; last = pos(e); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; st.hasDrawn = true;
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      canvas.addEventListener(ev, function () { drawing = false; last = null; });
    });
  }

  function clearDraw() {
    var c = $('sigCapCanvas');
    if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    if (st) st.hasDrawn = false;
  }

  function fail(msg) { var e = $('sigCapErr'); if (e) e.textContent = msg; }

  function confirm() {
    if (!st) return;
    var result;
    if (st.mode === 'pick') {
      var text = (st.text || '').trim();
      if (!text) { fail('Type your name to generate a signature style.'); return; }
      result = { type: 'typed', text: text.slice(0, 80), fontFamily: FONTS[st.fontIdx].family };
    } else {
      var canvas = $('sigCapCanvas');
      if (!st.hasDrawn || !canvas) { fail('Draw your signature before continuing.'); return; }
      result = { type: 'drawn', dataUrl: canvas.toDataURL('image/png') };
    }
    var cb = st.onDone;
    close();
    st = null;
    if (typeof cb === 'function') cb(result);
  }

  function previewHtml(result, opts) {
    if (!result) return '';
    var h = (opts && opts.maxHeight) || 44;
    if (result.type === 'drawn') return '<img src="' + esc(result.dataUrl) + '" alt="Your signature" style="max-height:' + h + 'px;background:#fff;border-radius:6px;padding:3px 8px;"/>';
    return '<div style="font-family:' + result.fontFamily + ';font-size:1.2rem;color:' + INK + ';background:#fff;border-radius:6px;padding:5px 10px;display:inline-block;">' + esc(result.text) + '</div>';
  }

  root.SigCapture = { FONTS: FONTS, open: open, close: close, previewHtml: previewHtml };
})(window);
