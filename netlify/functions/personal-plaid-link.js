// Creates a Plaid Link token for PERSONAL accounts (banks/cards + Charles Schwab
// brokerage). Requests both transactions and investments products so one Link
// flow can connect checking/savings/credit AND brokerage holdings.
// Gated by PERSONAL_ACCESS_KEY. Personal items are stored separately from business.

const P = require('./lib/personal');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return P.reply(200, {});
  if (event.httpMethod !== 'POST') return P.reply(405, { error: 'Method Not Allowed' });
  const gate = P.personalGate(event);
  if (!gate.ok) return P.reply(gate.code, { error: gate.error });
  if (!P.plaidReady()) return P.reply(500, { error: 'PLAID_CLIENT_ID / PLAID_SECRET not set in Netlify yet' });
  if (!process.env.SUPA_SERVICE_KEY) return P.reply(500, { error: 'SUPA_SERVICE_KEY not set in Netlify' });

  try {
    const data = await P.plaid('/link/token/create', {
      client_name: 'Solar Review — Personal',
      user: { client_user_id: 'personal-owner' },
      products: ['transactions', 'investments'],
      country_codes: ['US'],
      language: 'en',
      transactions: { days_requested: 730 }
    });
    return P.reply(200, { link_token: data.link_token, env: (process.env.PLAID_ENV || 'sandbox') });
  } catch (e) {
    return P.reply(500, { error: e.message });
  }
};
