// Sign & Pay for single-product options (inverter swap / SMA sourced inverter etc.) — no CPUC guide.
// POST { action:'issue',    customerId, optionId, code?, send? }  -> mints a link (token stored in customers.proposal.sign_pay)
//      { action:'init',     token, method }                       -> customer, option, agreement context + Stripe PaymentIntent
//      { action:'complete', token, paymentIntentId, signature, signatureData } -> verifies payment, records signature + acceptance
// The price ALWAYS comes from the saved proposal option, never from the caller. The token is only handed back to a caller who
// proves the portal code (the customer); otherwise it is texted/emailed to the contact on file. Diagnostic-fee fields
// (invoice_status, agreement_*) are never touched.
const crypto = require('crypto');
const notify = require('./lib/notify');
const sigAudit = require('./lib/sig-audit');
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const CARD_PCT = 0.039;
const out = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(o) });
function normPhone(p) { let d = String(p || '').replace(/[^0-9]/g, ''); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1); if (d.length > 10) d = d.slice(-10); return d; }
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }
function codeMatches(code, c) { const n = normPhone(code); return (n.length >= 10 && (n === normPhone(c.phone) || n === normPhone(c.access_code))) || safeEqual(String(code || '').trim(), c.access_code); }
function parse(p) { if (!p) return null; if (typeof p === 'string') { try { return JSON.parse(p); } catch (e) { return null; } } return p; }
function hasBattery(o) { return ((o && (o.line_items || o.lineItems)) || []).some(function (li) { return li && (li.id === 'pw3_retrofit' || li.id === 'pw3_expansion_pack' || /powerwall|pw3/i.test(li.name || '')); }); }
function itemNames(o) { return ((o && (o.line_items || o.lineItems)) || []).filter(function (li) { return li && li.id !== 'diagnostic_credit' && !(Number(li.price) < 0); }).map(function (li) { return String(li.name || '').replace(/\s*×1\s*$/, '').trim(); }).filter(Boolean); }
function cents(o) { return Math.round((parseFloat(o.price) || 0) * 100); }
function agreement() { require('../../assets/equip-agreement.js'); return globalThis.EQUIP_AGREEMENT; }
function ctxFor(c, o) { return { title: o.title, items: itemNames(o), address: c.address, warranty: !!o.warranty, priceText: '$' + (cents(o) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) }; }

exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  if (event.httpMethod === 'OPTIONS') return out(200, {});
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  const SK = process.env.SUPA_SERVICE_KEY, STRIPE = process.env.STRIPE_SECRET_KEY;
  if (!SK) return out(500, { error: 'not configured' });
  const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  const SEL = 'id,first_name,last_name,email,phone,address,access_code,rep_id,lead_category,proposal,disposition_exit,sold_type,sold_at,dx_outcome';
  const load = async (filter) => { const r = await doFetch(SUPA_URL + '/rest/v1/customers?' + filter + '&select=' + SEL + '&limit=1', { headers: H }); const rows = await r.json().catch(function () { return null; }); return Array.isArray(rows) && rows[0]; };
  const save = (id, patch) => doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id, { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify(patch) });
  const A = agreement();

  if (b.action === 'issue') {
    const id = String(b.customerId || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return out(400, { error: 'missing fields' });
    const c = await load('id=eq.' + id); if (!c) return out(404, { error: 'not found' });
    const prop = parse(c.proposal); if (!prop || !Array.isArray(prop.options)) return out(409, { error: 'No proposal' });
    const o = prop.options.find(function (x) { return x && x.id === b.optionId; });
    if (!o) return out(404, { error: 'Option not found' });
    if (hasBattery(o)) return out(409, { error: 'This option uses the document flow, not Sign & Pay' });
    if (!(cents(o) > 0)) return out(409, { error: 'Option has no price' });
    if (prop.status === 'accepted') return out(409, { error: 'A proposal option was already accepted' });
    const sp = prop.sign_pay;
    if (sp && sp.issued_at && Date.now() - new Date(sp.issued_at).getTime() < 90 * 1000 && sp.option_id === o.id && !b.code) return out(429, { error: 'A link was just sent. Give it a minute.' });
    const token = crypto.randomBytes(18).toString('hex');
    const sign_pay = { token, option_id: o.id, amount_cents: cents(o), title: o.title || '', issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() };
    const fresh = await load('id=eq.' + id); const cur = parse(fresh && fresh.proposal) || prop;
    const r = await save(id, { proposal: Object.assign({}, cur, { sign_pay }) });
    if (!r.ok) return out(502, { error: 'Could not save the link' });
    const url = notify.SITE + '/equip-sign?t=' + token;
    let sent = null;
    if (b.send !== false) {
      const first = c.first_name || 'there';
      sent = await notify.sendBoth(c,
        'Hi ' + first + ', your Solar Review agreement for "' + (o.title || 'your upgrade') + '" is ready to sign and pay: ' + url + ' Reply STOP to opt out.',
        { subject: 'Your Solar Review agreement is ready to sign', heading: 'Ready to sign and pay', lines: ['Hi ' + first + ', your agreement for <b>' + (o.title || 'your upgrade') + '</b> is ready.', o.warranty ? 'The replacement part is covered by the manufacturer\'s warranty. Review, sign and pay the service fee on the next page.' : 'Review it, sign, and pay on the next page. Your diagnostic fee credit is already applied.'], cta: { url, label: 'Review, sign and pay' } }, doFetch);
    }
    const mayReveal = !!(b.code && codeMatches(b.code, c));
    return out(200, { ok: true, sent: sent && { ok: sent.ok, sent_to: sent.sent_to }, url: mayReveal ? url : undefined });
  }

  // init / complete both start from the token
  const token = String(b.token || '');
  if (!/^[0-9a-f]{20,}$/i.test(token)) return out(400, { error: 'token required' });
  const lr = await doFetch(SUPA_URL + '/rest/v1/customers?proposal->sign_pay->>token=eq.' + token + '&select=' + SEL + '&limit=1', { headers: H });
  const lrows = await lr.json().catch(function () { return null; });
  const c = Array.isArray(lrows) && lrows[0];
  if (!c) return out(404, { error: 'Invalid or expired link' });
  const prop = parse(c.proposal); const sp = prop && prop.sign_pay;
  if (!sp || !safeEqual(sp.token, token)) return out(404, { error: 'Invalid or expired link' });
  const o = (prop.options || []).find(function (x) { return x && x.id === sp.option_id; });
  if (!o) return out(404, { error: 'Option not found' });
  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim();
  if (sp.completed_at || (prop.status === 'accepted' && prop.accepted_option === o.id)) return out(200, { alreadyComplete: true, customerName: name, title: o.title });
  if (sp.expires_at && new Date(sp.expires_at) < new Date()) return out(410, { error: 'This link has expired. Please contact us for a new one.' });
  const amountCents = cents(o);
  if (amountCents !== sp.amount_cents) return out(409, { error: 'The price changed after this link was sent. Please contact us for a new one.' });

  if (b.action === 'init') {
    if (!STRIPE) return out(500, { error: 'not configured' });
    const total = amountCents + Math.round(amountCents * CARD_PCT);
    const params = new URLSearchParams({ amount: total, currency: 'usd', 'payment_method_types[]': 'card', description: 'Solar Review — ' + (o.title || 'equipment replacement') + ' — ' + name,
      'metadata[customer_id]': c.id, 'metadata[token]': token, 'metadata[kind]': 'equip', 'metadata[option_id]': o.id });
    if (validEmail(c.email)) params.set('receipt_email', c.email);
    const pr = await doFetch('https://api.stripe.com/v1/payment_intents', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(STRIPE + ':').toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const pi = await pr.json().catch(function () { return {}; });
    if (!pi.client_secret) return out(502, { error: 'Failed to create payment', detail: pi.error && pi.error.message });
    return out(200, { clientSecret: pi.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '', customerName: name, address: c.address || '', title: o.title || '',
      amountCents, surchargeAmountCents: total - amountCents, totalAmountCents: total, warranty: !!o.warranty, agreement: { version: A.VERSION, sections: A.sectionsFor(ctxFor(c, o)) } });
  }

  if (b.action === 'complete') {
    if (!STRIPE) return out(500, { error: 'not configured' });
    const signature = String(b.signature || '').trim();
    if (!b.paymentIntentId || !signature) return out(400, { error: 'paymentIntentId and signature required' });
    let sigData = null;
    if (b.signatureData != null) { sigData = sigAudit.validateSignatureData(b.signatureData); if (!sigData) return out(400, { error: 'Invalid signature' }); }
    const pr = await doFetch('https://api.stripe.com/v1/payment_intents/' + encodeURIComponent(b.paymentIntentId), { headers: { Authorization: 'Basic ' + Buffer.from(STRIPE + ':').toString('base64') } });
    const pi = await pr.json().catch(function () { return {}; });
    if (pi.status !== 'succeeded') return out(400, { error: 'Payment not confirmed: ' + pi.status });
    if (!pi.metadata || pi.metadata.token !== token || pi.metadata.customer_id !== c.id) return out(403, { error: 'Token mismatch' });
    const paid = (pi.amount_received != null ? pi.amount_received : pi.amount) / 100;
    const signedAt = new Date().toISOString();
    const ip = sigAudit.clientIp(event), ua = sigAudit.userAgent(event);
    const terms = A.sectionsFor(ctxFor(c, o));
    const audit = { kind: o.warranty ? 'warranty_exchange' : 'equipment_agreement', version: A.VERSION, signed_at: signedAt, ip, user_agent: ua, printed_name: signature.slice(0, 120),
      terms_sha256: sigAudit.sha256(JSON.stringify(terms)), signature_sha256: sigData ? sigAudit.signatureFingerprint(sigData) : null, payment_intent: b.paymentIntentId, amount_paid: paid, method: 'card' };
    const fresh = await load('id=eq.' + c.id); const cur = parse(fresh && fresh.proposal) || prop;
    const opts = (cur.options || []).map(function (x) { return x && x.id === o.id ? Object.assign({}, x, { accepted_at: signedAt, accepted_via: 'sign_and_pay', financing: 'cash' }) : x; });
    const next = Object.assign({}, cur, { options: opts, status: 'accepted', accepted_option: o.id, financing: 'cash', accepted_via: 'sign_and_pay', accepted_at: signedAt,
      sign_pay: Object.assign({}, cur.sign_pay || sp, { completed_at: signedAt, signature: signature.slice(0, 120), signature_data: sigData, audit }) });
    const upd = { proposal: next };
    if (!c.sold_type) { upd.sold_type = 'diagnostic'; upd.sold_at = c.sold_at || signedAt; }
    if (o.warranty) upd.dx_outcome = Object.assign({}, (fresh && fresh.dx_outcome) || {}, { outcome: 'rma', paid_at: signedAt, paid_amount: paid });
    const pr2 = await save(c.id, upd);
    if (!pr2.ok) return out(502, { error: 'Payment captured but recording failed', paymentCaptured: true, customerId: c.id });
    try {
      await doFetch(SUPA_URL + '/rest/v1/payments?on_conflict=stripe_payment_intent_id', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=ignore-duplicates,return=minimal' }),
        body: JSON.stringify({ customer_id: c.id, amount: paid, currency: pi.currency || 'usd', paid_at: new Date((pi.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(), method: 'card', source: 'stripe_sign_page', stripe_payment_intent_id: b.paymentIntentId, note: 'Sign & Pay — ' + (o.title || 'equipment replacement') + ' — includes 3.9% card fee', recorded_by: 'equip-pay' }) });
    } catch (e) { console.warn('equip-pay ledger', e.message); }
    try {
      await require('./lib/staff-alert').alertStaff({ key: b.paymentIntentId, customer: c,
        sms: '{name} signed the agreement and PAID $' + paid.toFixed(2) + ' for "' + (o.title || 'the upgrade') + '". ✅ ' + (o.warranty ? 'Next: file the warranty claim (RMA).' : 'Schedule the install.'),
        subject: '{name} signed & paid $' + paid.toFixed(2), lines: ['Signed the Equipment Replacement Agreement and paid <b>$' + paid.toFixed(2) + '</b> by card for: ' + (o.title || '') + '.', o.warranty ? 'Next: file the warranty claim with the manufacturer, then book the swap. Next step on the job walks you through it.' : 'Next: schedule the work and order the equipment.'] }, doFetch);
    } catch (e) { console.warn('equip-pay alert', e.message); }
    return out(200, { ok: true, signedAt, customerName: name, title: o.title || '', paid });
  }
  return out(400, { error: 'unknown action' });
};
function validEmail(e) { return notify.validEmail(e); }
