// POST /.netlify/functions/proposal-accepted  { customerId, code }
// Called by the customer's proposal page right after they approve. Opens the CPUC guide for our rep
// to sign (the customer can't sign until the rep has) and texts the assigned rep + Dennis the link.
const crypto = require('crypto');
const notify = require('./lib/notify');
const chain = require('./lib/doc-chain');

const SUPA_URL = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const out = (code, o) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
function normPhone(p) { let d = String(p || '').replace(/[^0-9]/g, ''); if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1); if (d.length > 11) d = d.slice(-10); return d; }
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); }
function codeMatches(code, c) { const n = normPhone(code); return (n.length >= 10 && n === normPhone(c.phone)) || (n.length >= 10 && n === normPhone(c.access_code)) || safeEqual(code, c.access_code) || safeEqual(code, c.phone); }

exports.handler = async function (event, context, deps) {
  const doFetch = (deps && deps.fetch) || fetch;
  const SK = process.env.SUPA_SERVICE_KEY;
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  if (!SK) return out(500, { error: 'not configured' });
  const H = { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' };
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
  const id = String(b.customerId || ''); const code = String(b.code || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !code) return out(400, { error: 'missing fields' });

  const r = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id + '&select=id,first_name,last_name,phone,email,access_code,rep_id,lead_category,proposal,sold_type,step,sold_at,br_revenue,br_redline&limit=1', { headers: H });
  const rows = await r.json().catch(function () { return null; });
  const c = Array.isArray(rows) && rows[0];
  if (!c || !codeMatches(code, c)) return out(403, { error: 'Not authorized' });
  const prop = typeof c.proposal === 'string' ? (function () { try { return JSON.parse(c.proposal); } catch (e) { return null; } })() : c.proposal;
  if (!prop || prop.status !== 'accepted') return out(409, { error: 'Proposal is not approved' });
  // Axia/QCells leads that went through the Internal Tool (Cosmic new system) follow the same chain.
  if (c.lead_category === 'new_solar' && !(prop.options && prop.options.length)) return out(200, { ok: true, skipped: 'axia' });

  // Battery sale -> switch the lead to Battery Retrofit accounting automatically (Revenue = the option's
  // System Price before Participate, Redline = its dealer cost). Same result as the admin's "Convert to
  // Battery Retrofit" button, minus the typing. Only when the option really has a Powerwall line, both
  // numbers exist, nothing is already entered, and the lead isn't already a battery/monitoring/Axia job.
  let batteryConverted = null;
  try {
    const aopt = chain.acceptedOption(prop);
    const items = (aopt && (aopt.line_items || aopt.lineItems)) || [];
    const hasBattery = items.some(function (li) { return li && (li.id === 'pw3_retrofit' || li.id === 'pw3_expansion_pack' || /powerwall|pw3/i.test(li.name || '')); });
    const rev = aopt ? parseFloat(aopt.price) : 0, red = aopt ? parseFloat(aopt.redline) : 0;
    if (hasBattery && c.lead_category !== 'new_solar' && (!c.sold_type || c.sold_type === 'diagnostic') && !c.br_revenue && !c.br_redline) {
      if (rev > 0 && red > 0) {
        const patch = { sold_type: 'battery_retrofit', br_revenue: rev, br_redline: red };
        if (!c.sold_at) patch.sold_at = new Date().toISOString();
        if ((parseInt(c.step) || 1) < 6) patch.step = 6;
        const pr = await doFetch(SUPA_URL + '/rest/v1/customers?id=eq.' + id + '&br_revenue=is.null&or=(sold_type.is.null,sold_type.eq.diagnostic)', {
          method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify(patch) });
        const done = await pr.json().catch(function () { return []; });
        if (pr.ok && Array.isArray(done) && done.length) batteryConverted = { revenue: rev, redline: red };
      } else batteryConverted = { skipped: 'missing price or dealer cost on the accepted option' };
    }
  } catch (e) {}

  // Open the CPUC guide for the rep. ignore-duplicates: a second call (refresh/replay) changes nothing and doesn't re-text.
  const ins = await doFetch(SUPA_URL + '/rest/v1/deal_documents?on_conflict=customer_id,doc_type', {
    method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify({ customer_id: id, doc_type: 'cpuc_guide', status: 'pending', data: { opened_by: 'proposal_approval', at: new Date().toISOString() } })
  });
  const created = await ins.json().catch(function () { return []; });
  if (!ins.ok) return out(502, { error: 'Could not open the document' });
  if (!Array.isArray(created) || !created.length) return out(200, { ok: true, already: true, batteryConverted });

  const name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'A customer';
  const opt = chain.acceptedOption(prop);
  const label = (opt && (opt.title || opt.name)) || 'their proposal';
  const link = 'https://fixmy.energy/portal?signdoc=' + id;
  const msg = '✅ ' + name + ' approved ' + label + '. The customer can sign first or after you \u2014 sign the CPUC guide here: ' + link + (batteryConverted && batteryConverted.revenue ? '\nSet up as a Battery Retrofit: Revenue $' + batteryConverted.revenue.toLocaleString() + ', Redline $' + batteryConverted.redline.toLocaleString() + ' (from the proposal).' : (batteryConverted && batteryConverted.skipped ? '\nBattery sale, but the proposal has no dealer cost \u2014 use Convert to Battery Retrofit on the lead.' : ''));
  const ctx = { doFetch, H, SUPA_URL };
  let texted = 0;
  try { for (const t of await chain.ownerPhones(ctx, c)) { const s = await notify.sendSms({ phone: t.phone, first_name: t.name }, msg, doFetch); if (s.ok) texted++; } } catch (e) {}
  // Tell the customer too: they can sign now or wait for the Tech — either order works.
  let customerNotified = false;
  try {
    const link = notify.magicLink(c);
    const first = (c.first_name || 'there').trim();
    const r2 = await notify.sendBoth(c,
      'Hi ' + first + '! Thanks for approving your proposal. Your documents are ready \u2014 you can sign now, or wait and your Tech will sign first and text you. Either order works: ' + link + '\nQuestions? Call (619) 777-6527.',
      { subject: 'Your Solar Review documents are ready', heading: 'Thanks for approving, ' + first, lines: ['Your paperwork is ready in your portal. <b>Either order works</b> \u2014 sign now, or wait for your Tech to sign first and we will text you.'], cta: { url: link, label: 'Open my documents' } }, doFetch);
    customerNotified = !!(r2 && r2.ok);
  } catch (e) {}
  return out(200, { ok: true, created: true, texted, customerNotified, batteryConverted });
};
