// Service-role gateway for the personal loan module (Cody & Casey → Dennis).
// personal_loans / personal_loan_payments are RLS-deny; only this function (service role)
// can read/write them. Admin actions are gated by PERSONAL_ACCESS_KEY (like personal-api.js);
// the lender view + borrower sign are gated by their unguessable tokens instead.
//
// Actions (POST { action, ... }):
//   get           (admin)         → loan + payments + computed balance/next-payment
//   add_payment   (admin)         → { amount, paid_on, is_extra, note } → inserts, recomputes
//   sign          (token)         → { sign_token, signature } → records signature, status=active
//   lender_view   (token)         → { view_token } → read-only loan + payments + balance

const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SERVICE_KEY = process.env.SUPA_SERVICE_KEY;
const ACCESS_KEY = process.env.PERSONAL_ACCESS_KEY || '';

const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-personal-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

function sb(path, opts) {
  return fetch(SUPA_URL + '/rest/v1/' + path, Object.assign({}, opts, {
    headers: Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' }, (opts && opts.headers) || {})
  }));
}
function newToken() { return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 40); }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// Balance after applying payments in order (interest on the outstanding balance each time).
function computeLedger(loan, payments) {
  const monthlyRate = (Number(loan.apr) || 0) / 100 / 12;
  let balance = Number(loan.principal) || 0;
  const rows = payments.slice().sort((a, b) => String(a.paid_on).localeCompare(String(b.paid_on)));
  const enriched = rows.map(p => {
    const interest = round2(balance * monthlyRate);
    const principalPortion = round2(Number(p.amount) - interest);
    balance = round2(balance - principalPortion);
    if (balance < 0) balance = 0;
    return Object.assign({}, p, { interest_portion: interest, principal_portion: principalPortion, balance_after: balance });
  });
  return { balance, payments: enriched };
}

async function loadLoanBundle(loan) {
  const pr = await sb('personal_loan_payments?loan_id=eq.' + loan.id + '&select=*&order=paid_on.asc', { method: 'GET' });
  const payments = pr.ok ? await pr.json() : [];
  const ledger = computeLedger(loan, payments);
  const paidCount = payments.length;
  const nextDue = Math.max(0, (Number(loan.term_months) || 0) - paidCount);
  return {
    loan: { id: loan.id, lender_names: loan.lender_names, borrower: loan.borrower, principal: loan.principal, apr: loan.apr, term_months: loan.term_months, start_date: loan.start_date, monthly_payment: loan.monthly_payment, status: loan.status, signed_at: loan.signed_at, signature: loan.signature, note: loan.note },
    payments: ledger.payments,
    balance: ledger.balance,
    payments_made: paidCount,
    payments_remaining: nextDue
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  if (!SERVICE_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'SUPA_SERVICE_KEY not set' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) }; }
  const action = body.action;
  const adminOk = !ACCESS_KEY || (event.headers['x-personal-key'] || event.headers['X-Personal-Key']) === ACCESS_KEY;

  try {
    // ── Borrower e-signs the contract (token-gated) ──
    if (action === 'sign') {
      if (!body.sign_token || !body.signature) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'sign_token + signature required' }) };
      const r = await sb('personal_loans?sign_token=eq.' + encodeURIComponent(body.sign_token) + '&select=*&limit=1', { method: 'GET' });
      const rows = await r.json();
      if (!rows.length) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Invalid link' }) };
      const loan = rows[0];
      if (loan.signed_at) return { statusCode: 200, headers: cors, body: JSON.stringify({ alreadySigned: true }) };
      await sb('personal_loans?id=eq.' + loan.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ signature: String(body.signature).slice(0, 200), signed_at: new Date().toISOString(), status: 'active' }) });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    // ── Lender read-only view (token-gated) ──
    if (action === 'lender_view') {
      if (!body.view_token) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'view_token required' }) };
      const r = await sb('personal_loans?view_token=eq.' + encodeURIComponent(body.view_token) + '&select=*&limit=1', { method: 'GET' });
      const rows = await r.json();
      if (!rows.length) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Invalid link' }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(await loadLoanBundle(rows[0])) };
    }

    // ── Admin actions (gated by PERSONAL_ACCESS_KEY) ──
    if (!adminOk) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Unauthorized' }) };

    // Fetch (and lazily initialize tokens for) the single active loan
    const lr = await sb('personal_loans?order=created_at.desc&limit=1&select=*', { method: 'GET' });
    const loans = lr.ok ? await lr.json() : [];
    if (!loans.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ loan: null }) };
    let loan = loans[0];
    // Lazily mint tokens the first time so the sign/lender links exist.
    if (!loan.sign_token || !loan.view_token) {
      const patch = {};
      if (!loan.sign_token) patch.sign_token = newToken();
      if (!loan.view_token) patch.view_token = newToken();
      await sb('personal_loans?id=eq.' + loan.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      loan = Object.assign(loan, patch);
    }

    if (action === 'add_payment') {
      const amount = Number(body.amount);
      if (!(amount > 0)) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'amount required' }) };
      await sb('personal_loan_payments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ loan_id: loan.id, amount: round2(amount), paid_on: body.paid_on || new Date().toISOString().slice(0, 10), is_extra: !!body.is_extra, note: body.note || null }) });
      const bundle = await loadLoanBundle(loan);
      if (bundle.balance <= 0 && loan.status !== 'paid_off') { await sb('personal_loans?id=eq.' + loan.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'paid_off' }) }); bundle.loan.status = 'paid_off'; }
      return { statusCode: 200, headers: cors, body: JSON.stringify(bundle) };
    }

    if (action === 'get') {
      const bundle = await loadLoanBundle(loan);
      bundle.sign_token = loan.sign_token;
      bundle.view_token = loan.view_token;
      return { statusCode: 200, headers: cors, body: JSON.stringify(bundle) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
