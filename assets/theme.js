/* Solar Review theme (2026-10-26, per Dennis): light / dark that follows the device, with an Auto / Light / Dark switch.
   The portal and its inline styles are built dark. Light mode flips the whole page (invert + hue-rotate, the way
   dark-mode extensions do) and flips images, video, canvas and maps back so photos never look negative.
   Customer screens have their own hand-made light skin (customer-light.css); this file only tells them which side to use.
   Pages that are built light (Sign & Pay) set native:'light' and get the flip when the device is dark. */
(function () {
  var KEY = 'pvTheme', mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var native = 'dark', mode = 'staff';
  var css = 'html.pv-invert{filter:invert(1) hue-rotate(180deg) brightness(1.06)}'
    + 'html.pv-invert img,html.pv-invert video,html.pv-invert canvas,html.pv-invert iframe,html.pv-invert .gm-style img,html.pv-invert #qaLauncher,html.pv-invert .qa-stage.qa-poster,html.pv-invert [style*="background-image"],html.pv-invert [style*="url("]{filter:invert(1) hue-rotate(180deg)}'
    + 'html.pv-invert .pv-keep,html.pv-invert .qa-wrap,html.pv-invert #qaFloat,html.pv-invert #qaStatus,html.pv-invert #qaCaption{filter:invert(1) hue-rotate(180deg)}'
    + 'html.pv-invert .qa-wrap .qa-stage.qa-poster,html.pv-invert .qa-wrap video,html.pv-invert #qaFloat .qa-stage.qa-poster,html.pv-invert #qaFloat video{filter:none}'
    + '#pvThemeBtn{background:none;border:1px solid rgba(128,128,128,.4);color:inherit;border-radius:100px;padding:3px 10px;font-size:.68rem;font-weight:700;cursor:pointer;width:auto;white-space:nowrap}'
    + '#pvThemeFloat{position:fixed;top:10px;right:10px;z-index:90}';
  function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function effective() { var p = pref(); if (p === 'light' || p === 'dark') return p; return mq && mq.matches ? 'dark' : 'light'; }
  function label() { var p = pref(); return (p === 'auto' ? 'Auto' : p === 'light' ? 'Light' : 'Dark') + ' ◐'; }
  function apply() {
    var e = effective(), root = document.documentElement;
    var inv = mode === 'customer' ? false : (native === 'dark' ? e === 'light' : e === 'dark');
    root.classList.toggle('pv-invert', inv);
    root.setAttribute('data-pv-theme', e);
    Array.prototype.forEach.call(document.querySelectorAll('#pvThemeBtn'), function (b) { b.textContent = label(); b.title = 'Theme: ' + pref() + ' (follows your device when Auto)'; });
    if (mode === 'customer' && typeof window._applyCustomerTheme === 'function') { try { window._applyCustomerTheme(); } catch (x) {} }
  }
  var style = document.createElement('style'); style.textContent = css; (document.head || document.documentElement).appendChild(style);
  window.PvTheme = {
    effective: effective, pref: pref,
    setMode: function (m) { mode = m; apply(); },
    setNative: function (n) { native = n; apply(); },
    cycle: function () { var n = { auto: 'light', light: 'dark', dark: 'auto' }[pref()] || 'auto'; try { localStorage.setItem(KEY, n); } catch (e) {} apply(); },
    floatButton: function () { if (document.getElementById('pvThemeBtn')) return; var b = document.createElement('button'); b.id = 'pvThemeBtn'; b.className = 'pv-keep'; b.type = 'button'; b.setAttribute('aria-label', 'Change theme'); b.onclick = window.PvTheme.cycle; var w = document.createElement('div'); w.id = 'pvThemeFloat'; w.appendChild(b); document.body.appendChild(w); apply(); },
    apply: apply
  };
  if (mq) { var h = function () { apply(); }; if (mq.addEventListener) mq.addEventListener('change', h); else if (mq.addListener) mq.addListener(h); }
  apply();
})();
