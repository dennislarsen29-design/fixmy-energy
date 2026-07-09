// Creates a Plaid Link token so the portal can open the Connect flow.
// POST from the portal only (origin-allowlisted). Returns { link_token }.

const { plaid, plaidReady, reply, originAllowed } = require('./lib/plaid');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  if (!originAllowed(event)) return reply(403, { error: 'Forbidden' });
  if (!plaidReady()) return reply(500, { error: 'PLAID_CLIENT_ID / PLAID_SECRET not set in Netlify yet' });
  if (!process.env.SUPA_SERVICE_KEY) return reply(500, { error: 'SUPA_SERVICE_KEY not set in Netlify' });

  try {
    const data = await plaid('/link/token/create', {
      client_name: 'Solar Review Finance',
      user: { client_user_id: 'solar-review-admin' },
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
      transactions: { days_requested: 730 }
    });
    return reply(200, { link_token: data.link_token, env: (process.env.PLAID_ENV || 'sandbox') });
  } catch (e) {
    return reply(500, { error: e.message });
  }
};
