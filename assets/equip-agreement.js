/* Equipment Replacement Agreement — used by Sign & Pay for single-product options (inverter swap, etc.).
 * ONE source of truth: equip-sign.html renders it and netlify/functions/equip-pay.js hashes it into the audit trail.
 * DRAFT wording written 2026-11-19 for Dennis's review (and counsel's, esp. the cancellation + governing-law
 * sections) BEFORE it is relied on. No warranty period is invented here: workmanship terms come "in writing".
 * Markup: plain text only. */
(function (root) {
  var VERSION = '2026-11-19-draft1';
  function isUtah(address) {
    var a = String(address || '');
    return /\bUtah\b/i.test(a) || /,\s*UT\b/i.test(a) || /\bUT\s+84\d{3}\b/i.test(a);
  }
  function sectionsFor(ctx) {
    ctx = ctx || {};
    var ut = isUtah(ctx.address);
    var items = (ctx.items && ctx.items.length) ? ctx.items.join('; ') : (ctx.title || 'the equipment and work described in your proposal');
    var price = ctx.priceText || 'the price shown above';
    return [
      { h: '1. What we will do', p: 'Solar Review Corp ("Solar Review") will supply and install, through its licensed installation contractor, the following at your property: ' + items + '. The work is the option you selected in your proposal.' },
      { h: '2. Price and payment', p: 'The total price is ' + price + ', due in full when you sign. It already includes the credit for the diagnostic fee you paid. A card payment adds a 3.9% processing fee, shown before you pay. There are no other charges unless you approve a written change in advance.' },
      { h: '3. Scheduling and access', p: 'After you sign, we will contact you to schedule the work. You agree to give our crew safe access to your property, your electrical panel and your equipment. Dates are estimates and can move for weather, parts delivery or utility requirements.' },
      { h: '4. Equipment and warranty', p: 'New equipment carries the manufacturer\'s warranty. Warranty terms for our installation workmanship will be provided to you in writing with your work order. We do not guarantee energy production or savings beyond the manufacturer\'s published specifications.' },
      { h: '5. Changes and unexpected conditions', p: 'If we find conditions that require extra work or materials, we will explain them and get your written approval and any price change before continuing. If you decline, we will stop and refund the part of your payment for work not yet performed or materials not yet ordered.' },
      { h: '6. Your right to cancel', p: 'You may cancel this agreement within three (3) business days after you sign by telling us in writing (an email or text to the contact on this page is fine) and you will receive a full refund. After that, cancellation is covered by Section 5 and by the manufacturer\'s return terms for any equipment already ordered for you.' },
      { h: '7. Electronic signature', p: 'You agree to sign electronically. Your typed or drawn signature, together with the time, device and network address recorded when you sign, is your signature on this agreement.' },
      { h: '8. Governing law', p: ut ? 'This agreement is governed by Utah law. Disputes will be handled in the courts of Salt Lake County, Utah.' : 'This agreement is governed by California law. Disputes will be handled in the courts of San Diego County, California.' }
    ];
  }
  root.EQUIP_AGREEMENT = { VERSION: VERSION, isUtah: isUtah, sectionsFor: sectionsFor };
})(typeof window !== 'undefined' ? window : globalThis);
