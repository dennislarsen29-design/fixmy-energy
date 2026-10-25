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

  // ---- Live talk (LiveAvatar FULL mode via LiveKit). Opt-in only; capped; falls back to the captioned orb. ----
  var LK_SRC = 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.7/dist/livekit-client.umd.min.js';
  function loadLK() {
    if (window.LivekitClient) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = LK_SRC; s.onload = res; s.onerror = function () { rej(new Error('lk')); };
      document.head.appendChild(s);
    });
  }
  // One live session for the whole page visit: it floats bottom-left and survives step changes / re-renders.
  var LIVE = null;           // {room, timer, dock}
  var TALKERS = [];          // {btn, lineEl} for every mounted panel
  function setTalkUi(active, msg) {
    TALKERS = TALKERS.filter(function (t) { return t.btn.isConnected; });
    TALKERS.forEach(function (t) {
      t.btn.disabled = false;
      t.btn.textContent = active ? 'End conversation' : '🎙 Talk to Quoya';
      if (msg) t.lineEl.textContent = msg;
    });
  }
  function stopLive(msg) {
    if (LIVE) {
      try { LIVE.room.disconnect(); } catch (e) {}
      if (LIVE.timer) clearTimeout(LIVE.timer);
      if (LIVE.dock) LIVE.dock.remove();
      LIVE = null;
    }
    setTalkUi(false, msg);
  }
  function startLive() {
    setTalkUi(false); TALKERS.forEach(function (t) { t.btn.disabled = true; t.btn.textContent = 'Connecting…'; t.lineEl.textContent = 'One moment, connecting…'; });
    return Promise.all([QA.live('start'), loadLK()]).then(function (r) {
      var d = r[0];
      if (!d || !d.ok || !d.livekit_url || !d.livekit_client_token) throw new Error((d && d.reason) || 'unavailable');
      var L = window.LivekitClient;
      var room = new L.Room({ adaptiveStream: true });
      var dock = document.createElement('div'); dock.id = 'qaDock';
      dock.style.cssText = 'position:fixed;left:8px;bottom:0;z-index:99999;width:min(300px,42vw);height:min(520px,72vh);pointer-events:none;overflow:hidden;-webkit-mask-image:linear-gradient(to top,#000 88%,transparent 100%);mask-image:linear-gradient(to top,#000 88%,transparent 100%)';
      document.body.appendChild(dock);
      LIVE = { room: room, dock: dock, timer: null };
      room.on(L.RoomEvent.TrackSubscribed, function (track) {
        var node = track.attach(); node.className = 'qa-live';
        if (track.kind === 'video') node.style.cssText = 'width:100%;height:100%;object-fit:contain';
        else node.style.display = 'none';
        dock.appendChild(node);
      });
      room.on(L.RoomEvent.Disconnected, function () { if (LIVE && LIVE.room === room) stopLive('Session ended. Tap Talk to Quoya any time.'); });
      return room.connect(d.livekit_url, d.livekit_client_token).then(function () {
        return room.localParticipant.setMicrophoneEnabled(true).catch(function () { TALKERS.forEach(function (t) { t.lineEl.textContent = 'I can hear you only if you allow the microphone.'; }); });
      }).then(function () {
        setTalkUi(true, 'Go ahead, I’m listening.');
        LIVE.timer = setTimeout(function () { stopLive('That’s our time for now. Tap Talk to Quoya to continue.'); }, ((d.max_seconds || 120) * 1000));
      });
    }).catch(function () {
      stopLive('Live chat isn’t available right now, so I’ll keep guiding you here. You can also call (619) 777-6527.');
    });
  }
  function addTalk(el, lineEl, stage, opts) {
    var box = lineEl.parentNode;
    var btn = document.createElement('button'); btn.type = 'button';
    btn.style.cssText = 'margin-top:8px;width:auto;padding:7px 14px;border-radius:10px;border:1px solid rgba(34,211,238,.6);background:rgba(34,211,238,.12);color:#22d3ee;font-weight:700;cursor:pointer';
    btn.textContent = LIVE ? 'End conversation' : '🎙 Talk to Quoya';
    box.appendChild(btn);
    var tip = document.createElement('div'); tip.textContent = 'Tip: find a quiet spot. Earbuds help me hear you.';
    tip.style.cssText = 'margin-top:5px;font-size:.72rem;color:#7fa7b5'; box.appendChild(tip);
    if (opts && opts.human) {
      var hb = document.createElement('button'); hb.type = 'button'; hb.textContent = 'Prefer a person? Talk to our team instead';
      hb.style.cssText = 'display:block;margin-top:6px;width:auto;padding:0;border:0;background:none;color:#22d3ee;font-size:.76rem;text-decoration:underline;cursor:pointer';
      hb.onclick = function () { stopLive(); opts.human(); };
      box.appendChild(hb);
    }
    TALKERS.push({ btn: btn, lineEl: lineEl });
    btn.onclick = function () { if (LIVE) stopLive('Conversation ended. Tap Talk to Quoya any time.'); else startLive(); };
  }
  var QA = {
    // el: container; opts: { key, line }
    mount: function (el, opts) {
      ensureCss(); opts = opts || {};
      var off = false; try { off = localStorage.getItem('quoyaOff') === '1'; } catch (e) {}
      if (off) {
        el.innerHTML = '<div style="text-align:right;margin-bottom:10px"><button type="button" class="qa-on" style="width:auto;padding:5px 12px;border-radius:8px;border:1px solid rgba(34,211,238,.5);background:transparent;color:#22d3ee;cursor:pointer;font-size:.8rem">Turn Quoya Assistant on</button></div>';
        el.querySelector('.qa-on').onclick = function () { try { localStorage.removeItem('quoyaOff'); } catch (e) {} QA.mount(el, opts); };
        return { say: function () {} };
      }
      el.innerHTML = '<div class="qa-wrap"><div class="qa-stage"><div class="qa-orb"><i></i><i></i><i></i></div></div>'
        + '<div style="min-width:0"><div class="qa-tag">QUOYA</div><div class="qa-line"></div></div></div>';
      var stage = el.querySelector('.qa-stage'), lineEl = el.querySelector('.qa-line');
      var h = { say: function (t) { lineEl.textContent = t || ''; } };
      h.say(opts.line || '');
      if (opts.talk) addTalk(el, lineEl, stage, opts);
      var offBtn = document.createElement('button'); offBtn.type = 'button'; offBtn.textContent = 'Turn off Quoya Assistant';
      offBtn.style.cssText = 'display:block;margin-top:8px;width:auto;padding:0;border:0;background:none;color:#7fa7b5;font-size:.72rem;text-decoration:underline;cursor:pointer';
      offBtn.onclick = function () { try { localStorage.setItem('quoyaOff', '1'); } catch (e) {} QA.mount(el, opts); };
      lineEl.parentNode.appendChild(offBtn);
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
    // Small dismissible floating bubble (bottom corner). opts: { key, line, speak:true }.
    // Never steals focus, never blocks the page, and speaks only when the visitor taps "Hear it".
    float: function (opts) {
      ensureCss(); opts = opts || {};
      var old = document.getElementById('qaFloat'); if (old) old.remove();
      var f = document.createElement('div'); f.id = 'qaFloat';
      f.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9000;max-width:min(340px,calc(100vw - 28px));box-shadow:0 10px 30px rgba(0,0,0,.45);border-radius:16px;';
      f.innerHTML = '<div class="qa-wrap" style="margin:0;position:relative;padding:12px 34px 12px 12px"><div class="qa-stage" style="flex-basis:56px;width:56px;height:56px"><div class="qa-orb"><i></i><i></i><i></i></div></div>'
        + '<div style="min-width:0"><div class="qa-tag">QUOYA</div><div class="qa-line" style="font-size:.85rem"></div>'
        + (opts.speak && window.speechSynthesis ? '<button type="button" class="qa-hear" style="margin-top:6px;width:auto;padding:4px 10px;border-radius:8px;border:1px solid rgba(34,211,238,.5);background:transparent;color:#22d3ee;font-size:.75rem;cursor:pointer">&#128266; Hear it</button>' : '')
        + '</div><button type="button" class="qa-x" aria-label="Dismiss" style="position:absolute;top:6px;right:6px;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;line-height:24px">&times;</button></div>';
      f.querySelector('.qa-line').textContent = opts.line || '';
      f.querySelector('.qa-x').onclick = function () { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} f.remove(); if (opts.onClose) opts.onClose(); };
      var hear = f.querySelector('.qa-hear');
      if (hear) hear.onclick = function () { try { window.speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(opts.line || ''); u.rate = 1; window.speechSynthesis.speak(u); } catch (e) {} };
      document.body.appendChild(f);
      return { el: f, close: function () { f.remove(); } };
    },
    // Live session (real-time avatar). Returns {ok:false} until the server says it is configured.
    live: function (action) {
      return fetch('/.netlify/functions/quoya-avatar-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: action || 'check' }) })
        .then(function (r) { return r.json(); }).catch(function () { return { ok: false, reason: 'network' }; });
    }
  };
  window.QuoyaAvatar = QA;
})();
