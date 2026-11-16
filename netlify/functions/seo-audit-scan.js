// Weekly live-site SEO audit. Writes pipeline_state key 'seo_audit' (read by the self-healing loop in S.U.N.).
// Manual: GET /.netlify/functions/seo-audit-scan. Env: SUPA_SERVICE_KEY.
const audit = require('./lib/site-audit');
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
exports.handler = async function () {
  const k = process.env.SUPA_SERVICE_KEY;
  if (!k) return { statusCode: 500, body: 'no key' };
  try {
    const res = await audit.run(160);
    const flat = []; res.pages.forEach(p => (p.issues || []).forEach(i => flat.push({ url: p.url, sev: i.sev, code: i.code, msg: i.msg, title: p.title, desc: p.desc })));
    const fixableCodes = ['long_title', 'long_desc', 'no_desc'];
    const fixable = flat.filter(x => fixableCodes.indexOf(x.code) > -1);
    const urls = {}; fixable.forEach(x => { urls[x.url] = x; });
    const value = { at: new Date().toISOString(), pages: res.pages.length, urls: res.urls, high: flat.filter(x => x.sev === 'high').length, med: flat.filter(x => x.sev === 'med').length,
      fixable_pages: Object.keys(urls).map(u => ({ url: u, title: urls[u].title, desc: urls[u].desc })).slice(0, 60),
      high_items: flat.filter(x => x.sev === 'high').slice(0, 15).map(x => ({ url: x.url, msg: x.msg })) };
    const r = await fetch(SB + '/pipeline_state', { method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'seo_audit', value: JSON.stringify(value), updated_at: value.at }) });
    if (!r.ok) throw new Error('save ' + r.status);
    return { statusCode: 200, body: JSON.stringify({ ok: true, pages: value.pages, high: value.high, med: value.med, fixable: value.fixable_pages.length }) };
  } catch (e) { return { statusCode: 200, body: 'error: ' + e.message }; }
};
