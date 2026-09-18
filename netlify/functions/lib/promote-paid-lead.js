// Promote a paid FixMy lead to a Diagnostic Job — server-side mirror of the
// portal's saveLeadEditor auto-conversion ("Invoice = Paid IS the sale",
// 2026-07-18 per Dennis). Found 2026-09-18 via Becky Phan: her $499.99 GHL
// payment landed through the server-side payment sweep, which set
// invoice_status='paid' but never touched sold_type — so she stayed a Lead
// forever and was invisible on Cosmic's Ops portal (loadOpsDashboard filters
// .not('sold_type','is',null)). The client-side conversion only ever runs when
// an admin happens to re-save the lead in the editor, so any payment recorded
// purely server-side (GHL webhook, nightly reconcile sweep, GHL status
// trigger) left a paid customer stranded as a lead.
//
// Shared by ghl-payment-sync.js, ghl-payments-reconcile-background.js, and
// ghl-status-update.js — one implementation, not three copies, per the
// standing "built in one place, not the other" drift rule in CLAUDE.md.
// (sign-complete.js already sets sold_type itself and is not changed to use
// this — it also writes agreement/signature fields in the same atomic PATCH.)
//
// Safety is in the PostgREST filters, not in a read-then-write race:
//   - sold_type=is.null       → never touches an already-sold job (battery
//                               retrofit, monitoring, new_solar all preserved)
//   - lead_category not NS    → a New Solar lead is never converted to a
//                               'diagnostic' job by a payment (its sold_type
//                               derives from solar_status instead); NULL
//                               lead_category counts as FixMy, same as the
//                               portal's own "fixmyLeads = not new_solar" rule
// A no-match PATCH is a clean no-op, so calling this on every 'paid' write is
// idempotent and safe.

async function promotePaidLeadToDiagnostic(restUrl, headers, customerId, paidAtIso) {
  if (!customerId) return { promoted: false, reason: 'no customer id' };
  try {
    const filter = '/customers?id=eq.' + encodeURIComponent(customerId) +
      '&sold_type=is.null' +
      '&or=(lead_category.eq.fixmy,lead_category.is.null)';
    const resp = await fetch(restUrl + filter, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        sold_type: 'diagnostic',
        // sold_at feeds the payroll pay-date math — use the real payment time
        // when the caller has it, else now.
        sold_at: paidAtIso || new Date().toISOString()
      })
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.warn('promote-paid-lead: PATCH failed', resp.status, detail.slice(0, 200));
      return { promoted: false, reason: 'http_' + resp.status };
    }
    const rows = await resp.json().catch(() => []);
    const promoted = Array.isArray(rows) && rows.length > 0;
    if (promoted) console.log('promote-paid-lead: converted lead', customerId, 'to sold_type=diagnostic');
    return { promoted };
  } catch (e) {
    // Never let the promotion break the payment write it rides along with.
    console.warn('promote-paid-lead:', e.message);
    return { promoted: false, reason: e.message };
  }
}

module.exports = { promotePaidLeadToDiagnostic };
