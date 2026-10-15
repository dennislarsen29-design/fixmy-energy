/* Shared bill-history math (portal.html + proposal-preview.html). One copy only: month key parsing and the 12-month usage sum. */
(function(){
  // Annual usage from the bill's monthly history (2026-10-15, per Dennis): previous records (the NEM Summary table's
  // prior months) are the base, and NEWER months replace older ones, so the latest two months trump earlier data.
  // 12+ distinct months -> sum of the newest 12. 6-11 months -> missing calendar months filled with the average of
  // the known ones. Fewer -> null (caller falls back to the printed annual figure).
  function _billMonthKey(label) {
    var m = /^\s*([A-Za-z]{3})[A-Za-z]*\.?\s*,?\s*(\d{4})?/.exec(String(label || '')); if (!m) return null;
    var mi = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].toLowerCase()); if (mi < 0) return null;
    return { moy: mi, ord: m[2] ? parseInt(m[2], 10) * 12 + mi : null };
  }
  function _billUsageFromMonths(rows) {
    var seen = {}, list = [];
    (rows || []).forEach(function (r) {
      var k = _billMonthKey(r && r.month), v = parseFloat(r && r.total_kwh);
      if (!k || k.ord == null || !isFinite(v)) return;   // net-metered months can be negative (export > use); they count in the sum like any other month
      seen[k.ord] = { ord: k.ord, moy: k.moy, kwh: v };   // later rows (newer reads) overwrite earlier ones for the same month
    });
    Object.keys(seen).forEach(function (o) { list.push(seen[o]); });
    list.sort(function (a, b) { return b.ord - a.ord; });
    list = list.slice(0, 12);
    if (list.length >= 12) return { kwh: Math.round(list.reduce(function (t, x) { return t + x.kwh; }, 0)), months: 12, filled: false };
    if (list.length >= 6) {
      var avg = list.reduce(function (t, x) { return t + x.kwh; }, 0) / list.length, byMoy = {};
      list.forEach(function (x) { byMoy[x.moy] = x.kwh; });
      var tot = 0; for (var i = 0; i < 12; i++) tot += (byMoy[i] != null ? byMoy[i] : avg);
      return { kwh: Math.round(tot), months: list.length, filled: true };
    }
    return null;
  }
  window._billMonthKey = _billMonthKey; window._billUsageFromMonths = _billUsageFromMonths;
})();
