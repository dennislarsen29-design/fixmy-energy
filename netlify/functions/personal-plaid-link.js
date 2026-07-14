// Creates a Plaid Link token for PERSONAL accounts (banks/cards + Charles Schwab
// brokerage). Gated by PERSONAL_ACCESS_KEY. Personal items are stored separately
// from business.
//
// Investments and Liabilities are each gated behind their own env flag, not just
// listed as optional products: Plaid's INVALID_PRODUCT check is account-level
// authorization, not per-institution support, so even optional_products still
// hard-fails the whole token request while the account isn't approved for a
// product (approve at dashboard.plaid.com/overview/request-products — Liabilities
// is normally instant/self-serve, Investments needs Plaid review). Once approved,
// set PLAID_INVESTMENTS_ENABLED=1 / PLAID_LIABILITIES_ENABLED=1 in Netlify and
// redeploy — until then Connect Bank still works fine for plain banks/cards.
// Liabilities is what lets standalone loan servicers (e.g. Rocket Mortgage, which
// doesn't support transactions at all) connect, and fills in real APR/minimum
// payment for mortgage/loan/credit accounts instead of leaving them blank.

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
    const liabilitiesOn = process.env.PLAID_LIABILITIES_ENABLED === '1' || process.env.PLAID_LIABILITIES_ENABLED === 'true';
    const optional = [].concat(investmentsOn ? ['investments'] : [], liabilitiesOn ? ['liabilities'] : []);
    const data = await P.plaid('/link/token/create', {
      client_name: 'Solar Review — Personal',
      user: { client_user_id: 'personal-owner' },
      products: ['transactions'],
      optional_products: optional.length ? optional : undefined,
      country_codes: ['US'],
      language: 'en',
      transactions: { days_requested: 730 }
    });
    return P.reply(200, { link_token: data.link_token, env: (process.env.PLAID_ENV || 'sandbox'), investmentsEnabled: investmentsOn, liabilitiesEnabled: liabilitiesOn });
  } catch (e) {
    return P.reply(500, { error: e.message });
  }
};
