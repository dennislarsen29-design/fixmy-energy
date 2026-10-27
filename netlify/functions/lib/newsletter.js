// Newsletter list helpers (2026-10-27). Unsubscribe links are stateless: HMAC(id) so no token is stored.
const crypto = require('crypto');
const SITE = 'https://fixmy.energy';
function secret() { return process.env.SIGN_OTP_SECRET || process.env.SUPA_SERVICE_KEY || ''; }
function token(id) { return crypto.createHmac('sha256', secret()).update('newsletter|' + id).digest('hex').slice(0, 32); }
function valid(id, t) {
  const a = Buffer.from(token(id)), b = Buffer.from(String(t || ''));
  return secret() && a.length === b.length && crypto.timingSafeEqual(a, b);
}
function unsubscribeUrl(id) { return SITE + '/.netlify/functions/newsletter-unsubscribe?id=' + encodeURIComponent(id) + '&t=' + token(id); }
module.exports = { token, valid, unsubscribeUrl };
