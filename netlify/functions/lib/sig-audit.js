// Shared signature validation + audit-trail helpers (2026-10-03).
// Used by sign-complete.js, sign-fallback.js (Sign & Pay) and doc-sign.js (portal documents)
// so every signing path records the SAME evidence, server-side, from values the browser
// cannot choose: IP, user agent, signing time, and SHA-256 fingerprints.
const crypto = require('crypto');

// The Diagnostic agreement's terms live in assets/diag-agreement.js (one source, shared with
// sign.html and the PDF). Required lazily so a bundling problem can't break unrelated paths.
let _diag = null;
function diag() {
  if (_diag) return _diag;
  require('../../../assets/diag-agreement.js'); // sets globalThis.DIAG_AGREEMENT
  _diag = globalThis.DIAG_AGREEMENT;
  return _diag;
}

const FONT_ALLOW = [
  "'Brush Script MT','Segoe Script',cursive",
  "'Lucida Handwriting','Apple Chancery',cursive",
  "'Segoe Print','Comic Sans MS',cursive",
  "'Bradley Hand','Herculanum',cursive"
];
const MAX_PNG_DATAURL = 250000; // ~180KB of PNG; a real 460x160 signature is ~5-20KB

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

// Netlify sets x-nf-client-connection-ip itself (the real peer); x-forwarded-for is a
// fallback only — a client can prepend values to it.
function clientIp(event) {
  const h = (event && event.headers) || {};
  return String(h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || h['client-ip'] || 'unknown').trim() || 'unknown';
}
function userAgent(event) {
  return String(((event && event.headers) || {})['user-agent'] || 'unknown').slice(0, 400);
}

// Returns a normalized {type,...} or null if it isn't a well-formed signature. Strict on
// purpose: this value is rendered into pages and PDFs later, so only known shapes pass.
function validateSignatureData(sd) {
  if (!sd || typeof sd !== 'object') return null;
  if (sd.type === 'typed') {
    const text = String(sd.text || '').trim();
    if (!text || text.length > 80) return null;
    if (FONT_ALLOW.indexOf(sd.fontFamily) === -1) return null;
    return { type: 'typed', text, fontFamily: sd.fontFamily };
  }
  if (sd.type === 'drawn') {
    const u = String(sd.dataUrl || '');
    if (u.length > MAX_PNG_DATAURL || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(u)) return null;
    // PNG magic bytes — a base64 string that isn't actually a PNG is rejected.
    const head = Buffer.from(u.slice('data:image/png;base64,'.length, 'data:image/png;base64,'.length + 16), 'base64');
    if (head.length < 4 || head[0] !== 0x89 || head[1] !== 0x50 || head[2] !== 0x4e || head[3] !== 0x47) return null;
    return { type: 'drawn', dataUrl: u };
  }
  return null;
}

// Initials use the same marks as signatures (typed in a known style, or drawn) but typed text is
// capped at 6 chars. Returns the normalized mark, or null.
function validateInitialsData(sd) {
  const v = validateSignatureData(sd);
  if (!v) return null;
  if (v.type === 'typed' && v.text.length > 6) return null;
  return v;
}
// The short text stored in customers.repair_auth_initial (older readers/PDF line print it).
function initialsText(v, fallback) {
  if (v) return v.type === 'typed' ? v.text : '(drawn)';
  return fallback ? String(fallback).trim().slice(0, 10) : null;
}

// Fingerprint of the exact Diagnostic Agreement text in force at signing time.
function diagTermsFingerprint(signedAtIso) {
  const A = diag();
  const cap = A.capFor(signedAtIso);
  const sections = A.sectionsFor(cap);
  return { cap, sha256: sha256(JSON.stringify({ cap, sections, fee: A.FEE_NOTICE })) };
}

function signatureFingerprint(sd) {
  return sha256(sd.type === 'drawn' ? sd.dataUrl : sd.type + '|' + sd.text + '|' + sd.fontFamily);
}

module.exports = { sha256, clientIp, userAgent, validateSignatureData, validateInitialsData, initialsText, diagTermsFingerprint, signatureFingerprint, FONT_ALLOW };
