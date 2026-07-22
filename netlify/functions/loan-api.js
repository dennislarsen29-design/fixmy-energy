// Service-role gateway for the personal loan module (Cody Larsen & Casey Larsen → Dennis).
// personal_loans / personal_loan_payments are RLS-deny; only this function (service role)
// can read/write them. Admin actions are gated by PERSONAL_ACCESS_KEY (like personal-api.js);
// borrower/lender signing + the read-only lender view are gated by unguessable tokens instead.
//
// Three independent signers on one loan: borrower (Dennis) + lender1 (Cody) + lender2 (Casey),
// each with their own sign_token/signature/signed_at. "Fully signed" = all three have signed —
// that's what gates the PDF download on the sign/view pages.
//
// Actions (POST { action, ... }):
//   get           (admin)  → loan + payments + balance + signer/collateral bundle + all tokens
//   update        (admin)  → { collateral_description?, collateral_value?, lender1_name?, lender2_name? }
//   add_payment   (admin)  → { amount, paid_on, is_extra, note } → inserts, recomputes
//   get_by_token  (token)  → resolves which signer a sign_token belongs to; loan terms + signer statuses
//   sign          (token)  → { sign_token, signature } → records that signer's signature
//   lender_view   (token)  → { view_token } → read-only loan + payments + signer/collateral bundle

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
function enc(s) { return encodeURIComponent(s); }

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

// The three-signer shape shared by admin/get, get_by_token, and lender_view — one source
// of truth for "who has signed" and "is everyone done" (which gates the PDF download).
function signerBundle(loan) {
  const signers = [{ role: 'borrower', name: loan.borrower, signed_at: loan.signed_at || null }];
  if (loan.lender1_name) signers.push({ role: 'lender1', name: loan.lender1_name, signed_at: loan.lender1_signed_at || null });
  if (loan.lender2_name) signers.push({ role: 'lender2', name: loan.lender2_name, signed_at: loan.lender2_signed_at || null });
  return {
    signers,
    fully_signed: signers.every(s => !!s.signed_at),
    collateral_description: loan.collateral_description || null,
    collateral_value: loan.collateral_value || null,
  };
}

async function loadLoanBundle(loan) {
  const pr = await sb('personal_loan_payments?loan_id=eq.' + loan.id + '&select=*&order=paid_on.asc', { method: 'GET' });
  const payments = pr.ok ? await pr.json() : [];
  const ledger = computeLedger(loan, payments);
  const paidCount = payments.length;
  const nextDue = Math.max(0, (Number(loan.term_months) || 0) - paidCount);
  return {
    loan: {
      id: loan.id, lender_names: loan.lender_names, borrower: loan.borrower, principal: loan.principal, apr: loan.apr,
      term_months: loan.term_months, start_date: loan.start_date, monthly_payment: loan.monthly_payment, status: loan.status,
      signed_at: loan.signed_at, signature: loan.signature, note: loan.note,
      lender1_name: loan.lender1_name || null, lender2_name: loan.lender2_name || null,
      collateral_description: loan.collateral_description || null, collateral_value: loan.collateral_value || null
    },
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
    // ── Any of the 3 signers loads the agreement + their own sign status (token-gated) ──
    if (action === 'get_by_token') {
      const tok = body.token;
      if (!tok) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'token required' }) };
      const r = await sb('personal_loans?or=(sign_token.eq.' + enc(tok) + ',lender1_sign_token.eq.' + enc(tok) + ',lender2_sign_token.eq.' + enc(tok) + ')&select=*&limit=1', { method: 'GET' });
      const rows = await r.json();
      if (!rows.length) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Invalid link' }) };
      const loan = rows[0];
      let role = 'borrower';
      if (loan.lender1_sign_token === tok) role = 'lender1';
      else if (loan.lender2_sign_token === tok) role = 'lender2';
      const bundle = signerBundle(loan);
      bundle.role = role;
      bundle.my_name = role === 'borrower' ? loan.borrower : role === 'lender1' ? loan.lender1_name : loan.lender2_name;
      bundle.my_signed = role === 'borrower' ? !!loan.signed_at : role === 'lender1' ? !!loan.lender1_signed_at : !!loan.lender2_signed_at;
      bundle.loan = { principal: loan.principal, apr: loan.apr, term_months: loan.term_months, monthly_payment: loan.monthly_payment, borrower: loan.borrower, lender_names: loan.lender_names };
      return { statusCode: 200, headers: cors, body: JSON.stringify(bundle) };
    }

    // ── A signer (borrower or either lender) signs — token resolves which slot ──
    if (action === 'sign') {
      if (!body.sign_token || !body.signature) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'sign_token + signature required' }) };
      const tok = body.sign_token;
      const r = await sb('personal_loans?or=(sign_token.eq.' + enc(tok) + ',lender1_sign_token.eq.' + enc(tok) + ',lender2_sign_token.eq.' + enc(tok) + ')&select=*&limit=1', { method: 'GET' });
      const rows = await r.json();
      if (!rows.length) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Invalid link' }) };
      const loan = rows[0];
      const sig = String(body.signature).slice(0, 200);
      const now = new Date().toISOString();
      let role = null, alreadySigned = false, patch = {};
      if (loan.sign_token === tok) { role = 'borrower'; if (loan.signed_at) alreadySigned = true; else patch = { signature: sig, signed_at: now }; }
      else if (loan.lender1_sign_token === tok) { role = 'lender1'; if (loan.lender1_signed_at) alreadySigned = true; else patch = { lender1_signature: sig, lender1_signed_at: now }; }
      else if (loan.lender2_sign_token === tok) { role = 'lender2'; if (loan.lender2_signed_at) alreadySigned = true; else patch = { lender2_signature: sig, lender2_signed_at: now }; }
      if (alreadySigned) return { statusCode: 200, headers: cors, body: JSON.stringify({ alreadySigned: true, role: role }) };

      const merged = Object.assign({}, loan, patch);
      const required = [merged.signed_at, merged.lender1_name ? merged.lender1_signed_at : true, merged.lender2_name ? merged.lender2_signed_at : true];
      const allSigned = required.every(Boolean);
      patch.status = allSigned ? 'active' : 'partially_signed';
      await sb('personal_loans?id=eq.' + loan.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, role: role, fully_signed: allSigned }) };
    }

    // ── Lender read-only view (token-gated) ──
    if (action === 'lender_view') {
      if (!body.view_token) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'view_token required' }) };
      const r = await sb('personal_loans?view_token=eq.' + enc(body.view_token) + '&select=*&limit=1', { method: 'GET' });
      const rows = await r.json();
      if (!rows.length) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Invalid link' }) };
      const loan = rows[0];
      const bundle = await loadLoanBundle(loan);
      Object.assign(bundle, signerBundle(loan));
      return { statusCode: 200, headers: cors, body: JSON.stringify(bundle) };
    }

    // ── Admin actions (gated by PERSONAL_ACCESS_KEY) ──
    if (!adminOk) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Unauthorized' }) };

    // Fetch (and lazily initialize tokens for) the single active loan
    const lr = await sb('personal_loans?order=created_at.desc&limit=1&select=*', { method: 'GET' });
    const loans = lr.ok ? await lr.json() : [];
    if (!loans.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ loan: null }) };
    let loan = loans[0];
    // Lazily mint tokens the first time so the sign/lender links exist — one per signer.
    const tokenPatch = {};
    if (!loan.sign_token) tokenPatch.sign_token = newToken();
    if (!loan.view_token) tokenPatch.view_token = newToken();
    if (loan.lender1_name && !loan.lender1_sign_token) tokenPatch.lender1_sign_token = newToken();
    if (loan.lender2_name && !loan.lender2_sign_token) tokenPatch.lender2_sign_token = newToken();
    if (Object.keys(tokenPatch).length) {
      await sb('personal_loans?id=eq.' + loan.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(tokenPatch) });
      loan = Object.assign(loan, tokenPatch);
    }

    if (action === 'update') {
      const patch = {};
      ['collateral_description', 'collateral_value', 'lender1_name', 'lender2_name'].forEach(k => { if (k in body) patch[k] = body[k]; });
      if (!Object.keys(patch).length) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Nothing to update' }) };
      await sb('personal_loans?id=eq.' + loan.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
      loan = Object.assign(loan, patch);
      // Newly-named lender may need a fresh sign token
      const patch2 = {};
      if (loan.lender1_name && !loan.lender1_sign_token) patch2.lender1_sign_token = newToken();
      if (loan.lender2_name && !loan.lender2_sign_token) patch2.lender2_sign_token = newToken();
      if (Object.keys(patch2).length) { await sb('personal_loans?id=eq.' + loan.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch2) }); loan = Object.assign(loan, patch2); }
      const bundle = await loadLoanBundle(loan);
      Object.assign(bundle, signerBundle(loan));
      bundle.sign_token = loan.sign_token; bundle.view_token = loan.view_token;
      bundle.lender1_sign_token = loan.lender1_sign_token || null; bundle.lender2_sign_token = loan.lender2_sign_token || null;
      return { statusCode: 200, headers: cors, body: JSON.stringify(bundle) };
    }

    if (action === 'add_payment') {
      const amount = Number(body.amount);
      if (!(amount > 0)) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'amount required' }) };
      await sb('personal_loan_payments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ loan_id: loan.id, amount: round2(amount), paid_on: body.paid_on || new Date().toISOString().slice(0, 10), is_extra: !!body.is_extra, note: body.note || null }) });
      const bundle = await loadLoanBundle(loan);
      Object.assign(bundle, signerBundle(loan));
      if (bundle.balance <= 0 && loan.status !== 'paid_off') { await sb('personal_loans?id=eq.' + loan.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'paid_off' }) }); bundle.loan.status = 'paid_off'; }
      return { statusCode: 200, headers: cors, body: JSON.stringify(bundle) };
    }

    if (action === 'get') {
      const bundle = await loadLoanBundle(loan);
      Object.assign(bundle, signerBundle(loan));
      bundle.sign_token = loan.sign_token;
      bundle.view_token = loan.view_token;
      bundle.lender1_sign_token = loan.lender1_sign_token || null;
      bundle.lender2_sign_token = loan.lender2_sign_token || null;
      return { statusCode: 200, headers: cors, body: JSON.stringify(bundle) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
