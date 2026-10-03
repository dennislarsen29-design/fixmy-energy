/* Diagnostic Service Agreement — ONE source of truth (2026-10-03).
 *
 * The terms used to live only as hand-written HTML in sign.html. A downloadable PDF
 * needs the SAME words, so the terms now live here and are consumed by:
 *   - sign.html          renders them on the Sign & Pay page (always the CURRENT terms)
 *   - portal.html        builds the signed PDF (admin / tech / customer portals)
 * Change the wording HERE and both stay in sync. Do not copy the text anywhere else.
 *
 * Markup in a paragraph: **bold** only. {{CAP}} is replaced with the on-site repair
 * cap formatted as dollars (e.g. "$1,000").
 *
 * Repair cap history (Section 4):
 *   before 2026-10-03  $2,000   (every agreement signed up to then)
 *   from   2026-10-03  $1,000   (per Dennis)
 * A PDF for an agreement signed under the old cap must still show the $2,000 the
 * customer actually agreed to, so capFor() keys off the signed-at timestamp.
 */
(function (root) {
  var CAP_CURRENT = 1000;
  var CAP_LEGACY = 2000;
  var CAP_CHANGE_ISO = '2026-10-03T00:00:00Z';

  function capFor(signedAtIso) {
    if (!signedAtIso) return CAP_CURRENT;
    var t = new Date(signedAtIso).getTime();
    if (isNaN(t)) return CAP_CURRENT;
    return t < new Date(CAP_CHANGE_ISO).getTime() ? CAP_LEGACY : CAP_CURRENT;
  }
  function money(n) { return '$' + Number(n).toLocaleString('en-US'); }

  var SECTIONS = [
    { title: '1. Nature of Diagnostic Service', paras: [
      "This service is a professional technical assessment, directional in nature, not a guaranteed repair. Your Solar Review technician and any contractors will begin at the system's foundation (utility interconnect, main service panel, inverter, monitoring) and work systematically toward identifying the source of underperformance or failure.",
      "A diagnosis identifies probable cause(s) based on observed data. Root issues may be layered or compounding, and may require more than one visit to fully characterize.",
      "Additional visits may be required for intermittent faults, software anomalies, or concealed wiring. A separate fee may apply unless agreed in writing.",
      "Customer agrees to provide safe, unobstructed access to all system components and disclose known hazards prior to the technician's arrival."
    ]},
    { title: '2. Diagnostic Service Fee', paras: [
      "The Diagnostic Service Fee shown above covers one (1) on-site visit including: full system inspection, inverter string testing and monitoring review, production data analysis, and a findings report with recommended next steps.",
      "The fee is non-refundable once the visit is completed."
    ]},
    { title: '3. Service Fee Credit', paras: [
      "The full diagnostic fee may be credited toward a qualifying work order when the following condition is met: Customer authorizes a qualifying upgrade through Solar Review Corp — including but not limited to panel upgrade, inverter replacement, battery storage, system expansion, or remove/reroof/reinstall (Powerwall, Enphase, Franklin WH, etc.)",
      "Credit is valid for 6 months from the date of this agreement. Non-transferable and non-redeemable for cash."
    ]},
    { title: '4. On-Site Repair Authorization', paras: [
      "If Solar Review Corp's technician identifies a corrective action during the diagnostic visit that can resolve the identified issue(s) on-site — such as connection repairs, component recalibration, or minor electrical corrections — **Customer authorizes Solar Review Corp to perform such repairs without a separate written work order, provided the total repair cost does not exceed {{CAP}}.**",
      "The diagnostic fee paid will be credited in full toward any qualifying on-site repair performed during the same visit.",
      "If on-site repair costs are projected to exceed {{CAP}}, the technician will stop, document findings, and obtain written Customer authorization before proceeding.",
      "Customer agrees to pay any resulting repair invoice within **14 days** of service completion."
    ]},
    { title: '5. Limitation of Liability', paras: [
      "Solar Review Corp does not guarantee the diagnostic will identify all causes of failure. Findings represent professional judgment at the time of the visit and may change upon further investigation.",
      "Solar Review Corp is not liable for pre-existing conditions, prior faulty workmanship, or manufacturer defects discovered during the diagnostic.",
      "Solar Review Corp is not a party to, and assumes no responsibility for, any previously arranged financing agreements, solar loan agreements, power purchase agreements (PPAs), solar lease agreements, PACE obligations, or any other financial instruments entered into by the Customer with any prior solar company, lender, or financing provider. All obligations under such agreements remain solely the responsibility of the homeowner."
    ]},
    { title: '6. Governing Law', paras: [
      "This agreement is governed by the laws of the State of California. Any disputes shall first be addressed through good-faith mediation. If unresolved, disputes shall be submitted to binding arbitration under the rules of the American Arbitration Association in San Diego County, California."
    ]}
  ];

  var FEE_NOTICE = "The diagnostic fee is non-refundable once the visit is completed. Cancellations must be requested at least 48 hours in advance. A **$50 rescheduling fee** applies to appointment changes requested less than 24 hours before the scheduled visit.";

  var ESIGN = "By typing their full name, the Customer confirmed: (1) they are the Customer identified above, (2) they signed on their own personal device, and (3) they have read and agree to all terms of this agreement. This constitutes a legally binding electronic signature under the federal ESIGN Act and California UETA (Cal. Civ. Code § 1633.1 et seq.).";

  function fill(text, cap) { return String(text).replace(/\{\{CAP\}\}/g, money(cap)); }

  // Sections with {{CAP}} resolved for a given cap.
  function sectionsFor(cap) {
    return SECTIONS.map(function (s) {
      return { title: s.title, paras: s.paras.map(function (p) { return fill(p, cap); }) };
    });
  }

  // **bold** -> <strong>, with HTML escaping (used by sign.html).
  function mdToHtml(text) {
    var esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function termsHtml(cap) {
    return sectionsFor(cap).map(function (s) {
      return '<h4>' + mdToHtml(s.title) + '</h4>' + s.paras.map(function (p) { return '<p>' + mdToHtml(p) + '</p>'; }).join('');
    }).join('');
  }

  root.DIAG_AGREEMENT = {
    CAP_CURRENT: CAP_CURRENT, CAP_LEGACY: CAP_LEGACY, CAP_CHANGE_ISO: CAP_CHANGE_ISO,
    capFor: capFor, money: money, sectionsFor: sectionsFor, termsHtml: termsHtml, mdToHtml: mdToHtml,
    FEE_NOTICE: FEE_NOTICE, ESIGN: ESIGN
  };

  // ── PDF builder (pdf-lib, loaded separately from /assets/vendor/pdf-lib.min.js) ──────
  // c = customers row: first_name,last_name,address,invoice_amount,agreement_status,
  //     agreement_signature,agreement_signed_at,repair_auth_initial,agreement_ip,id
  // Returns a Uint8Array. Throws if PDFLib isn't loaded.
  root.buildDiagAgreementPdf = async function (c) {
    var PDFLib = root.PDFLib;
    if (!PDFLib) throw new Error('PDF library not loaded');
    var rgb = PDFLib.rgb, StandardFonts = PDFLib.StandardFonts;
    var pdf = await PDFLib.PDFDocument.create();
    var reg = await pdf.embedFont(StandardFonts.Helvetica);
    var bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    var ital = await pdf.embedFont(StandardFonts.TimesRomanItalic);

    var signed = c && c.agreement_status === 'signed' && c.agreement_signature;
    var cap = capFor(signed ? c.agreement_signed_at : null);
    var name = ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Customer';

    var PW = 612, PH = 792, MX = 56, MT = 60, MB = 60;
    var CW = PW - MX * 2;
    var page, y;
    var ink = rgb(0.1, 0.1, 0.1), mute = rgb(0.4, 0.4, 0.4), green = rgb(0.33, 0.55, 0.12);

    // Standard fonts only encode WinAnsi; anything else would throw. Replace safely.
    function safe(font, t) {
      var s = String(t == null ? '' : t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
      try { font.encodeText(s); return s; } catch (e) {
        return s.split('').map(function (ch) { try { font.encodeText(ch); return ch; } catch (e2) { return '?'; } }).join('');
      }
    }
    function newPage() { page = pdf.addPage([PW, PH]); y = PH - MT; }
    function need(h) { if (y - h < MB) newPage(); }
    function wrap(text, font, size, width) {
      var out = [], words = safe(font, text).split(/\s+/), line = '';
      words.forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= width) { line = t; }
        else { if (line) out.push(line); line = w; }
      });
      if (line) out.push(line);
      return out;
    }
    // Draw text with **bold** runs, wrapped to width.
    function richPara(text, size, width, x) {
      var tokens = []; // {w, bold}
      String(text).split(/(\*\*[^*]+\*\*)/).forEach(function (seg) {
        if (!seg) return;
        var b = /^\*\*[^*]+\*\*$/.test(seg);
        var plain = b ? seg.slice(2, -2) : seg;
        plain.split(/(\s+)/).forEach(function (p) { if (p) tokens.push({ w: p, bold: b }); });
      });
      var lead = size * 1.45, line = [], lw = 0;
      function flush() {
        if (!line.length) return;
        need(lead);
        var cx = x;
        line.forEach(function (t) {
          var f = t.bold ? bold : reg, s = safe(f, t.w);
          page.drawText(s, { x: cx, y: y - size, size: size, font: f, color: ink });
          cx += f.widthOfTextAtSize(s, size);
        });
        y -= lead; line = []; lw = 0;
      }
      tokens.forEach(function (t) {
        var f = t.bold ? bold : reg, w = f.widthOfTextAtSize(safe(f, t.w), size);
        if (/^\s+$/.test(t.w)) { if (line.length) { line.push(t); lw += w; } return; }
        if (lw + w > width && line.length) {
          while (line.length && /^\s+$/.test(line[line.length - 1].w)) line.pop();
          flush();
        }
        line.push(t); lw += w;
      });
      while (line.length && /^\s+$/.test(line[line.length - 1].w)) line.pop();
      flush();
    }
    function textLine(t, font, size, color, x) {
      need(size * 1.5);
      page.drawText(safe(font, t), { x: x == null ? MX : x, y: y - size, size: size, font: font, color: color || ink });
      y -= size * 1.5;
    }

    newPage();
    // Header
    page.drawRectangle({ x: 0, y: PH - 34, width: PW, height: 34, color: rgb(0.08, 0.08, 0.08) });
    page.drawText('SOLAR REVIEW CORP', { x: MX, y: PH - 22, size: 11, font: bold, color: rgb(0.55, 0.78, 0.25) });
    y = PH - 64;
    textLine('Diagnostic Service Agreement', bold, 20, ink);
    y -= 4;
    textLine('Customer: ' + name, reg, 10.5, ink);
    if (c.address) wrap('Property: ' + c.address, reg, 10.5, CW).forEach(function (l) { textLine(l, reg, 10.5, ink); });
    var fee = c.invoice_amount != null && c.invoice_amount !== '' ? Number(c.invoice_amount) : NaN;
    if (!isNaN(fee)) textLine('Diagnostic Service Fee: $' + fee.toFixed(2), reg, 10.5, ink);
    y -= 8;
    page.drawLine({ start: { x: MX, y: y }, end: { x: PW - MX, y: y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) });
    y -= 14;

    // Terms (as signed: cap depends on signing date)
    sectionsFor(cap).forEach(function (s) {
      need(40);
      y -= 4;
      textLine(s.title, bold, 11, ink);
      s.paras.forEach(function (p) { richPara(p, 9.5, CW, MX); y -= 3; });
      y -= 4;
    });
    need(60);
    richPara(FEE_NOTICE, 9, CW, MX);
    y -= 10;

    // Signature block
    need(190);
    page.drawLine({ start: { x: MX, y: y }, end: { x: PW - MX, y: y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) });
    y -= 18;
    textLine('SIGNATURE', bold, 9, mute);
    y -= 2;
    if (signed) {
      textLine('Section 4 — On-site repair authorization initials (up to ' + money(cap) + '):  ' + (c.repair_auth_initial || '—'), reg, 9.5, ink);
      y -= 6;
      need(40);
      page.drawText(safe(ital, c.agreement_signature), { x: MX, y: y - 22, size: 24, font: ital, color: rgb(0.1, 0.2, 0.45) });
      y -= 34;
      page.drawLine({ start: { x: MX, y: y }, end: { x: MX + 260, y: y }, thickness: 0.5, color: ink });
      y -= 12;
      textLine('Signed electronically by ' + c.agreement_signature, reg, 9, mute);
      if (c.agreement_signed_at) {
        var d = new Date(c.agreement_signed_at);
        textLine('Signed ' + d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'short' }) + ' (Pacific)', reg, 9, mute);
      }
      if (c.agreement_ip) textLine('IP address: ' + c.agreement_ip, reg, 9, mute);
      textLine('Reference: ' + String(c.id || '').replace(/-/g, '').slice(-10).toUpperCase(), reg, 9, mute);
      y -= 6;
      wrap(ESIGN, reg, 8, CW).forEach(function (l) { textLine(l, reg, 8, mute); });
    } else {
      textLine('NOT YET SIGNED — this copy shows the terms only.', bold, 10, rgb(0.7, 0.25, 0.1));
      y -= 20;
      page.drawLine({ start: { x: MX, y: y }, end: { x: MX + 260, y: y }, thickness: 0.5, color: ink });
      y -= 12;
      textLine('Customer signature', reg, 9, mute);
    }

    // Footer on every page
    var pages = pdf.getPages();
    pages.forEach(function (p, i) {
      p.drawText('Solar Review Corp  ·  License #: 117450  ·  (619) 777-6527  ·  fixmy.energy  ·  San Diego, CA     Page ' + (i + 1) + ' of ' + pages.length,
        { x: MX, y: 30, size: 8, font: reg, color: mute });
    });
    pdf.setTitle('Diagnostic Service Agreement - ' + name);
    pdf.setAuthor('Solar Review Corp');
    return await pdf.save();
  };
})(typeof window !== 'undefined' ? window : globalThis);
