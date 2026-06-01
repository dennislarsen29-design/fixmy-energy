// generate-proposal-insight.js
// Calls Claude to draft a 2–3 sentence customer-facing AI insight for the inverter_swap proposal.
// POST body: { notes, system_size, monthly_bill, nem_status, installer, issue }
// Returns: { insight: "..." }

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!ANTHROPIC_KEY) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { notes, system_size, monthly_bill, nem_status, installer, issue } = body;

  const contextParts = [];
  if (installer) contextParts.push(`Original installer: ${installer}`);
  if (system_size) contextParts.push(`System size: ${system_size} kW`);
  if (monthly_bill) contextParts.push(`Current monthly utility bill: $${monthly_bill}`);
  if (nem_status) contextParts.push(`NEM status: ${nem_status.toUpperCase()}`);
  if (issue) contextParts.push(`Issue: ${issue}`);
  if (notes) contextParts.push(`Diagnostic notes: ${notes.slice(0, 600)}`);

  const userMessage = contextParts.length
    ? `Customer details:\n${contextParts.join('\n')}\n\nWrite the insight now.`
    : 'Write a general inverter replacement insight for a homeowner with a failing solar inverter.';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: `You are a solar energy advisor writing a 2–3 sentence customer-facing insight for a proposal.
Be specific to this customer's situation, plain-English, and focus on why replacing their inverter and adding panels + a Tesla Powerwall will benefit them.
Mention their SDG&E NEM 1 status as a valuable asset they're preserving.
Do NOT use jargon. Do NOT mention dollar amounts. Do NOT start with "I".
Output only the insight paragraph — no labels, no headers.`,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Claude API error ' + resp.status + ': ' + errText.slice(0, 200) }) };
    }

    const data = await resp.json();
    const insight = data.content && data.content[0] && data.content[0].text
      ? data.content[0].text.trim()
      : null;

    if (!insight) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'No insight returned' }) };

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ insight }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
