// GHL payments reconciliation sweep — the safety net that makes missed
// webhooks impossible to lose money to. Pulls transactions from the GHL
// Payments API, upserts them into the payments ledger (deduped on
// ghl_transaction_id, so real-time webhook + sweep never double-count),
// recomputes invoice_status (paid/partial) per touched customer, and files
// any UNMATCHED payment into the admin Agent Inbox for manual assignment.
//
// Runs nightly (see netlify.toml, default 35-day window). For the historical
// BACKFILL (e.g. Janet Pompa), run once on demand with a wide window:
//   https://fixmy.energy/.netlify/functions/ghl-payments-reconcile-background?days=365
// (Background function — returns 202 immediately, works up to 15 min.)
//
// ENV vars required: GHL_API_KEY (private integration token — needs the
// Payments read scope ticked in GHL → Settings → Private Integrations),
// SUPA_SERVICE_KEY.

const SUPA_URL  = process.env.SUPABASE_URL || 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'gXWwbOVymY0iRfj7c1It';

function last10(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

exports.handler = async function(event) {
  const KEY = process.env.SUPA_SERVICE_KEY;
  const GHL = process.env.GHL_API_KEY;
  if (!KEY || !GHL) {
    console.error('ghl-payments-reconcile: SUPA_SERVICE_KEY / GHL_API_KEY not set');
    return { statusCode: 200, body: JSON.stringify({ skipped: 'missing env vars' }) };
  }
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const ghlHeaders = { Authorization: 'Bearer ' + GHL, Version: '2021-07-28', Accept: 'application/json' };

  const qs = (event && event.queryStringParameters) || {};
  const days = Math.min(parseInt(qs.days || '35', 10) || 35, 730);
  const since = new Date(Date.now() - days * 86400000);
  const stats = { days, fetched: 0, recorded: 0, duplicates: 0, unmatched: 0, statusUpdates: 0, errors: [] };

  // ── 1. Pull transactions from GHL Payments API (paginated) ──
  const transactions = [];
  try {
    let offset = 0;
    for (let page = 0; page < 40; page++) {
      const url = 'https://services.leadconnectorhq.com/payments/transactions?altId=' + GHL_LOCATION_ID +
        '&altType=location&limit=100&offset=' + offset +
        '&startAt=' + since.toISOString().slice(0, 10) +
        '&endAt=' + new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const resp = await fetch(url, { headers: ghlHeaders });
      const raw = await resp.text();
      if (!resp.ok) {
        stats.errors.push('GHL transactions HTTP ' + resp.status + ': ' + raw.slice(0, 200));
        console.error('ghl-payments-reconcile: transactions fetch failed', resp.status, raw.slice(0, 300));
        break;
      }
      let data;
      try { data = JSON.parse(raw); } catch(e) { stats.errors.push('bad JSON from GHL'); break; }
      const batch = data.data || data.transactions || data.rows || [];
      transactions.push(...batch);
      if (batch.length < 100) break;
      offset += 100;
    }
  } catch(e) {
    stats.errors.push('transactions pull: ' + e.message);
  }
  stats.fetched = transactions.length;
  console.log('ghl-payments-reconcile: fetched', transactions.length, 'transactions over', days, 'days');

  // ── 2. Process each successful transaction ──
  const contactCache = {};
  const touchedCustomers = new Set();

  async function findCustomer(email, phone) {
    async function q(filter) {
      const r = await fetch(SUPA_REST + '/customers?' + filter + '&select=id,first_name,last_name,invoice_amount&limit=1', { headers: H });
      if (!r.ok) return null;
      const rows = await r.json();
      return rows && rows[0] || null;
    }
    let c = null;
    if (email) c = await q('email=eq.' + encodeURIComponent(email));
    if (!c && phone) c = await q('access_code=eq.' + phone);
    if (!c && phone) c = await q('phone=ilike.*' + phone + '*');
    return c;
  }

  for (const t of transactions) {
    try {
      const status = String(t.status || t.paymentStatus || '').toLowerCase();
      if (status && !['succeeded', 'success', 'paid', 'completed', 'captured'].includes(status)) continue;

      const txnId = String(t._id || t.id || t.transactionId || '').trim();
      if (!txnId) continue;

      let amount = parseFloat(t.amount != null ? t.amount : (t.amountPaid != null ? t.amountPaid : 0));
      if (!isFinite(amount) || amount <= 0) continue;
      // Some GHL payment providers report cents; heuristic: absurdly large round values
      if (amount >= 20000 && amount % 100 === 0 && (t.currency || 'usd').toLowerCase() === 'usd' && amount / 100 <= 20000) {
        // e.g. 180000 → $1800.00 (only rescale when the cents interpretation is plausible)
        amount = amount / 100;
      }

      // Contact info: prefer the snapshot embedded in the transaction, else fetch once
      let email = null, phone = null, contactName = '';
      const snap = t.contactSnapshot || t.contact || {};
      email = String(snap.email || '').toLowerCase().trim() || null;
      phone = last10(snap.phone);
      contactName = ((snap.firstName || snap.first_name || '') + ' ' + (snap.lastName || snap.last_name || '')).trim() || snap.name || '';
      const contactId = t.contactId || t.contact_id || snap.id;
      if (!email && !phone && contactId) {
        if (!contactCache[contactId]) {
          const cr = await fetch('https://services.leadconnectorhq.com/contacts/' + contactId, { headers: ghlHeaders });
          contactCache[contactId] = cr.ok ? ((await cr.json()).contact || {}) : {};
          await new Promise(r => setTimeout(r, 120)); // GHL rate limit
        }
        const gc = contactCache[contactId];
        email = String(gc.email || '').toLowerCase().trim() || null;
        phone = last10(gc.phone);
        contactName = contactName || ((gc.firstName || '') + ' ' + (gc.lastName || '')).trim();
      }

      const cust = (email || phone) ? await findCustomer(email, phone) : null;

      const row = {
        customer_id: cust ? cust.id : null,
        amount,
        currency: (t.currency || 'usd').toLowerCase(),
        paid_at: new Date(t.createdAt || t.created_at || t.date || Date.now()).toISOString(),
        method: t.paymentMethod || t.method || t.paymentProviderType || 'card',
        source: 'ghl',
        ghl_transaction_id: txnId,
        invoice_number: t.invoiceNumber || t.invoice_number || null,
        note: cust ? null : ('UNMATCHED — ' + (contactName || '') + ' ' + (email || '') + ' ' + (phone || '')).replace(/\s+/g, ' ').trim(),
        recorded_by: 'ghl-payments-reconcile'
      };

      const ins = await fetch(SUPA_REST + '/payments?on_conflict=ghl_transaction_id', {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(row)
      });
      const insBody = await ins.text();
      if (!ins.ok) { stats.errors.push('insert ' + txnId + ': ' + insBody.slice(0, 120)); continue; }
      if (insBody && insBody !== '[]') {
        stats.recorded++;
        if (cust) {
          touchedCustomers.add(JSON.stringify({ id: cust.id, target: cust.invoice_amount, name: (cust.first_name || '') + ' ' + (cust.last_name || '') }));
        } else {
          stats.unmatched++;
          // Surface for manual assignment in the admin Agent Inbox
          await fetch(SUPA_REST + '/agent_reports', {
            method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
            body: JSON.stringify({
              agent: 'crm-dev', priority: 'high',
              title: 'Unmatched GHL payment: $' + amount + (contactName ? ' — ' + contactName : ''),
              body: 'A payment of $' + amount + ' (' + row.paid_at.slice(0, 10) + ', txn ' + txnId + ') was found in GHL but matches no portal customer.' +
                (email || phone ? ' Contact: ' + (contactName || '') + ' ' + (email || '') + ' ' + (phone || '') : '') +
                ' Open the Finance tab → Money Owed → Unmatched to assign it.'
            })
          }).catch(() => {});
        }
      } else {
        stats.duplicates++;
      }
    } catch(e) {
      stats.errors.push('txn loop: ' + e.message);
    }
  }

  // ── 3. Recompute invoice_status for every customer we touched ──
  for (const cJson of touchedCustomers) {
    try {
      const c = JSON.parse(cJson);
      const payResp = await fetch(SUPA_REST + '/payments?customer_id=eq.' + c.id + '&select=amount', { headers: H });
      const pays = payResp.ok ? await payResp.json() : [];
      const paidSum = pays.reduce((t, r) => t + (parseFloat(r.amount) || 0), 0);
      const target = parseFloat(c.target) || 0;
      const status = (!target || paidSum >= target) ? 'paid' : (paidSum > 0 ? 'partial' : null);
      if (status) {
        await fetch(SUPA_REST + '/customers?id=eq.' + c.id, {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ invoice_status: status })
        });
        stats.statusUpdates++;
        console.log('ghl-payments-reconcile:', c.name, '→', status, '($' + paidSum + (target ? ' of $' + target : '') + ')');
      }
    } catch(e) { stats.errors.push('status recompute: ' + e.message); }
  }

  console.log('ghl-payments-reconcile done:', JSON.stringify(stats));

  // Persist the run summary so the portal's Money Owed view can display it
  // (read back via payments-sync-status.js).
  try {
    await fetch(SUPA_REST + '/app_config?on_conflict=key', {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        key: 'payments_last_sync',
        value: { at: new Date().toISOString(), ...stats, errors: stats.errors.slice(0, 5) },
        updated_at: new Date().toISOString()
      })
    });
  } catch (e) { console.warn('ghl-payments-reconcile: could not persist stats —', e.message); }

  return { statusCode: 200, body: JSON.stringify(stats) };
};
