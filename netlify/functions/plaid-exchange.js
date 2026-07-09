// Exchanges a Plaid Link public_token for an access_token and stores it
// server-side in app_config (service role only — tokens never reach the client).
// Also computes the sync cutoff: Plaid imports start the day AFTER the latest
// transaction already imported from CSV/PDF for that account kind, so uploaded
// statements and the Plaid backfill never overlap. No CSV history yet → Jan 1
// of the current year.
//
// POST { public_token, institution } → { ok, institution, kind, start_date }

const { plaid, plaidReady, supaGet, getPlaidItems, savePlaidItems, reply, originAllowed } = require('./lib/plaid');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });
  if (!originAllowed(event)) return reply(403, { error: 'Forbidden' });
  if (!plaidReady() || !process.env.SUPA_SERVICE_KEY) return reply(500, { error: 'Plaid/Supabase env vars not set in Netlify yet' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Invalid JSON' }); }
  if (!req.public_token) return reply(400, { error: 'public_token required' });

  try {
    const ex = await plaid('/item/public_token/exchange', { public_token: req.public_token });
    const institution = String(req.institution || 'Unknown institution').slice(0, 80);
    const kind = /american\s*express|amex/i.test(institution) ? 'amex' : 'bank';

    // Cutoff = day after the newest CSV/PDF-imported transaction of this kind
    const csvSources = kind === 'amex' ? 'in.(amex_csv,pdf_ai)' : 'in.(bank_csv,pdf_ai)';
    let startDate = new Date().getFullYear() + '-01-01';
    try {
      const rows = await supaGet('/expense_transactions?select=txn_date&source=' + csvSources + '&order=txn_date.desc&limit=1');
      if (rows && rows[0] && rows[0].txn_date) {
        const d = new Date(rows[0].txn_date + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        startDate = d.toISOString().slice(0, 10);
      }
    } catch (e) { /* table empty/missing — keep Jan 1 default */ }

    const items = await getPlaidItems();
    const existing = items.findIndex(i => i.item_id === ex.item_id);
    const entry = {
      item_id: ex.item_id, access_token: ex.access_token,
      institution: institution, kind: kind, start_date: startDate,
      cursor: null, last_synced: null, last_added: 0, last_dupes: 0, last_error: null,
      connected_at: new Date().toISOString()
    };
    if (existing >= 0) items[existing] = Object.assign(items[existing], entry);
    else items.push(entry);
    await savePlaidItems(items);

    console.log('[plaid-exchange] connected', institution, 'kind', kind, 'start_date', startDate);
    return reply(200, { ok: true, institution: institution, kind: kind, start_date: startDate });
  } catch (e) {
    return reply(500, { error: e.message });
  }
};
