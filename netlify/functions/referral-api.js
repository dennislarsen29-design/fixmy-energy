// Referral program API (2026-11-03). Origin-allowlisted like the other internal functions.
//   rates                                   -> the payout table
//   my {email, code}                        -> a customer's own Refer & Earn map (same credentials as the portal login)
//   match_lead {customer_id, raw, assign}   -> link a typed "who referred you?" to a customer (unique match only)
//   candidates {customer_id}                -> names of the possible matches for a lead that needs review (staff)
//   set_referrer {customer_id, referrer_id} -> staff picks the referrer by hand ("" clears it)
const R = require('./lib/referrals');
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://fixmy.energy' };
const out = (c, o) => ({ statusCode: c, headers: cors, body: JSON.stringify(o) });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.handler = async function (event, context, deps) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: Object.assign({}, cors, { 'Access-Control-Allow-Headers': 'Content-Type' }), body: '' };
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (origin && !/^https:\/\/(www\.)?fixmy\.energy$|\.netlify\.app$/.test(origin)) return out(403, { error: 'forbidden' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  if (b.action === 'rates') return out(200, { ok: true, rates: R.RATES, w9_threshold: R.W9_THRESHOLD });
  const db = R.client(deps);
  if (!db.key) return out(500, { error: 'not configured' });
  try {
    if (b.action === 'my') {
      const email = String(b.email || '').trim(), code = String(b.code || '').trim();
      if (!email || !code) return out(400, { error: 'missing credentials' });
      const rows = await db.get('/customers?email=ilike.' + encodeURIComponent(email) + '&archived=is.false&select=id,access_code,phone&limit=5').catch(() => []);
      const all = rows.length ? rows : await db.get('/customers?email=ilike.' + encodeURIComponent(email) + '&select=id,access_code,phone&limit=5');
      const me = all.find(c => (c.access_code && c.access_code === code) || (R.digits10(c.phone) && R.digits10(c.phone) === R.digits10(code) && code.replace(/\D/g, '').length >= 10));
      if (!me) return out(403, { error: 'not found' });
      return out(200, Object.assign({ ok: true }, await R.mapFor(db, me.id)));
    }
    if (!UUID.test(String(b.customer_id || ''))) return out(400, { error: 'bad customer id' });
    if (b.action === 'match_lead') {
      const r = await R.linkReferral(db, b.customer_id, b.raw, { assign: b.assign === true });
      return out(200, r);
    }
    if (b.action === 'candidates') {
      const lead = (await db.get('/customers?id=eq.' + b.customer_id + '&select=referral_match'))[0];
      const ids = ((lead && lead.referral_match && lead.referral_match.candidates) || []).filter(x => UUID.test(x));
      if (!ids.length) return out(200, { ok: true, candidates: [] });
      const rows = await db.get('/customers?id=in.(' + ids.join(',') + ')&select=id,first_name,last_name,address,phone');
      return out(200, { ok: true, candidates: rows.map(r => ({ id: r.id, name: ((r.first_name || '') + ' ' + (r.last_name || '')).trim(), address: String(r.address || '').split(',').slice(-2).join(',').trim(), phone_last4: R.digits10(r.phone).slice(-4) })) });
    }
    if (b.action === 'set_referrer') {
      const rid = String(b.referrer_id || '');
      if (!rid) { await db.send('PATCH', '/customers?id=eq.' + b.customer_id, { referred_by_customer_id: null, referral_match: null }, 'return=minimal'); return out(200, { ok: true, cleared: true }); }
      if (!UUID.test(rid) || rid === b.customer_id) return out(400, { error: 'bad referrer' });
      const ref = (await db.get('/customers?id=eq.' + rid + '&select=id,first_name,last_name'))[0];
      if (!ref) return out(404, { error: 'referrer not found' });
      // The referral must not loop back on itself (A refers B refers A).
      const up = await R.ancestors(db, rid, 50);
      if (up.some(a => a.id === b.customer_id)) return out(400, { error: 'That would make a loop.' });
      await db.send('PATCH', '/customers?id=eq.' + b.customer_id, { referred_by_customer_id: rid, referral_match: { status: 'linked', via: 'staff', at: new Date().toISOString() } }, 'return=minimal');
      await R.ensureCode(db, rid);
      return out(200, { ok: true });
    }
    return out(400, { error: 'unknown action' });
  } catch (e) { console.warn('[referral-api]', e.message); return out(500, { error: 'Something went wrong.' }); }
};
