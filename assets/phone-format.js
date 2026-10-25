// Formats any phone field as the person types: 801-232-8301 (2026-10-24, per Dennis).
// Delegated, so it covers every <input type="tel"> on the page, including ones added later.
(function () {
  if (window.__phoneFmt) return; window.__phoneFmt = true;
  function fmt(d) {
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    d = d.slice(0, 10);
    if (d.length > 6) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    if (d.length > 3) return d.slice(0, 3) + '-' + d.slice(3);
    return d;
  }
  // Partial numbers are fine while typing; a non-empty field must be a full 10 digits before a form can submit.
  function check(el, v) {
    try {
      var d = String(v || el.value).replace(/\D/g, ''); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
      el.setCustomValidity(d.length > 0 && d.length < 10 ? 'Please enter the full 10-digit phone number, like 801-232-8301.' : '');
    } catch (x) {}
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'tel') return;
    if (el.id === 'bbDialSearchInput' || el.hasAttribute('data-nofmt')) return;
    if (e.inputType && e.inputType.indexOf('delete') === 0) { var v0 = el.value; if (/[^0-9]$/.test(v0)) el.value = v0.replace(/[^0-9]+$/, ''); }
    var raw = el.value, pos = el.selectionStart, atEnd = pos === raw.length;
    var digitsBefore = raw.slice(0, pos).replace(/\D/g, '').length;
    var out = fmt(raw.replace(/\D/g, ''));
    check(el, out);
    if (out === raw) return;
    el.value = out;
    if (!atEnd) {
      var n = 0, i = 0;
      while (i < out.length && n < digitsBefore) { if (/\d/.test(out.charAt(i))) n++; i++; }
      try { el.setSelectionRange(i, i); } catch (x) {}
    }
  }, true);
  document.addEventListener('blur', function (e) { var el = e.target; if (el && el.tagName === 'INPUT' && el.type === 'tel' && !el.hasAttribute('data-nofmt') && el.id !== 'bbDialSearchInput') check(el); }, true);
})();
