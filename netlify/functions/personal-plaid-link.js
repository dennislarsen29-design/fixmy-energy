// Creates a Plaid Link token for PERSONAL accounts (banks/cards + Charles Schwab
// brokerage). Gated by PERSONAL_ACCESS_KEY. Personal items are stored separately
// from business.
//
// Investments is gated behind PLAID_INVESTMENTS_ENABLED, not just listed as an
// optional product: Plaid's INVALID_PRODUCT check is account-level authorization,
// not per-institution support, so even optional_products still hard-fails the
// whole token request while the account isn't approved for Investments (approve
// at dashboard.plaid.com/overview/request-products). Once approved, set
// PLAID_INVESTMENTS_ENABLED=1 in Netlify and redeploy to start pulling Schwab
// holdings — until then Connect Bank still works fine for banks/cards.

const P = require('./lib/personal');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return P.reply(200, {});
  if (event.httpMethod !== 'POST') return P.reply(405, { error: 'Method Not Allowed' });
  const gate = P.personalGate(event);
  if (!gate.ok) return P.reply(gate.code, { error: gate.error });
  if (!P.plaidReady()) return P.reply(500, { error: 'PLAID_CLIENT_ID / PLAID_SECRET not set in Netlify yet' });
  if (!process.env.SUPA_SERVICE_KEY) return P.reply(500, { error: 'SUPA_SERVICE_KEY not set in Netlify' });

  try {
    const investmentsOn = process.env.PLAID_INVESTMENTS_ENABLED === '1' || process.env.PLAID_INVESTMENTS_ENABLED === 'true';
    const data = await P.plaid('/link/token/create', {
      client_name: 'Solar Review — Personal',
      user: { client_user_id: 'personal-owner' },
      products: ['transactions'],
      optional_products: investmentsOn ? ['investments'] : undefined,
      country_codes: ['US'],
      language: 'en',
      transactions: { days_requested: 730 }
    });
    return P.reply(200, { link_token: data.link_token, env: (process.env.PLAID_ENV || 'sandbox'), investmentsEnabled: investmentsOn });
  } catch (e) {
    return P.reply(500, { error: e.message });
  }
};
