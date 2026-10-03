// Customer signs a portal document (CPUC guide, Tesla SDCP, any Document Signer upload).
//
// 2026-10-03, per Dennis — "foremost security on signatures". Until now the customer's signature
// was written straight from the browser into deal_documents with the public anon key: no IP, no
// user agent, a client-chosen timestamp, and nothing stopping anyone holding the anon key from
// marking a document signed. This function is now the ONLY way a customer signature is recorded:
//   1. verifies the caller is that customer (id + the portal access code — the same credential
//      the magic link carries), server-side with the service-role key;
//   2. only signs a document the rep already reviewed (status 'reviewed'), and only once — the
//      write is conditional on status=reviewed so a double-tap/replay can't re-sign;
//   3. strictly validates the signature mark (typed in a known font, or a real PNG);
//   4. stamps the audit trail from values the browser cannot choose — IP, user agent, server
//      clock — plus SHA-256 fingerprints of the signature, initials, and the exact PDF template
//      that was shown, all stored in deal_documents.data.audit.
// ENV: SUPA_SERVICE_KEY. (SITE URL for the optional template hash comes from Netlify's URL env.)
const crypto = require('crypto');
const sigAudit = require('./lib/sig-audit');

const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const cors = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const out = (code, obj) => ({ statusCode: code, headers: cors, body: JSON.stringify(obj) });

// Same credential rules as the customer portal login (portal.html): the portal code is the
// access_code or the phone number, compared as typed or as normalized 10 digits.
function normPhone(p) {
  let d = String(p || '').replace(/[^0-9]/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if (d.length > 11) d = d.slice(-10);
  return d;
}
function codeMatches(code, cust) {
  const n = normPhone(code);
  return (n.length >= 10 && n === normPhone(cust.phone)) ||
         (n.length >= 10 && n === normPhone(cust.access_code)) ||
         safeEqual(code, cust.access_code) || safeEqual(code, cust.phone);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// {fieldId: true|false|'N/A'|short string} only, bounded.
function cleanInitials(raw) {
  const o = {};
  if (!raw || typeof raw !== 'object') return o;
  Object.keys(raw).slice(0, 60).forEach(function (k) {
    if (!/^[A-Za-z0-9_\-]{1,40}$/.test(k)) return;
    const v = raw[k];
    if (typeof v === 'boolean') o[k] = v;
    else if (typeof v === 'string') o[k] = v.trim().slice(0, 12);
  });
  return o;
}

exports.handler = async function (event, context, deps) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return out(405, { error: 'Method Not Allowed' });

  const KEY = process.env.SUPA_SERVICE_KEY;
  if (!KEY) return out(500, { error: 'Server misconfigured' });
  const doFetch = (deps && deps.fetch) || fetch;
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

  let body;
  try { body = JSON.parse(event.body); } catch (e) { return out(400, { error: 'Invalid JSON' }); }
  const { customerId, accessCode, docType } = body;
  if (!customerId || !accessCode || !docType) return out(400, { error: 'customerId, accessCode and docType required' });
  if (!/^[0-9a-fA-F-]{36}$/.test(String(customerId)) || !/^[A-Za-z0-9_\-]{1,60}$/.test(String(docType))) return out(400, { error: 'Bad id' });

  const name = String(body.name || '').trim();
  if (name.length < 2 || name.length > 120) return out(400, { error: 'Printed name required' });
  const signatureData = sigAudit.validateSignatureData(body.signatureData);
  if (!signatureData) return out(400, { error: 'Invalid signature' });
  const initials = cleanInitials(body.initials);

  // 1. Who is this? (id + portal access code, compared in constant time)
  const cResp = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + customerId + '&select=id,access_code,phone&limit=1', { headers: H });
  const cRows = await cResp.json().catch(function () { return null; });
  const cust = Array.isArray(cRows) && cRows[0];
  if (!cust || !codeMatches(String(accessCode), cust)) return out(403, { error: 'Not authorized' });

  // 2. The rep must have reviewed it first, and it must not already be signed.
  const dResp = await doFetch(SUPA_URL + '/rest/v1/deal_documents?customer_id=eq.' + customerId + '&doc_type=eq.' + encodeURIComponent(docType) + '&select=*&limit=1', { headers: H });
  const dRows = await dResp.json().catch(function () { return null; });
  const row = Array.isArray(dRows) && dRows[0];
  if (!row) return out(409, { error: 'This document is not ready for your signature yet.' });
  if (row.status === 'signed') return out(409, { error: 'Already signed.' });
  if (row.status !== 'reviewed') return out(409, { error: 'This document is not ready for your signature yet.' });

  // Which exact template was shown (best effort — never blocks signing).
  let template = null;
  try {
    const tResp = await doFetch(SUPA_URL + '/rest/v1/document_templates?doc_type=eq.' + encodeURIComponent(docType) + '&select=pdf_path,updated_at,confirmed&limit=1', { headers: H });
    const tRows = await tResp.json();
    const t = Array.isArray(tRows) && tRows[0];
    if (t) {
      template = { pdf_path: t.pdf_path || null, updated_at: t.updated_at || null, pdf_sha256: null };
      const site = process.env.URL || 'https://fixmy.energy';
      if (t.pdf_path && /^\/?[A-Za-z0-9_\-./]+\.pdf$/.test(t.pdf_path)) {
        try {
          const pr = await doFetch(site + (t.pdf_path.charAt(0) === '/' ? '' : '/') + t.pdf_path);
          if (pr && pr.ok) template.pdf_sha256 = crypto.createHash('sha256').update(Buffer.from(await pr.arrayBuffer())).digest('hex');
        } catch (e) { /* hash is a bonus */ }
      }
    }
  } catch (e) { /* ignore */ }

  const signedAt = new Date().toISOString(); // server clock
  const audit = {
    signed_at: signedAt,
    ip: sigAudit.clientIp(event),
    user_agent: sigAudit.userAgent(event),
    printed_name: name,
    signature_sha256: sigAudit.signatureFingerprint(signatureData),
    initials_sha256: sigAudit.sha256(JSON.stringify(initials)),
    template: template,
    reviewed_by: row.reviewed_by_rep_name || null,
    reviewed_at: row.reviewed_at || null
  };
  const display = signatureData.type === 'typed' ? signatureData.text : name;
  const data = Object.assign({}, row.data || {}, { customer_signature: signatureData, audit: audit });

  // 3. Conditional write — only flips a row that is STILL 'reviewed' (no double-sign race).
  const wResp = await doFetch(SUPA_URL + '/rest/v1/deal_documents?id=eq.' + row.id + '&status=eq.reviewed', {
    method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'signed', initials: initials, signature: display, signed_by_name: name, signed_at: signedAt, updated_at: signedAt, data: data })
  });
  if (!wResp.ok) {
    const detail = await wResp.text().catch(function () { return ''; });
    console.error('doc-sign: write failed', wResp.status, detail.slice(0, 200));
    return out(502, { error: 'Could not record your signature. Please try again.' });
  }
  const written = await wResp.json().catch(function () { return []; });
  if (!Array.isArray(written) || !written.length) return out(409, { error: 'Already signed.' });

  console.log('doc-sign: signed', docType, 'for', customerId, 'ip', audit.ip);
  return out(200, { ok: true, signed_at: signedAt });
};
