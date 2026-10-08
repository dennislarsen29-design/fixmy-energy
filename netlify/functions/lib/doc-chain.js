// The signing chain that follows a customer approving their proposal:
//   proposal approved -> CPUC guide (rep signs first) -> customer signs CPUC ->
//   Participate -> SDCP enrollment -> Tesla SDCP -> SDG&E interconnection (each only if it applies
//   to the option the customer approved AND its field placement has been confirmed).
// Documents whose template isn't confirmed yet are skipped and Dennis is told, once.
const notify = require('./notify');

const ORDER = ['participate_customer_agreement', 'sdcp_enrollment_form', 'tesla_sdcp', 'sdge_interconnect_battery', 'sdge_interconnect_pv_ess', 'sdge_check'];
const LABEL = {
  participate_customer_agreement: 'Participate agreement', sdcp_enrollment_form: 'SDCP enrollment form', tesla_sdcp: 'Tesla SDCP agreement',
  sdge_check: 'SDG&E interconnection (couldn\'t tell battery-only from PV+storage — pick it by hand)', sdge_interconnect_battery: 'SDG&E interconnection (battery only)', sdge_interconnect_pv_ess: 'SDG&E interconnection (PV + storage)', cpuc_guide: 'CPUC guide'
};

function acceptedOption(proposal) {
  const p = typeof proposal === 'string' ? safeParse(proposal) : proposal;
  if (!p || !Array.isArray(p.options)) return null;
  return p.options.find(function (o) { return o && o.id === p.accepted_option; }) || null;
}
function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// Total added panels across the option's line items; null when a panel line exists but its count can't be read.
function panelCount(items) {
  let total = 0;
  for (const l of items) {
    if (!/panel|420w/i.test(l.name) && l.id !== 'panel_addon_420w') continue;
    if (/powerwall|battery|expansion/i.test(l.name) && !/panel/i.test(l.name)) continue;
    const m = l.name.match(/\((\d+)\)\s*(?:420|tesla)/i) || l.name.match(/(\d+)\s*[×x]\s*(?:420|tesla)/i) || l.name.match(/panels?\s*[×x]\s*(\d+)/i) || l.name.match(/[×x]\s*(\d+)/i);
    if (!m) return null;
    total += parseInt(m[1], 10);
  }
  return total;
}

// Which downstream documents apply to the approved option. Pure; tested.
function applicableDocs(customer, opt) {
  if (!customer || customer.lead_category === 'new_solar' || !opt) return [];
  const items = (opt.line_items || []).map(function (l) { return { id: String((l && l.id) || ''), name: String((l && l.name) || '') }; });
  const hasBattery = items.some(function (l) { return /powerwall|battery|tesla pw|tpw3|pw3|expansion/i.test(l.name); });
  const out = [];
  if (opt.participate || opt.participate_price) out.push('participate_customer_agreement');
  if ((opt.sdcp_rebate || 0) > 0) { out.push('sdcp_enrollment_form'); out.push('tesla_sdcp'); }
  if (hasBattery) {
    // Dennis's rule (2026-10-08): a Powerwall 3 plus 0-4 added panels does NOT change the customer's NEM
    // status, so it uses the battery-only SDG&E form. Five or more panels is a new system -> PV+ESS form.
    const n = panelCount(items);
    out.push(n === null ? 'sdge_check' : (n <= 4 ? 'sdge_interconnect_battery' : 'sdge_interconnect_pv_ess'));
  }
  return ORDER.filter(function (d) { return out.indexOf(d) > -1; });
}

// Issue every applicable, confirmed document to the customer (status 'reviewed' = ready to sign) and
// alert the owner about any that are skipped. Never throws.
async function issueNext(ctx, customer) {
  const { doFetch, H, SUPA_URL } = ctx;
  const res = { issued: [], skipped: [] };
  try {
    const opt = acceptedOption(customer.proposal);
    const docs = applicableDocs(customer, opt);
    if (!docs.length) return res;
    const tr = await doFetch(SUPA_URL + '/rest/v1/document_templates?doc_type=in.(' + docs.join(',') + ')&select=doc_type,confirmed', { headers: H });
    const tj = await tr.json().catch(function () { return []; });
    const confirmed = {}; (Array.isArray(tj) ? tj : []).forEach(function (t) { confirmed[t.doc_type] = !!t.confirmed; });
    const now = new Date().toISOString();
    for (const d of docs) {
      if (!confirmed[d]) { res.skipped.push(d); continue; }
      const r = await doFetch(SUPA_URL + '/rest/v1/deal_documents?on_conflict=customer_id,doc_type', {
        method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=ignore-duplicates,return=representation' }),
        body: JSON.stringify({ customer_id: customer.id, doc_type: d, status: 'reviewed', reviewed_by_rep_name: 'Issued electronically', reviewed_at: now, data: { auto_issued: true } })
      });
      const j = await r.json().catch(function () { return []; });
      if (r.ok && Array.isArray(j) && j.length) res.issued.push(d);
    }
    if (res.skipped.length) await alertOwner(ctx, customer, res.skipped);
  } catch (e) { console.warn('doc-chain issueNext failed', e.message); }
  return res;
}

async function ownerPhones(ctx, customer) {
  const { doFetch, H, SUPA_URL } = ctx;
  const ids = ['tech4'].concat(customer && customer.rep_id && customer.rep_id !== 'tech4' ? [customer.rep_id] : []);
  const r = await doFetch(SUPA_URL + '/rest/v1/team_members?id=in.(' + ids.map(encodeURIComponent).join(',') + ')&select=id,name,phone', { headers: H });
  const j = await r.json().catch(function () { return []; });
  return Array.isArray(j) ? j.filter(function (t) { return t.phone; }) : [];
}

async function alertOwner(ctx, customer, skipped) {
  try {
    const { doFetch, H, SUPA_URL } = ctx;
    const key = 'chain_skip_' + customer.id;
    const pr = await doFetch(SUPA_URL + '/rest/v1/pipeline_state?key=eq.' + key + '&select=key', { headers: H });
    const pj = await pr.json().catch(function () { return []; });
    if (Array.isArray(pj) && pj.length) return; // already told
    const name = ((customer.first_name || '') + ' ' + (customer.last_name || '')).trim() || 'A customer';
    const msg = name + ' finished the CPUC guide. Still manual (field placement not confirmed): ' + skipped.map(function (d) { return LABEL[d] || d; }).join(', ') + '. Confirm them in Administration → Document Signer to automate.';
    const t = (await ownerPhones(ctx, { id: customer.id }))[0];
    if (t) await notify.sendSms({ phone: t.phone, first_name: t.name }, msg, doFetch);
    await doFetch(SUPA_URL + '/rest/v1/pipeline_state', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ key: key, value: JSON.stringify({ skipped: skipped, ts: Date.now() }), updated_at: new Date().toISOString() }) });
  } catch (e) { /* ignore */ }
}

module.exports = { panelCount, applicableDocs, acceptedOption, issueNext, ownerPhones, LABEL };
