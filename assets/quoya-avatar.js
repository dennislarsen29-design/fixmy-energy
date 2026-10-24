// Quoya on screen (2026-10-24). One small component every customer-facing step can mount.
// Rendering order, best first:
//   1. LIVE  - a real-time avatar session from /.netlify/functions/quoya-avatar-session (only when the
//              server reports it is configured; never faked).
//   2. VIDEO - assets/video/quoya-<key>.mp4 if that file exists (pre-recorded segment for this step).
//   3. HUD   - the Quoya HUD orb with a captioned line (always works; no device voice).
(function () {
  var css = '.qa-wrap{display:flex;gap:14px;align-items:center;background:linear-gradient(135deg,#0b1623,#10263a);border:1px solid rgba(34,211,238,.35);border-radius:16px;padding:14px;margin-bottom:14px}'
    + '.qa-stage{flex:0 0 84px;width:84px;height:84px;position:relative;border-radius:50%;overflow:hidden;background:radial-gradient(circle,#0e3b4f,#07121c)}'
    + '.qa-stage video{width:100%;height:100%;object-fit:cover}'
    + '.qa-orb{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}'
    + '.qa-orb i{position:absolute;border-radius:50%;border:2px solid rgba(34,211,238,.55);animation:qaPulse 2.4s ease-in-out infinite}'
    + '.qa-orb i:nth-child(1){width:34px;height:34px;background:rgba(34,211,238,.9);box-shadow:0 0 18px #22d3ee;border:0}'
    + '.qa-orb i:nth-child(2){width:56px;height:56px;animation-delay:.3s}.qa-orb i:nth-child(3){width:76px;height:76px;animation-delay:.6s;border-style:dashed}'
    + '@keyframes qaPulse{0%,100%{opacity:.45;transform:scale(.94)}50%{opacity:1;transform:scale(1.04)}}'
    + '.qa-tag{font:700 .6rem ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#22d3ee;margin-bottom:4px}'
    + '.qa-line{font-size:.92rem;line-height:1.5;color:#e6f6fb}';
  var added = false;
  function ensureCss() { if (added) return; added = true; var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
  function probeVideo(key) {
    return fetch('/assets/video/quoya-' + encodeURIComponent(key) + '.mp4', { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { return r.ok && /video/.test(r.headers.get('content-type') || ''); }).catch(function () { return false; });
  }
  var QA = {
    // el: container; opts: { key, line }
    mount: function (el, opts) {
      ensureCss(); opts = opts || {};
      el.innerHTML = '<div class="qa-wrap"><div class="qa-stage"><div class="qa-orb"><i></i><i></i><i></i></div></div>'
        + '<div style="min-width:0"><div class="qa-tag">QUOYA</div><div class="qa-line"></div></div></div>';
      var stage = el.querySelector('.qa-stage'), lineEl = el.querySelector('.qa-line');
      var h = { say: function (t) { lineEl.textContent = t || ''; } };
      h.say(opts.line || '');
      if (opts.key) probeVideo(opts.key).then(function (ok) {
        if (!ok || !stage.isConnected) return;
        var v = document.createElement('video'); v.src = '/assets/video/quoya-' + encodeURIComponent(opts.key) + '.mp4';
        v.muted = true; v.playsInline = true; v.autoplay = true; v.controls = false; v.loop = false;
        stage.querySelector('.qa-orb').style.display = 'none'; stage.appendChild(v);
        stage.style.cursor = 'pointer'; stage.title = 'Tap for sound';
        stage.onclick = function () { v.muted = false; v.currentTime = 0; v.play(); };
      });
      return h;
    },
    // Live session (real-time avatar). Returns {ok:false} until the server says it is configured.
    live: function () {
      return fetch('/.netlify/functions/quoya-avatar-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function (r) { return r.json(); }).catch(function () { return { ok: false, reason: 'network' }; });
    }
  };
  window.QuoyaAvatar = QA;
})();
