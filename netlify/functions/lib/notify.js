// Direct customer notifications — SMS (GHL Conversations API, same path ghl-diag-agreement.js and
// sign-complete.js already use) and email (Resend, same sender rep-onboard.js uses). NO GHL workflow
// is involved, so nothing here can silently "fail to enroll"; every call returns what really
// happened. (2026-10-04, per Dennis — "fix the SMS & Email automation to send document right to the
// customer".) ENV: GHL_API_KEY, RESEND_API_KEY, optional GHL_SMS_FROM_NUMBER.
const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_LOC = 'gXWwbOVymY0iRfj7c1It';
const SITE = 'https://fixmy.energy';

function digits(p) { return String(p || '').replace(/\D/g, ''); }
function toE164(raw) {
  const d = digits(raw);
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
  return d.length >= 10 ? '+' + d : null;
}
function maskPhone(p) { const d = digits(p); return d.length >= 4 ? '•••-•••-' + d.slice(-4) : ''; }
function maskEmail(e) {
  const m = String(e || '').match(/^(.)([^@]*)(@.+)$/);
  return m ? m[1] + '•••' + m[3] : '';
}
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')) && !/@pending\.fixmy\.energy$/i.test(String(e)); }

// Same link the portal's "Copy Link" builds: email + access code (or phone digits).
function magicLink(c) {
  if (!c.email || !validEmail(c.email)) return SITE + '/portal';
  return SITE + '/portal?email=' + encodeURIComponent(c.email) + '&code=' + encodeURIComponent(c.access_code || digits(c.phone));
}

async function sendSms(c, message, doFetch) {
  doFetch = doFetch || fetch;
  const key = process.env.GHL_API_KEY;
  const phone = toE164(c.phone);
  if (!phone) return { ok: false, reason: 'no_phone' };
  if (!key) return { ok: false, reason: 'ghl_not_configured' };
  const H = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Version: '2021-07-28' };
  let contactId;
  try {
    const u = await doFetch(GHL_BASE + '/contacts/upsert', {
      method: 'POST', headers: H,
      body: JSON.stringify({ locationId: GHL_LOC, phone, email: validEmail(c.email) ? c.email : undefined, firstName: c.first_name || undefined, lastName: c.last_name || undefined })
    });
    const ud = await u.json().catch(function () { return {}; });
    if (!u.ok) return { ok: false, reason: 'ghl_contact_http_' + u.status };
    contactId = ud.contact && ud.contact.id;
  } catch (e) { return { ok: false, reason: 'ghl_contact_error' }; }
  if (!contactId) return { ok: false, reason: 'ghl_no_contact_id' };
  try {
    const body = { type: 'SMS', contactId, message, locationId: GHL_LOC, toNumber: phone };
    if (process.env.GHL_SMS_FROM_NUMBER) body.fromNumber = process.env.GHL_SMS_FROM_NUMBER;
    const r = await doFetch(GHL_BASE + '/conversations/messages', { method: 'POST', headers: Object.assign({}, H, { Version: '2021-04-15' }), body: JSON.stringify(body) });
    if (!r.ok) { const t = await r.text().catch(function () { return ''; }); console.error('notify sms http', r.status, t.slice(0, 200)); return { ok: false, reason: 'ghl_sms_http_' + r.status }; }
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'ghl_sms_error' }; }
}

function emailHtml(heading, lines, cta) {
  const p = lines.map(function (l) { return '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#333;">' + l + '</p>'; }).join('');
  const btn = cta ? '<p style="margin:22px 0;"><a href="' + cta.url + '" style="background:#8DC63F;color:#111;text-decoration:none;font-weight:800;padding:14px 26px;border-radius:100px;display:inline-block;">' + cta.label + '</a></p>' : '';
  return '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f4f1ea;font-family:Helvetica,Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;"><tr><td style="background:#8DC63F;height:6px;"></td></tr><tr><td style="padding:28px 30px;">' +
    '<div style="font-size:12px;letter-spacing:.08em;color:#777;text-transform:uppercase;margin-bottom:10px;">Solar Review</div>' +
    '<h1 style="margin:0 0 16px;font-size:22px;color:#111;">' + heading + '</h1>' + p + btn +
    '<p style="margin:18px 0 0;font-size:12px;color:#888;">Questions? Call (619) 777-6527.</p></td></tr></table></td></tr></table></body></html>';
}

async function sendEmail(c, subject, heading, lines, cta, doFetch) {
  doFetch = doFetch || fetch;
  const key = process.env.RESEND_API_KEY;
  if (!validEmail(c.email)) return { ok: false, reason: 'no_email' };
  if (!key) return { ok: false, reason: 'resend_not_configured' };
  try {
    const r = await doFetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Solar Review <info@fixmy.energy>', to: [c.email], subject, html: emailHtml(heading, lines, cta) })
    });
    if (!r.ok) { const t = await r.text().catch(function () { return ''; }); console.error('notify email http', r.status, t.slice(0, 200)); return { ok: false, reason: 'resend_http_' + r.status }; }
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'resend_error' }; }
}

// Both channels, independently — one failing never blocks the other.
async function sendBoth(c, sms, mail, doFetch) {
  const [s, e] = await Promise.all([
    sendSms(c, sms, doFetch),
    sendEmail(c, mail.subject, mail.heading, mail.lines, mail.cta, doFetch)
  ]);
  return { ok: !!(s.ok || e.ok), sms: s, email: e, sent_to: { phone: maskPhone(c.phone), email: validEmail(c.email) ? maskEmail(c.email) : '' } };
}

module.exports = { toE164, maskPhone, maskEmail, validEmail, magicLink, sendSms, sendEmail, sendBoth, digits, SITE };
