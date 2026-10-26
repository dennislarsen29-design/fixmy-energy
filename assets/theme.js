/* Solar Review theme (2026-10-26, per Dennis: keep the brand tones, fonts and colours, no new colours).
   Light / dark that follows the device, with an Auto / Light / Dark switch.
   - Staff and Ops screens are built dark. Light mode adds html.pv-light, which loads assets/portal-light.css: a skin that
     remaps only neutral surfaces, neutral text and borders to the brand cream / surface / ink. Brand fills never change.
   - Customer screens use their own light skin (customer-light.css); this file only tells them which side to use.
   - Pages built light (Sign & Pay) call setNative('light'); in dark mode they swap their own colour variables to the brand dark. */
(function () {
  var KEY = 'pvTheme', mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var native = 'dark', mode = 'staff', cssLoaded = false;
  var css = '#pvThemeBtn{background:none;border:1px solid rgba(128,128,128,.4);color:inherit;border-radius:100px;padding:3px 10px;font-size:.68rem;font-weight:700;cursor:pointer;width:auto;white-space:nowrap}'
    + '#pvThemeFloat{position:fixed;top:10px;right:10px;z-index:90}'
    /* native-light pages (Sign & Pay) in dark mode: same variables, brand dark values */
    + 'html.pv-dark{--cream:#1A1A1A;--cream2:#242424;--white:#242424;--dark:#F3EDE3;--muted:#aaa;--line:#333;color-scheme:dark}'
    + 'html.pv-dark body{background:#1A1A1A!important;color:#F3EDE3!important}'
    + 'html.pv-dark input,html.pv-dark select,html.pv-dark textarea{background:#242424!important;color:#F3EDE3!important;border-color:#3a3a3a!important}'
    + 'html.pv-dark .card,html.pv-dark .box,html.pv-dark .cert-card,html.pv-dark .payment-card,html.pv-dark .sig-box,html.pv-dark .pm-pill,html.pv-dark .repair-initial-block,html.pv-dark .error-card{background:#242424!important;border-color:#333!important;color:#F3EDE3!important}'
    + 'html.pv-dark .pm-pill.active{border-color:#8DC63F!important}'
    + 'html.pv-dark p,html.pv-dark label,html.pv-dark li,html.pv-dark .secure-note,html.pv-dark .repair-initial-hint,html.pv-dark .fee-breakdown{color:#aaa!important}'
    + 'html.pv-dark h1,html.pv-dark h2,html.pv-dark h3,html.pv-dark .card-title{color:#F3EDE3!important}'
    + 'html.pv-dark .fee-notice{background:rgba(141,198,63,.10)!important;border-color:rgba(141,198,63,.4)!important;color:#F3EDE3!important}html.pv-dark .fee-notice *{color:#F3EDE3!important}'
    + 'html.pv-dark #credit-note{background:rgba(141,198,63,.12)!important;border-color:#8DC63F!important;color:#F3EDE3!important}html.pv-dark #credit-note *{color:#F3EDE3!important}'
    + 'html.pv-dark .req-bubble{background:#242424;color:#F3EDE3}html.pv-dark .req-bubble.next{background:#8DC63F;color:#1A1A1A}';
  function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function effective() { var p = pref(); if (p === 'light' || p === 'dark') return p; return mq && mq.matches ? 'dark' : 'light'; }
  function label() { var p = pref(); return (p === 'auto' ? 'Auto' : p === 'light' ? 'Light' : 'Dark') + ' ◐'; }
  function loadSkin() {
    if (cssLoaded) return; cssLoaded = true;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/portal-light.css?v=1'; (document.head || document.documentElement).appendChild(l);
  }
  function apply() {
    var e = effective(), root = document.documentElement;
    var light = mode === 'staff' && native === 'dark' && e === 'light';
    var dark = mode !== 'customer' && native === 'light' && e === 'dark';
    if (light) loadSkin();
    root.classList.toggle('pv-light', light);
    root.classList.toggle('pv-dark', dark);
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
    floatButton: function () { if (document.getElementById('pvThemeBtn')) return; var b = document.createElement('button'); b.id = 'pvThemeBtn'; b.type = 'button'; b.setAttribute('aria-label', 'Change theme'); b.onclick = window.PvTheme.cycle; var w = document.createElement('div'); w.id = 'pvThemeFloat'; w.appendChild(b); document.body.appendChild(w); apply(); },
    apply: apply
  };
  if (mq) { var h = function () { apply(); }; if (mq.addEventListener) mq.addEventListener('change', h); else if (mq.addListener) mq.addListener(h); }
  apply();
})();
