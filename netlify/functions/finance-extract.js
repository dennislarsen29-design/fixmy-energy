// Solar Review Finance — statement AI: PDF extraction + transaction categorization.
// Proxies to the Anthropic API keeping ANTHROPIC_KEY server-side, hardened the
// same way as claude-vision.js (origin allowlist + payload reconstructed, never
// forwarded raw). Two modes:
//
//   POST { mode:'extract', pdf_base64, kind }        → { transactions:[{date,description,amount}], period_start, period_end }
//   POST { mode:'categorize', transactions:[{description,amount}], accounts:[names] }
//                                                     → { assignments:[{index,account,confidence}] }
//
// Model uses forced tool_choice so the reply is always machine-readable JSON.

const MODEL = 'claude-sonnet-5';
const MAX_PDF_BYTES = 10 * 1024 * 1024;   // ~10MB body — a monthly statement PDF
const MAX_TXNS_PER_CALL = 300;

const ALLOWED_ORIGIN_HOSTS = new Set(['fixmy.energy', 'www.fixmy.energy']);
function originAllowed(event) {
  const h = event.headers || {};
  const src = h.origin || h.Origin || h.referer || h.Referer || '';
  if (!src) return false;
  try {
    const host = new URL(src).hostname.toLowerCase();
    if (ALLOWED_ORIGIN_HOSTS.has(host)) return true;
    if (host.endsWith('.netlify.app')) return true; // deploy previews
    return false;
  } catch (e) { return false; }
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (status, body) => ({ statusCode: status, headers: cors, body: JSON.stringify(body) });

const EXTRACT_TOOL = {
  name: 'return_transactions',
  description: 'Return every transaction line found in the statement.',
  input_schema: {
    type: 'object',
    properties: {
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date:        { type: 'string', description: 'Transaction date, YYYY-MM-DD' },
            description: { type: 'string', description: 'Merchant/description line exactly as printed' },
            amount:      { type: 'number', description: 'Positive = charge/expense, negative = credit/refund/payment received' }
          },
          required: ['date', 'description', 'amount']
        }
      },
      period_start: { type: 'string', description: 'Statement period start, YYYY-MM-DD, if printed' },
      period_end:   { type: 'string', description: 'Statement period end, YYYY-MM-DD, if printed' }
    },
    required: ['transactions']
  }
};

const CATEGORIZE_TOOL = {
  name: 'return_categories',
  description: 'Return one account assignment per transaction.',
  input_schema: {
    type: 'object',
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index:      { type: 'number', description: 'Index of the transaction in the input list' },
            account:    { type: 'string', description: 'One account name from the provided chart of accounts, verbatim' },
            confidence: { type: 'number', description: '0-1. Below 0.7 means a human should review.' }
          },
          required: ['index', 'account', 'confidence']
        }
      }
    },
    required: ['assignments']
  }
};

async function callClaude(body) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error('Claude API error ' + resp.status + ': ' + (await resp.text()).slice(0, 400));
  return resp.json();
}

function toolResult(data, toolName) {
  const block = (data.content || []).find(b => b.type === 'tool_use' && b.name === toolName);
  if (!block) throw new Error('Model returned no ' + toolName + ' call');
  return block.input;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  if (!originAllowed(event)) return reply(403, { error: 'Forbidden' });
  if (!process.env.ANTHROPIC_KEY) return reply(500, { error: 'ANTHROPIC_KEY env var not set in Netlify' });
  if (event.body && Buffer.byteLength(event.body, 'utf8') > MAX_PDF_BYTES) return reply(413, { error: 'Payload too large' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }

  try {
    if (req.mode === 'extract') {
      if (typeof req.pdf_base64 !== 'string' || !req.pdf_base64) return reply(400, { error: 'pdf_base64 required' });
      const kind = req.kind === 'bank' ? 'bank' : 'amex';
      const data = await callClaude({
        model: MODEL,
        max_tokens: 8192,
        system: 'You extract transaction lines from financial statements. Extract EVERY transaction — charges, credits, refunds. '
          + 'Do NOT include summary rows, balance lines, interest-rate tables, or "payment received - thank you" style card payments to the issuer (those are transfers, not expenses). '
          + 'Amounts: positive = money spent (a charge), negative = a credit or merchant refund. Dates as YYYY-MM-DD; if the statement omits the year, infer it from the statement period.',
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'return_transactions' },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: req.pdf_base64 } },
            { type: 'text', text: 'Extract all transactions from this ' + (kind === 'amex' ? 'American Express card' : 'business bank') + ' statement.' }
          ]
        }]
      });
      const out = toolResult(data, 'return_transactions');
      out.transactions = (out.transactions || []).slice(0, 2000);
      return reply(200, out);
    }

    if (req.mode === 'categorize') {
      if (!Array.isArray(req.transactions) || !req.transactions.length) return reply(400, { error: 'transactions[] required' });
      if (!Array.isArray(req.accounts) || !req.accounts.length) return reply(400, { error: 'accounts[] required' });
      const txns = req.transactions.slice(0, MAX_TXNS_PER_CALL).map(t => ({
        description: String(t.description || '').slice(0, 200),
        amount: Number(t.amount) || 0
      }));
      const accounts = req.accounts.slice(0, 80).map(a => String(a).slice(0, 80));
      const data = await callClaude({
        model: MODEL,
        max_tokens: 8192,
        system: 'You are a bookkeeper for Solar Review Corp, a San Diego S-Corp doing solar diagnostics, repairs, and battery retrofits (field sales business: reps drive to homes, heavy vehicle/fuel/meals/advertising spend). '
          + 'Categorize each card/bank transaction into exactly one account from the chart of accounts provided, using the account name VERBATIM. '
          + 'Prefer the most specific sub-account (e.g. "Auto Insurance" over "Insurance Expense"). Business meals → "Meals and Entertainment"; meals during overnight travel → "Travel Meals & Entertainment". '
          + 'Software/SaaS → "Dues and Subscriptions" unless it is hosting/domains/internet ("Computer and Internet Expenses"). Tools and job materials → "Office Supplies" unless clearly subcontractor labor. '
          + 'Set confidence below 0.7 whenever the merchant is ambiguous.',
        tools: [CATEGORIZE_TOOL],
        tool_choice: { type: 'tool', name: 'return_categories' },
        messages: [{
          role: 'user',
          content: 'Chart of accounts:\n' + accounts.join('\n')
            + '\n\nTransactions (index: description | amount):\n'
            + txns.map((t, i) => i + ': ' + t.description + ' | ' + t.amount).join('\n')
        }]
      });
      const out = toolResult(data, 'return_categories');
      // Only pass through assignments that reference a real account + index
      const valid = new Set(accounts);
      out.assignments = (out.assignments || []).filter(a =>
        Number.isInteger(a.index) && a.index >= 0 && a.index < txns.length && valid.has(a.account));
      return reply(200, out);
    }

    return reply(400, { error: 'mode must be extract or categorize' });
  } catch (e) {
    return reply(500, { error: e.message });
  }
};
