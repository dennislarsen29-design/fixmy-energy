// W-9 collection (2026-10-28, per Dennis). Team members fill it in the portal; the TIN is encrypted at rest.
//  submit    {member_id, code, form, signature}  — verifies the member's access code (so a stolen browser session can't file one)
//  status    {member_id}                         — non-sensitive: has a W-9, when, last 4 of TIN
//  admin_get {admin_key, member_id}              — decrypted form for building the PDF (needs W9_ADMIN_KEY; every read is logged)
// ENV: SUPA_SERVICE_KEY, W9_ENC_KEY (any long random string), W9_ADMIN_KEY (admin download password)
const crypto = require('crypto');
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://fixmy.energy' };
const out = (c, o) => ({ statusCode: c, headers: cors, body: JSON.stringify(o) });
const CLASSES = ['individual', 'c_corp', 's_corp', 'partnership', 'trust_estate', 'llc', 'other'];
const encKey = () => crypto.createHash('sha256').update(String(process.env.W9_ENC_KEY || '')).digest();
function encrypt(obj) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', encKey(), iv); const b = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]); return [iv, c.getAuthTag(), b].map(x => x.toString('base64')).join('.'); }
function decrypt(s) { const [iv, tag, b] = String(s).split('.').map(x => Buffer.from(x, 'base64')); const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv); d.setAuthTag(tag); return JSON.parse(Buffer.concat([d.update(b), d.final()]).toString('utf8')); }
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: Object.assign({}, cors, { 'Access-Control-Allow-Headers': 'Content-Type' }), body: '' };
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (origin && !/^https:\/\/(www\.)?fixmy\.energy$|\.netlify\.app$/.test(origin)) return out(403, { error: 'forbidden' });
  const K = process.env.SUPA_SERVICE_KEY; if (!K) return out(500, { error: 'not configured' });
  if (!process.env.W9_ENC_KEY) return out(500, { error: 'W-9 storage is not configured yet (W9_ENC_KEY).' });
  const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  const id = String(b.member_id || '');
  const get = async p => { const r = await doFetch(SUPA + p, { headers: H }); const j = await r.json().catch(() => []); return Array.isArray(j) ? j : []; };
  const audit = a => doFetch(SUPA + '/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: 'w9_access_' + Date.now() + '_' + id, value: JSON.stringify(a), updated_at: new Date().toISOString() }) }).catch(() => {});

  if (b.action === 'status') {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) return out(400, { error: 'bad id' });
    const r = (await get('/w9_forms?member_id=eq.' + encodeURIComponent(id) + '&select=signed_at,tin_last4,name'))[0];
    return out(200, { ok: true, submitted: !!r, signed_at: r && r.signed_at, tin_last4: r && r.tin_last4 });
  }

  if (b.action === 'admin_get') {
    const ak = process.env.W9_ADMIN_KEY;
    if (!ak || !b.admin_key || !same(ak, b.admin_key)) return out(403, { error: 'Wrong admin password.' });
    const r = (await get('/w9_forms?member_id=eq.' + encodeURIComponent(id) + '&select=data_enc'))[0];
    if (!r) return out(404, { error: 'No W-9 on file.' });
    await audit({ action: 'admin_get', member_id: id, at: new Date().toISOString(), ip: event.headers && (event.headers['x-nf-client-connection-ip'] || '') });
    try { return out(200, { ok: true, form: decrypt(r.data_enc) }); } catch (e) { return out(500, { error: 'Could not decrypt.' }); }
  }

  if (b.action === 'submit') {
    const m = (await get('/team_members?id=eq.' + encodeURIComponent(id) + '&active=eq.true&select=id,name,code'))[0];
    if (!m) return out(404, { error: 'Member not found' });
    let code = m.code;
    const pc = (await get('/portal_credentials?rep_id=eq.' + encodeURIComponent(id) + '&select=code'))[0];
    if (pc && pc.code) code = pc.code;
    if (!b.code || !code || !same(code, b.code)) return out(403, { error: 'Access code incorrect.' });
    const f = b.form || {};
    const tin = String(f.tin || '').replace(/\D/g, '');
    const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const clean = { name: str(f.name, 120), business: str(f.business, 120), cls: str(f.cls, 20), llc_class: str(f.llc_class, 2).toUpperCase(), other_text: str(f.other_text, 60),
      exempt_payee: str(f.exempt_payee, 10), fatca: str(f.fatca, 10), address: str(f.address, 120), city_state_zip: str(f.city_state_zip, 120), tin_type: f.tin_type === 'ein' ? 'ein' : 'ssn', tin };
    if (!clean.name) return out(400, { error: 'Enter your name.' });
    if (CLASSES.indexOf(clean.cls) === -1) return out(400, { error: 'Choose a tax classification.' });
    if (clean.cls === 'llc' && !/^[CSP]$/.test(clean.llc_class)) return out(400, { error: 'LLC needs a tax class: C, S or P.' });
    if (!clean.address || !clean.city_state_zip) return out(400, { error: 'Enter your address.' });
    if (tin.length !== 9) return out(400, { error: 'Your SSN or EIN must be 9 digits.' });
    if (!f.certify) return out(400, { error: 'Please confirm the certification.' });
    const sg = b.signature || {};
    let sig;
    if (sg.type === 'drawn' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sg.dataUrl || '') && sg.dataUrl.length < 250000) sig = { type: 'drawn', dataUrl: sg.dataUrl };
    else if (sg.type === 'typed' && str(sg.text, 80)) sig = { type: 'typed', text: str(sg.text, 80), fontFamily: str(sg.fontFamily, 80) };
    else return out(400, { error: 'Please sign.' });
    const now = new Date().toISOString();
    const aud = { ip: (event.headers && (event.headers['x-nf-client-connection-ip'] || '')) || '', user_agent: String((event.headers && event.headers['user-agent']) || '').slice(0, 300), signed_at: now, verified_by: 'access_code' };
    const row = { member_id: id, name: clean.name, tin_last4: tin.slice(-4), data_enc: encrypt({ form: clean, signature: sig, signed_at: now }), audit: aud, signed_at: now, updated_at: now };
    const r = await doFetch(SUPA + '/w9_forms', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(row) });
    if (!r.ok) return out(500, { error: 'Could not save.' });
    await doFetch(SUPA + '/team_members?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=minimal' }), body: JSON.stringify({ w9_signed_at: now }) });
    return out(200, { ok: true, tin_last4: tin.slice(-4) });
  }
  return out(400, { error: 'unknown action' });
};
