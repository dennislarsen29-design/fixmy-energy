// Safe page fetch for the PR tools (contact verification + backlink checks).
// URLs come from the database, so refuse anything that points inside a network: IP literals,
// localhost, single-label or .local/.internal hosts, odd ports. Redirects are followed by hand so
// every hop is checked. Reads at most ~1.5MB. Never throws: returns { ok, status, text, finalUrl, error }.
const UA = 'Mozilla/5.0 (compatible; SolarReviewLinkCheck/1.0; +https://fixmy.energy)';

function hostOk(u) {
  let x; try { x = new URL(u); } catch (e) { return false; }
  if (x.protocol !== 'https:' && x.protocol !== 'http:') return false;
  if (x.port && x.port !== '80' && x.port !== '443') return false;
  const h = x.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost') return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':') || h.startsWith('[')) return false;
  if (/\.(local|internal|localhost|lan|intranet)$/.test(h)) return false;
  return true;
}

async function fetchText(url, timeoutMs) {
  let cur = url;
  for (let hop = 0; hop < 5; hop++) {
    if (!hostOk(cur)) return { ok: false, status: 0, text: '', finalUrl: cur, error: 'blocked_host' };
    const ctl = new AbortController();
    const t = setTimeout(function () { ctl.abort(); }, timeoutMs || 8000);
    try {
      const r = await fetch(cur, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        cur = new URL(r.headers.get('location'), cur).toString();
        clearTimeout(t);
        continue;
      }
      const buf = await r.arrayBuffer();
      clearTimeout(t);
      const text = Buffer.from(buf.slice(0, 1500000)).toString('utf8');
      return { ok: r.ok, status: r.status, text, finalUrl: cur };
    } catch (e) {
      clearTimeout(t);
      return { ok: false, status: 0, text: '', finalUrl: cur, error: e.name === 'AbortError' ? 'timeout' : 'network' };
    }
  }
  return { ok: false, status: 0, text: '', finalUrl: cur, error: 'too_many_redirects' };
}

// Find every link to fixmy.energy in a page. rel is the raw rel attribute (lowercased).
function findLinks(html, domain) {
  const dom = (domain || 'fixmy.energy').toLowerCase();
  const out = [];
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1];
    let host = '';
    try { host = new URL(href, 'https://x.invalid/').hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { continue; }
    if (host !== dom) continue;
    const tag = m[0].slice(0, m[0].indexOf('>') + 1);
    const rel = ((tag.match(/rel\s*=\s*["']([^"']*)["']/i) || [])[1] || '').toLowerCase();
    const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    out.push({ href: href, rel: rel, anchor: text });
  }
  return out;
}

module.exports = { fetchText, findLinks, hostOk };
