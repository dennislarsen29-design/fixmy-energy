// Fetches a skip-trace results CSV by URL, server-side.
//
// Tracerfy hands back a download link rather than a file, and the browser can't fetch it
// directly (their CDN sends no CORS headers). This proxies that one fetch so the admin can
// paste the link straight into the portal instead of download -> locate -> upload.
//
// ⚠️ A URL fetcher is an SSRF risk if left open, so the host is allowlisted rather than
// validated — the only thing this is for is Tracerfy result files.
const ALLOWED_HOSTS = [
  /(^|\.)tracerfy\.com$/i,
  /(^|\.)digitaloceanspaces\.com$/i,
];

const ALLOWED_ORIGINS = [
  'https://fixmy.energy',
  'https://www.fixmy.energy',
];

const MAX_BYTES = 25 * 1024 * 1024;   // a skip-trace batch is a few hundred KB at most

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let url;
  try { url = String((JSON.parse(event.body || '{}')).url || '').trim(); }
  catch (e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Bad JSON' }) }; }
  if (!url) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No url supplied' }) };

  let parsed;
  try { parsed = new URL(url); }
  catch (e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'That is not a valid URL.' }) }; }

  if (parsed.protocol !== 'https:') {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Only https links are accepted.' }) };
  }
  if (!ALLOWED_HOSTS.some((re) => re.test(parsed.hostname))) {
    return {
      statusCode: 400, headers: cors,
      body: JSON.stringify({ error: 'Only Tracerfy download links are accepted here (' + parsed.hostname + ' is not allowed).' }),
    };
  }

  try {
    const res = await fetch(parsed.toString(), { headers: { Accept: 'text/csv,text/plain,*/*' } });
    if (!res.ok) {
      return {
        statusCode: 502, headers: cors,
        body: JSON.stringify({ error: 'Download failed (' + res.status + '). The link may have expired.' }),
      };
    }
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len && len > MAX_BYTES) {
      return { statusCode: 413, headers: cors, body: JSON.stringify({ error: 'That file is too large to load this way.' }) };
    }
    const text = await res.text();
    if (text.length > MAX_BYTES) {
      return { statusCode: 413, headers: cors, body: JSON.stringify({ error: 'That file is too large to load this way.' }) };
    }
    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: text, bytes: text.length }) };
  } catch (e) {
    console.error('fetch-csv error:', e.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Could not reach that link — ' + e.message }) };
  }
};
