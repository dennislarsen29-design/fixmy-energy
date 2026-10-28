/* First-touch attribution. Runs on public landing pages BEFORE the page's own
   capture code and writes the same sessionStorage key ('fmAttribution') that
   book/index/thank-you already read, so no other page needs to change.
   - Remembers the FIRST visit for 90 days (localStorage), so a visitor who
     lands on /sunpower, leaves, and books on /book days later is still credited.
   - Fills in utm_source/utm_medium from the referrer when the link had no
     UTM tags (Google organic, Facebook/Instagram, Bing, etc.). Inferred, never
     overrides tags that are on the URL. Direct visits stay blank = "direct". */
(function () {
  try {
    var KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','gbraid','wbraid','fbclid'];
    var DAY = 864e5, TTL = 90 * DAY, now = Date.now();
    var q = new URLSearchParams(location.search);
    var cur = {}, hasTag = false;
    KEYS.forEach(function (k) { var v = q.get(k); if (v) { cur[k] = v; hasTag = true; } });
    var host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) {}
    if (host && host.indexOf('fixmy.energy') === -1) {
      var inf = null;
      if (/(^|\.)google\./.test(host)) inf = ['google', 'organic'];
      else if (/(^|\.)bing\.com$|duckduckgo\.com$|yahoo\.com$/.test(host)) inf = [host.split('.')[0], 'organic'];
      else if (/facebook\.com$|fb\.com$|instagram\.com$|l\.facebook\.com$|lm\.facebook\.com$/.test(host)) inf = [/instagram/.test(host) ? 'instagram' : 'facebook', 'social'];
      else if (/nextdoor\.com$|reddit\.com$|youtube\.com$|tiktok\.com$|linkedin\.com$/.test(host)) inf = [host.split('.')[0], 'social'];
      else if (/chatgpt\.com$|perplexity\.ai$|claude\.ai$|gemini\.google\.com$/.test(host)) inf = [host.split('.')[0], 'ai'];
      else inf = [host, 'referral'];
      if (!hasTag && inf) { cur.utm_source = inf[0]; cur.utm_medium = inf[1]; cur.inferred = '1'; }
    }
    var first = null;
    try { first = JSON.parse(localStorage.getItem('fmFirstTouch') || 'null'); } catch (e) {}
    if (first && now - (first.t || 0) > TTL) first = null;
    // a tagged/inferred visit replaces an untagged first touch; otherwise keep the first
    var hasSignal = hasTag || cur.utm_source;
    if (!first || (hasSignal && !first.d.utm_source && !first.d.gclid && !first.d.fbclid)) {
      first = { t: now, d: Object.assign({}, cur, { landing_page: location.pathname + location.search }) };
      try { localStorage.setItem('fmFirstTouch', JSON.stringify(first)); } catch (e) {}
    }
    var saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('fmAttribution') || '{}'); } catch (e) {}
    // restore first touch into this session, then let this visit's explicit tags win
    Object.keys(first.d).forEach(function (k) { if (k !== 'inferred' && !saved[k]) saved[k] = first.d[k]; });
    if (hasTag) KEYS.forEach(function (k) { if (cur[k]) saved[k] = cur[k]; });
    sessionStorage.setItem('fmAttribution', JSON.stringify(saved));
  } catch (e) {}
})();
