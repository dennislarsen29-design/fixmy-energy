/* W-9 in the portal (2026-10-28). Easy typed form -> fills the real IRS Form W-9 (assets/documents/irs-fw9.pdf).
   The server (netlify/functions/w9-api.js) stores the TIN encrypted; nothing sensitive is kept in the browser.
   API: W9.has(memberId) · W9.open({person, required, onDone}) · W9.adminRowHtml(member) · W9.adminDownload(memberId, name) */
(function (root) {
  var API = '/.netlify/functions/w9-api';
  var CLS = [['individual', 'Individual / sole proprietor', 0], ['llc', 'LLC', 5], ['s_corp', 'S corporation', 2], ['c_corp', 'C corporation', 1], ['partnership', 'Partnership', 3], ['other', 'Other', 6]];
  var st = null, libs = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function post(body) { return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); }); }
  function loadLibs() {
    if (root.PDFLib) return Promise.resolve();
    if (libs) return libs;
    libs = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = '/assets/vendor/pdf-lib.min.js'; s.onload = res; s.onerror = function () { libs = null; rej(new Error('Could not load the PDF tools.')); }; document.head.appendChild(s); });
    return libs;
  }
  // ── fill the real W-9 ──
  var P1 = 'topmostSubform[0].Page1[0].';
  function fmtDate(iso) { var d = new Date(iso || Date.now()); return ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + '/' + d.getFullYear(); }
  async function buildPdf(form, sig, signedAt) {
    await loadLibs();
    var L = root.PDFLib, bytes = await fetch('/assets/documents/irs-fw9.pdf').then(function (r) { if (!r.ok) throw new Error('W-9 template missing'); return r.arrayBuffer(); });
    var doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true }), f = doc.getForm();
    function txt(n, v) { try { f.getTextField(P1 + n).setText(String(v || '')); } catch (e) {} }
    txt('f1_1[0]', form.name); txt('f1_2[0]', form.business);
    var cb = null; CLS.forEach(function (c) { if (c[0] === form.cls) cb = c[2]; });
    if (cb != null) { try { f.getCheckBox(P1 + 'FederalClassification[0].c1_1[' + cb + ']').check(); } catch (e) {} }
    if (form.cls === 'llc') txt('FederalClassification[0].f1_3[0]', form.llc_class);
    if (form.cls === 'other') txt('FederalClassification[0].f1_4[0]', form.other_text);
    txt('Exemptions[0].f1_5[0]', form.exempt_payee); txt('Exemptions[0].f1_6[0]', form.fatca);
    txt('Address[0].f1_7[0]', form.address); txt('Address[0].f1_8[0]', form.city_state_zip);
    txt('f1_9[0]', 'Solar Review Corp');
    var t = String(form.tin || '').replace(/\D/g, '');
    if (t.length === 9) {
      if (form.tin_type === 'ein') { txt('EmployerID[0].f1_14[0]', t.slice(0, 2)); txt('EmployerID[0].f1_15[0]', t.slice(2)); }
      else { txt('SSN[0].f1_11[0]', t.slice(0, 3)); txt('SSN[0].f1_12[0]', t.slice(3, 5)); txt('SSN[0].f1_13[0]', t.slice(5)); }
    }
    var page = doc.getPage(0);
    if (sig) {
      if (sig.type === 'drawn') { try { var img = await doc.embedPng(sig.dataUrl); var s = Math.min(240 / img.width, 22 / img.height); page.drawImage(img, { x: 114, y: 239, width: img.width * s, height: img.height * s }); } catch (e) {} }
      else { var fnt = await doc.embedFont(L.StandardFonts.TimesRomanItalic); page.drawText(String(sig.text || '').replace(/[^\x20-\x7E]/g, '?'), { x: 114, y: 241, size: 15, font: fnt, color: L.rgb(0.05, 0.1, 0.4) }); }
      var hf = await doc.embedFont(L.StandardFonts.Helvetica); page.drawText(fmtDate(signedAt), { x: 410, y: 243, size: 10, font: hf });
    }
    return await doc.save();
  }
  function blobUrl(bytes) { return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); }
  // ── status ──
  function has(id) { return post({ action: 'status', member_id: id }).then(function (j) { return j._status === 200 ? !!j.submitted : true; }).catch(function () { return true; }); }
  // ── form UI ──
  function tinFmt(v, type) { var d = String(v).replace(/\D/g, '').slice(0, 9); return type === 'ein' ? (d.length > 2 ? d.slice(0, 2) + '-' + d.slice(2) : d) : (d.length > 5 ? d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5) : d.length > 3 ? d.slice(0, 3) + '-' + d.slice(3) : d); }
  function inp(id, label, val, extra) { return '<label style="display:block;margin:12px 0 4px;font-size:.8rem;font-weight:700;color:#444;">' + label + '</label><input id="w9_' + id + '" value="' + esc(val) + '" ' + (extra || '') + ' style="width:100%;padding:13px;font-size:1rem;border:1.5px solid #cfd6c4;border-radius:10px;box-sizing:border-box;background:#fff;color:#111;">'; }
  function render() {
    var s = st, f = s.f, o = '<div style="position:fixed;inset:0;z-index:100000;background:rgba(20,24,16,.72);overflow:auto;"><div style="max-width:560px;margin:0 auto;background:#faf8f3;min-height:100%;padding:20px 18px 40px;color:#111;box-sizing:border-box;">';
    o += '<div style="font-size:.7rem;font-weight:800;letter-spacing:.08em;color:#6a8f2a;text-transform:uppercase;">Solar Review · Tax form</div><h2 style="margin:4px 0 6px;font-size:1.5rem;">Your W-9</h2>';
    o += '<p style="margin:0 0 6px;color:#555;font-size:.9rem;line-height:1.5;">We need this once so we can pay you. Type your details below and we fill in the official IRS form for you. It takes about 2 minutes, and your SSN/EIN is stored encrypted.</p>';
    o += inp('name', 'Your name (as on your tax return)', f.name, 'autocomplete="name"');
    o += inp('business', 'Business name (only if different — otherwise leave blank)', f.business);
    o += '<div style="margin:14px 0 4px;font-size:.8rem;font-weight:700;color:#444;">How do you file your taxes?</div><div style="display:flex;flex-wrap:wrap;gap:8px;">';
    CLS.forEach(function (c) { var on = f.cls === c[0]; o += '<button type="button" onclick="W9._set(\'cls\',\'' + c[0] + '\')" style="width:auto;margin:0;padding:10px 14px;border-radius:100px;font-size:.85rem;font-weight:700;cursor:pointer;border:1.5px solid ' + (on ? '#6a8f2a' : '#cfd6c4') + ';background:' + (on ? '#e6f2cf' : '#fff') + ';color:#111;">' + c[1] + '</button>'; });
    o += '</div>';
    if (f.cls === 'llc') o += '<label style="display:block;margin:12px 0 4px;font-size:.8rem;font-weight:700;color:#444;">LLC taxed as</label><select id="w9_llc_class" onchange="W9._set(\'llc_class\',this.value)" style="width:100%;padding:13px;font-size:1rem;border-radius:10px;border:1.5px solid #cfd6c4;"><option value="">Choose…</option><option value="C"' + (f.llc_class === 'C' ? ' selected' : '') + '>C corporation</option><option value="S"' + (f.llc_class === 'S' ? ' selected' : '') + '>S corporation</option><option value="P"' + (f.llc_class === 'P' ? ' selected' : '') + '>Partnership</option></select><div style="font-size:.74rem;color:#777;margin-top:4px;">A single-member LLC that has not elected corporate tax should pick &ldquo;Individual&rdquo; above.</div>';
    if (f.cls === 'other') o += inp('other_text', 'Describe', f.other_text);
    o += inp('address', 'Street address', f.address, 'autocomplete="street-address"');
    o += inp('city_state_zip', 'City, state, ZIP', f.city_state_zip, 'autocomplete="off" placeholder="San Diego, CA 92101"');
    o += '<div style="margin:16px 0 4px;display:flex;gap:8px;align-items:center;"><span style="font-size:.8rem;font-weight:700;color:#444;">Tax ID:</span>' + ['ssn', 'ein'].map(function (t) { var on = f.tin_type === t; return '<button type="button" onclick="W9._set(\'tin_type\',\'' + t + '\')" style="width:auto;margin:0;padding:8px 14px;border-radius:100px;font-size:.82rem;font-weight:700;border:1.5px solid ' + (on ? '#6a8f2a' : '#cfd6c4') + ';background:' + (on ? '#e6f2cf' : '#fff') + ';color:#111;">' + (t === 'ssn' ? 'Social Security #' : 'EIN (business)') + '</button>'; }).join('') + '</div>';
    o += '<input id="w9_tin" value="' + esc(tinFmt(f.tin, f.tin_type)) + '" inputmode="numeric" autocomplete="off" placeholder="' + (f.tin_type === 'ein' ? '12-3456789' : '123-45-6789') + '" oninput="W9._tin(this)" style="width:100%;padding:13px;font-size:1.05rem;letter-spacing:.06em;border:1.5px solid #cfd6c4;border-radius:10px;box-sizing:border-box;background:#fff;color:#111;">';
    o += '<label style="display:flex;gap:10px;align-items:flex-start;margin:18px 0 8px;font-size:.78rem;line-height:1.45;color:#333;"><input type="checkbox" id="w9_certify" ' + (f.certify ? 'checked' : '') + ' onchange="W9._set(\'certify\',this.checked)" style="width:auto;margin:3px 0 0;flex-shrink:0;"><span>Under penalties of perjury, I certify that the number shown is my correct taxpayer identification number, I am not subject to backup withholding, and I am a U.S. citizen or other U.S. person.</span></label>';
    o += '<div style="margin:12px 0 4px;font-size:.8rem;font-weight:700;color:#444;">Your signature</div><div onclick="W9._sign()" style="cursor:pointer;border:2px dashed #9bb86a;border-radius:12px;background:#fff;min-height:64px;display:flex;align-items:center;justify-content:center;padding:6px;">' + (s.sig ? (root.SigCapture ? root.SigCapture.previewHtml(s.sig) : 'Signed') : '<span style="color:#6a8f2a;font-weight:800;">&#9998; Tap here to sign</span>') + '</div>';
    o += inp('code', 'Your portal access code (confirms it is you)', s.code, 'type="password" autocomplete="off"');
    o += '<div id="w9_err" style="color:#c0392b;font-weight:700;font-size:.85rem;margin-top:12px;min-height:18px;">' + esc(s.err || '') + '</div>';
    o += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;"><button type="button" id="w9_prev" onclick="W9._preview()" style="width:auto;margin:0;padding:13px 18px;border-radius:100px;border:1.5px solid #6a8f2a;background:#fff;color:#3f5a14;font-weight:800;">&#128065; Preview my W-9</button><button type="button" id="w9_go" onclick="W9._submit()" style="flex:1;margin:0;padding:14px;border-radius:100px;border:none;background:#8DC63F;color:#111;font-weight:800;font-size:1rem;">Sign &amp; submit</button></div>';
    if (!s.required) o += '<div style="text-align:center;margin-top:14px;"><a href="#" onclick="W9._close();return false;" style="color:#777;font-size:.82rem;">Do this later</a></div>';
    if (s.previewUrl) o += '<div style="margin-top:16px;"><div style="font-size:.74rem;color:#777;margin-bottom:4px;">This is the real IRS form with your answers filled in:</div><iframe src="' + s.previewUrl + '#page=1&view=FitH" style="width:100%;height:560px;border:1px solid #cfd6c4;border-radius:8px;background:#fff;"></iframe></div>';
    o += '</div></div>';
    var host = document.getElementById('w9Host') || (function () { var d = document.createElement('div'); d.id = 'w9Host'; document.body.appendChild(d); return d; })();
    var y = host.firstChild && host.firstChild.scrollTop; host.innerHTML = o;
  }
  function grab() { var s = st; if (!s) return; ['name', 'business', 'address', 'city_state_zip', 'other_text'].forEach(function (k) { var e = document.getElementById('w9_' + k); if (e) s.f[k] = e.value; }); var t = document.getElementById('w9_tin'); if (t) s.f.tin = t.value.replace(/\D/g, '').slice(0, 9); var c = document.getElementById('w9_code'); if (c) s.code = c.value; }
  function validate() {
    var f = st.f; if (!f.name.trim()) return 'Enter your name.'; if (f.cls === 'llc' && !f.llc_class) return 'Choose how your LLC is taxed.';
    if (!f.address.trim() || !f.city_state_zip.trim()) return 'Enter your address.'; if (String(f.tin).length !== 9) return 'Your ' + (f.tin_type === 'ein' ? 'EIN' : 'Social Security number') + ' must be 9 digits.';
    if (!f.certify) return 'Please tick the certification box.'; if (!st.sig) return 'Tap the box to sign.'; if (!st.code) return 'Enter your access code.'; return '';
  }
  var W9 = root.W9 = {
    has: has, buildPdf: buildPdf,
    open: function (o) {
      var p = o.person || {};
      st = { person: p, required: o.required !== false, onDone: o.onDone, sig: null, code: '', err: '', previewUrl: '', f: { name: p.name || '', business: '', cls: 'individual', llc_class: '', other_text: '', address: '', city_state_zip: '', tin_type: 'ssn', tin: '', certify: false } };
      render();
    },
    _set: function (k, v) { grab(); st.f[k] = v; if (k === 'tin_type') st.f.tin = ''; st.previewUrl = ''; render(); },
    _tin: function (el) { var d = el.value.replace(/\D/g, '').slice(0, 9); st.f.tin = d; el.value = tinFmt(d, st.f.tin_type); },
    _close: function () { var h = document.getElementById('w9Host'); if (h) h.remove(); st = null; },
    _sign: function () { grab(); if (!root.SigCapture) { alert('Signature pad could not load — refresh and try again.'); return; } root.SigCapture.open({ kind: 'signature', defaultName: st.f.name, initial: st.sig, onDone: function (r) { st.sig = r; st.previewUrl = ''; render(); } }); },
    _preview: async function () {
      grab(); var b = document.getElementById('w9_prev'); if (b) { b.disabled = true; b.textContent = 'Preparing…'; }
      try { var bytes = await buildPdf(st.f, st.sig, Date.now()); if (st.previewUrl) URL.revokeObjectURL(st.previewUrl); st.previewUrl = blobUrl(bytes); st.err = ''; } catch (e) { st.err = 'Could not build the preview: ' + e.message; }
      render();
    },
    _submit: async function () {
      grab(); st.err = validate(); if (st.err) { render(); return; }
      var b = document.getElementById('w9_go'); if (b) { b.disabled = true; b.textContent = 'Saving…'; }
      try {
        var r = await post({ action: 'submit', member_id: st.person.id, code: st.code, form: Object.assign({}, st.f, { tin: st.f.tin }), signature: st.sig });
        if (r._status !== 200 || !r.ok) { st.err = r.error || 'Could not save. Try again.'; render(); return; }
        var cb = st.onDone; W9._close(); alert('Thank you — your W-9 is saved.'); if (cb) cb();
      } catch (e) { st.err = 'Connection problem — nothing was lost. Tap Sign & submit again.'; render(); }
    },
    adminRowHtml: function (u) {
      var ok = !!u.w9_signed_at;
      return '<div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span style="font-size:.66rem;font-weight:800;padding:3px 9px;border-radius:100px;background:' + (ok ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.12)') + ';color:' + (ok ? '#22c55e' : '#ef4444') + ';">' + (ok ? '&#10003; W-9 on file' : 'No W-9 yet') + '</span>' +
        (ok ? '<button onclick="W9.adminDownload(\'' + u.id + '\')" style="width:auto;margin:0;padding:4px 10px;font-size:.68rem;font-weight:700;background:rgba(74,158,255,.1);border:1px solid rgba(74,158,255,.3);border-radius:6px;color:#4a9eff;cursor:pointer;">Download W-9 (PDF)</button>' : '') + '</div>';
    },
    adminDownload: async function (id) {
      var k = ''; try { k = sessionStorage.getItem('w9AdminKey') || ''; } catch (e) {}
      if (!k) { k = prompt('W-9 admin password:') || ''; if (!k) return; }
      try {
        var r = await post({ action: 'admin_get', member_id: id, admin_key: k });
        if (r._status === 403) { try { sessionStorage.removeItem('w9AdminKey'); } catch (e) {} alert(r.error || 'Wrong password.'); return; }
        if (!r.ok) { alert(r.error || 'Could not open the W-9.'); return; }
        try { sessionStorage.setItem('w9AdminKey', k); } catch (e) {}
        var bytes = await buildPdf(r.form.form, r.form.signature, r.form.signed_at), a = document.createElement('a');
        a.href = blobUrl(bytes); a.download = 'W-9-' + String(r.form.form.name || id).replace(/[^A-Za-z0-9]+/g, '-') + '.pdf'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
      } catch (e) { alert('Could not build the PDF: ' + e.message); }
    }
  };
})(window);
