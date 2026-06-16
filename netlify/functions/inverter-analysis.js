// Inverter AI Analysis — vision + web search
// POST /.netlify/functions/inverter-analysis
// Body: { photoUrls: string[], notes: string, installer: string, address: string, systemSize: string }
// Returns: { brand, model, serial, manufactureYear, warrantyStatus, summary,
//            findings: [{title, body, links: [{label, url}]}],
//            onSiteSteps: string[], canFixOnSpot: bool, fixOnSpotNotes: string }

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!ANTHROPIC_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { photoUrls = [], notes = '', installer = '', address = '', systemSize = '' } = body;

  // Fetch inverter photos and convert to base64 for vision
  const imageContents = [];
  for (const url of photoUrls.slice(0, 4)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) { console.warn('Photo fetch failed', url, r.status); continue; }
      const buf = await r.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      imageContents.push({ type: 'image', source: { type: 'base64', media_type: ct, data: b64 } });
    } catch(e) { console.warn('Photo fetch error:', url, e.message); }
  }

  // Build context from available data
  const ctxParts = [];
  if (installer)   ctxParts.push(`Installer/notes on file: ${installer}`);
  if (address)     ctxParts.push(`Property address: ${address}`);
  if (systemSize)  ctxParts.push(`System size: ${systemSize} kW`);
  if (notes)       ctxParts.push(`Tech/customer reported issue:\n${notes.slice(0, 800)}`);

  const userContent = [
    ...imageContents,
    {
      type: 'text',
      text: (ctxParts.length ? ctxParts.join('\n') + '\n\n' : '') +
`Analyze this solar inverter${imageContents.length ? ' from the photos above' : ''}. Do the following:

1. Extract the exact brand, model number, and serial number from any visible labels or stickers in the photos.
2. From the serial number, estimate the manufacture date if the brand uses date-encoded serials (SolarEdge, Enphase, SMA all do).
3. Look up the warranty terms for this specific model — standard length, what's covered, and how many years remain based on manufacture date.
4. Search for known failure modes, service bulletins, firmware issues, and recall notices for this inverter model.
5. Search solar forums (e.g. solartalk.net, diysolarforum.com, r/solar, inverter brand community forums) for threads about the symptoms described in the notes.
6. Identify whether the issue is likely fixable on-site vs. requires a part order or warranty replacement.
7. Provide specific on-site diagnostic steps the tech can take right now.

Return ONLY a valid JSON object — no markdown, no preamble — with this exact structure:
{
  "brand": "...",
  "model": "...",
  "serial": "...",
  "manufactureYear": "...",
  "warrantyStatus": "...",
  "summary": "2-3 sentence plain-English summary of the situation and prognosis",
  "findings": [
    {
      "title": "...",
      "body": "...",
      "links": [{"label": "...", "url": "..."}]
    }
  ],
  "onSiteSteps": ["step 1", "step 2"],
  "canFixOnSpot": true,
  "fixOnSpotNotes": "..."
}

Only include links whose URLs you've confirmed exist via web search. Do not fabricate URLs.`,
    },
  ];

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
        system: `You are an expert solar inverter diagnostician with 15 years of field experience in San Diego, CA. You specialize in diagnosing and repairing all major brands: SolarEdge, Enphase, SMA, Fronius, Generac, ABB/Fimer, SunPower (SMA-based), Delta, Sungrow, and others.

Your role is to act as a rapid field research tool for a solar review technician on-site. You use web search to look up:
- Exact warranty terms for the specific inverter model and serial number
- Known failure modes, service bulletins, and recall notices
- Community forum discussions about reported symptoms (Solar-Talk, DIY Solar Forum, r/solar, brand-specific communities)
- Manufacturer tech support resources and error code lookup tools

Be specific and practical. The tech needs to know: what is likely wrong, can they fix it today, and what are their next steps. Do not pad or add disclaimers. Return ONLY valid JSON.`,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(55000), // Netlify functions have 60s limit
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Claude API error', resp.status, JSON.stringify(data).slice(0, 300));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Claude API error ' + resp.status + ': ' + (data.error?.message || '') }) };
    }

    // Collect all text blocks from the response (web search tool use is handled server-side)
    let text = '';
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') text += block.text;
      }
    }

    if (!text) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'No analysis returned', stopReason: data.stop_reason }) };
    }

    // Extract JSON from response (model may wrap it in backticks occasionally)
    let result;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : text);
    } catch(e) {
      console.error('JSON parse failed:', text.slice(0, 500));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Could not parse analysis JSON: ' + e.message, raw: text.slice(0, 600) }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, ...result }) };
  } catch(e) {
    console.error('inverter-analysis handler error:', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
