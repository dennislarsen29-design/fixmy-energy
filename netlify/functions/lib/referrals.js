// Referral program (2026-11-03, per Dennis). Customers refer friends/family; each person up the chain (3 levels)
// earns a flat amount once Solar Review has COLLECTED CASH on the referred customer's job.
//   service = diagnostic / repair / service fee   battery = Cosmic battery retrofit   system = Axia/QCells new system
// Cash rules (the "tier" a referred customer has reached):
//   service  -> a revenue row in `payments`
//   battery  -> a paid 'cosmic_*' override (Cosmic's 50% receipts to Solar Review)
//   system   -> a paid new_solar override (Axia/QCells paying Solar Review)
// A higher tier pays only the DIFFERENCE over what that person already earned for the same referral.
// Money never moves here: rows land in referral_payouts as 'owed' and are paid from Administration -> Payroll.
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const SITE = 'https://fixmy.energy';

// ⚠ Level 3 amounts are a PLACEHOLDER (Dennis gave "Etc."): confirm, then change here only.
const RATES = {
  1: { service: 50,  battery: 250, system: 500 },
  2: { service: 5,   battery: 25,  system: 100 },
  3: { service: 1,   battery: 10,  system: 25 }
};
const TIERS = ['service', 'battery', 'system'];
const W9_THRESHOLD = 600; // lifetime owed+paid at which a W-9 is required before paying

const digits10 = p => String(p || '').replace(/\D/g, '').slice(-10);
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode(rand) {
  rand = rand || Math.random;
  let s = '';
  for (let i = 0; i < 7; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
}
function esc(v) { return encodeURIComponent(String(v)); }

function client(deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const K = (deps && deps.key) || process.env.SUPA_SERVICE_KEY;
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  return {
    key: K,
    async get(path) {
      const r = await doFetch(SUPA + path, { headers: H });
      const j = await r.json().catch(() => []);
      if (!r.ok) throw new Error('GET ' + path.split('?')[0] + ' ' + r.status);
      return Array.isArray(j) ? j : [];
    },
    async send(method, path, body, prefer) {
      const r = await doFetch(SUPA + path, { method, headers: Object.assign({}, H, { Prefer: prefer || 'return=representation' }), body: body == null ? undefined : JSON.stringify(body) });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      if (!r.ok) throw new Error(method + ' ' + path.split('?')[0] + ' ' + r.status + ' ' + txt.slice(0, 160));
      return j;
    }
  };
}

const SEL = 'id,first_name,last_name,phone,email,access_code,rep_id,archived,referral_code,referred_by_customer_id,sold_type,lead_category';

async function ensureCode(db, customerId) {
  const cur = (await db.get('/customers?id=eq.' + esc(customerId) + '&select=id,referral_code'))[0];
  if (!cur) return null;
  if (cur.referral_code) return cur.referral_code;
  for (let i = 0; i < 6; i++) {
    const code = genCode();
    try {
      const rows = await db.send('PATCH', '/customers?id=eq.' + esc(customerId) + '&referral_code=is.null', { referral_code: code });
      if (rows && rows[0]) return rows[0].referral_code;
      const again = (await db.get('/customers?id=eq.' + esc(customerId) + '&select=referral_code'))[0];
      if (again && again.referral_code) return again.referral_code;
    } catch (e) { /* unique collision: try another code */ }
  }
  return null;
}

// Find who a typed referrer is. Unique match -> linked; several -> needs_review; none -> unmatched.
// Never returns another customer's contact details; the caller only gets ids.
async function findReferrer(db, raw, selfId) {
  const text = String(raw || '').trim();
  if (!text) return { status: 'none' };
  const notSelf = c => c.id !== selfId && !c.archived;
  const upper = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^[A-Z0-9]{6,8}$/.test(upper) && !/^\d+$/.test(upper)) {
    const rows = (await db.get('/customers?referral_code=eq.' + esc(upper) + '&select=' + SEL)).filter(notSelf);
    if (rows.length === 1) return { status: 'linked', id: rows[0].id, via: 'code' };
  }
  const d = digits10(text);
  if (d.length === 10 && text.replace(/\D/g, '').length >= 10) {
    const rows = (await db.get('/customers?phone=ilike.' + esc('%' + d.slice(0, 3) + '%' + d.slice(3, 6) + '%' + d.slice(6)) + '&select=' + SEL + '&limit=20')).filter(c => notSelf(c) && digits10(c.phone) === d);
    if (rows.length === 1) return { status: 'linked', id: rows[0].id, via: 'phone' };
    if (rows.length > 1) return { status: 'needs_review', candidates: rows.map(r => r.id).slice(0, 6) };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    const rows = (await db.get('/customers?email=ilike.' + esc(text) + '&select=' + SEL + '&limit=10')).filter(notSelf);
    if (rows.length === 1) return { status: 'linked', id: rows[0].id, via: 'email' };
    if (rows.length > 1) return { status: 'needs_review', candidates: rows.map(r => r.id).slice(0, 6) };
  }
  const parts = text.replace(/[^A-Za-z'\-\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0], last = parts[parts.length - 1];
    const rows = (await db.get('/customers?first_name=ilike.' + esc(first) + '&last_name=ilike.' + esc(last) + '&select=' + SEL + '&limit=10')).filter(notSelf);
    if (rows.length === 1) return { status: 'linked', id: rows[0].id, via: 'name' };
    if (rows.length > 1) return { status: 'needs_review', candidates: rows.map(r => r.id).slice(0, 6) };
  }
  return { status: 'unmatched' };
}

// Attach a typed referrer to a lead. Only a UNIQUE, non-self match is linked automatically.
// opts.assign=true (new leads): the lead goes to the referrer's rep, unless a rep was already chosen on purpose.
async function linkReferral(db, leadId, raw, opts) {
  opts = opts || {};
  const lead = (await db.get('/customers?id=eq.' + esc(leadId) + '&select=' + SEL + ',referred_by'))[0];
  if (!lead) return { ok: false, reason: 'lead_not_found' };
  if (lead.referred_by_customer_id) return { ok: true, status: 'already_linked' };
  const found = await findReferrer(db, raw, leadId);
  if (found.status === 'none') return { ok: true, status: 'none' };
  const at = new Date().toISOString();
  const patch = { referral_match: { status: found.status === 'linked' ? 'linked' : found.status, raw: String(raw).slice(0, 120), candidates: found.candidates || undefined, via: found.via, at } };
  if (!lead.referred_by) patch.referred_by = String(raw).trim().slice(0, 120);
  if (found.status === 'linked') {
    const ref = (await db.get('/customers?id=eq.' + esc(found.id) + '&select=' + SEL))[0];
    // Same person (same phone or email) = not a real referral.
    const samePhone = digits10(ref.phone) && digits10(ref.phone) === digits10(lead.phone);
    const sameEmail = ref.email && lead.email && String(ref.email).toLowerCase() === String(lead.email).toLowerCase();
    // A referral may never loop back on itself (A refers B, B refers A). Walk the WHOLE chain above the referrer.
    const above = await ancestors(db, ref.id, 50);
    if (samePhone || sameEmail) { patch.referral_match.status = 'unmatched'; patch.referral_match.note = 'same person'; }
    else if (above.some(a => a.id === leadId)) { patch.referral_match.status = 'unmatched'; patch.referral_match.note = 'loop'; }
    else {
      patch.referred_by_customer_id = ref.id;
      if (!lead.lead_source || lead.lead_source === 'inbound_web') patch.lead_source = 'referral';
      if (opts.assign && ref.rep_id && (!lead.rep_id || lead.rep_id === 'tech4')) patch.rep_id = ref.rep_id;
      await ensureCode(db, ref.id);
    }
  }
  await db.send('PATCH', '/customers?id=eq.' + esc(leadId), patch, 'return=minimal');
  return { ok: true, status: patch.referral_match.status, referrer_id: patch.referred_by_customer_id || null };
}

// Up to 3 people above this customer (level 1 = who referred them).
async function ancestors(db, customerId, max) {
  const out = []; const seen = new Set([customerId]);
  let cur = customerId;
  for (let level = 1; level <= (max || 3); level++) {
    const row = (await db.get('/customers?id=eq.' + esc(cur) + '&select=id,referred_by_customer_id'))[0];
    const up = row && row.referred_by_customer_id;
    if (!up || seen.has(up)) break;
    seen.add(up); out.push({ level, id: up }); cur = up;
  }
  return out;
}

// What cash has Solar Review collected on this customer, as the highest tier it supports.
async function tierReached(db, customerId) {
  const [pay, ovr] = await Promise.all([
    db.get('/payments?customer_id=eq.' + esc(customerId) + '&category=eq.revenue&amount=gt.0&select=id&limit=1'),
    db.get('/commissions?customer_id=eq.' + esc(customerId) + '&kind=eq.override&payee=eq.solar_review_corp&status=eq.paid&select=line,note&limit=50')
  ]);
  let tier = null;
  if (pay.length) tier = 'service';
  if (ovr.some(o => /^cosmic_/.test(String(o.note || '')))) tier = 'battery';
  if (ovr.some(o => o.line === 'new_solar')) tier = 'system';
  return tier;
}

// Create any payouts that are now earned for one referred customer. Idempotent: safe to run every few minutes.
async function settleCustomer(db, customerId) {
  const chain = await ancestors(db, customerId);
  if (!chain.length) return { created: 0 };
  const tier = await tierReached(db, customerId);
  if (!tier) return { created: 0, waiting: true };
  const me = (await db.get('/customers?id=eq.' + esc(customerId) + '&select=' + SEL))[0];
  let created = 0;
  for (const a of chain) {
    const ben = (await db.get('/customers?id=eq.' + esc(a.id) + '&select=' + SEL))[0];
    if (!ben || ben.archived) continue;
    if ((digits10(ben.phone) && digits10(ben.phone) === digits10(me.phone)) || (ben.email && me.email && ben.email.toLowerCase() === me.email.toLowerCase())) continue;
    const target = RATES[a.level][tier];
    const existing = await db.get('/referral_payouts?referred_customer_id=eq.' + esc(customerId) + '&beneficiary_customer_id=eq.' + esc(a.id) + '&level=eq.' + a.level + '&select=amount');  // voided rows still count: a void is a deliberate "do not pay", never re-earned
    const have = existing.reduce((s, r) => s + Number(r.amount || 0), 0);
    const delta = Math.round((target - have) * 100) / 100;
    if (delta <= 0) continue;
    await db.send('POST', '/referral_payouts', { referred_customer_id: customerId, beneficiary_customer_id: a.id, level: a.level, tier, amount: delta, status: 'owed' }, 'resolution=ignore-duplicates,return=minimal');
    await ensureCode(db, a.id);
    created++;
  }
  return { created, tier };
}

async function settleAll(db, limit) {
  const rows = await db.get('/customers?referred_by_customer_id=not.is.null&select=id&order=created_at.desc&limit=' + (limit || 500));
  let created = 0, errors = 0;
  for (const r of rows) {
    try { created += (await settleCustomer(db, r.id)).created; } catch (e) { errors++; console.warn('[referral-settle]', r.id, e.message); }
  }
  return { checked: rows.length, created, errors };
}

// Everything the customer portal's Refer & Earn screen needs for ONE customer.
async function mapFor(db, customerId) {
  const code = await ensureCode(db, customerId);
  const levels = [[customerId], [], [], []];
  const people = { 1: [], 2: [], 3: [] };
  for (let lvl = 1; lvl <= 3; lvl++) {
    const ids = levels[lvl - 1]; if (!ids.length) break;
    const rows = await db.get('/customers?referred_by_customer_id=in.(' + ids.map(esc).join(',') + ')&select=id,first_name,last_name,sold_type,lead_category,referred_by_customer_id,created_at&limit=200');
    for (const r of rows) {
      const pays = await db.get('/referral_payouts?referred_customer_id=eq.' + esc(r.id) + '&beneficiary_customer_id=eq.' + esc(customerId) + '&status=neq.void&select=amount,status');
      people[lvl].push({ id: r.id, name: (r.first_name || 'Friend') + (r.last_name ? ' ' + r.last_name.charAt(0) + '.' : ''), joined: r.created_at, earned: pays.reduce((s, p) => s + Number(p.amount), 0), paid: pays.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0) });
      levels[lvl].push(r.id);
    }
  }
  const all = await db.get('/referral_payouts?beneficiary_customer_id=eq.' + esc(customerId) + '&status=neq.void&select=amount,status,level');
  const owed = all.filter(p => p.status === 'owed').reduce((s, p) => s + Number(p.amount), 0);
  const paid = all.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const w9 = (await db.get('/w9_forms?member_id=eq.' + esc(customerId) + '&select=signed_at&limit=1')).length > 0;
  return { code, link: SITE + '/book?ref=' + code, rates: RATES, levels: { 1: people[1], 2: people[2], 3: people[3] }, owed, paid, w9, w9_needed: !w9 && (owed + paid) >= W9_THRESHOLD, w9_threshold: W9_THRESHOLD };
}

module.exports = { RATES, TIERS, W9_THRESHOLD, genCode, digits10, client, ensureCode, findReferrer, linkReferral, ancestors, tierReached, settleCustomer, settleAll, mapFor };
