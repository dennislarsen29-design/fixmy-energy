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
    + '.qa-stage.qa-poster{background:#0b1623 url(/assets/quoya-poster.png) center top/cover no-repeat!important}'
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
  // Background removal (2026-10-25): LiveAvatar's own guide says avatars rendered on a solid green background can be made
  // transparent in the browser (chroma key). We sample the video corners: if they are green we key them out frame by
  // frame on a canvas; if not (e.g. a hallway background) the video is shown untouched.
  function keyVideo(video, dock) {
    var showRaw = function () { video.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'; };
    video.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    var canvas = document.createElement('canvas'); canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;display:none';
    dock.appendChild(canvas);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var mode = 'probe', probes = 0, stopped = false;
    function isGreen(r, g, b) { return g > 90 && g > r + 40 && g > b + 40; }
    function frame() {
      if (stopped || !video.isConnected) { stopped = true; return; }
      var w = video.videoWidth, h = video.videoHeight;
      if (w && h && video.readyState >= 2) {
        var sc = Math.min(1, 640 / h); var cw = Math.round(w * sc), ch = Math.round(h * sc);
        if (canvas.width !== cw) { canvas.width = cw; canvas.height = ch; }
        ctx.drawImage(video, 0, 0, cw, ch);
        if (mode === 'probe') {
          var pts = [[4, 4], [cw - 8, 4], [4, Math.round(ch * 0.4)], [cw - 8, Math.round(ch * 0.4)]], green = 0;
          pts.forEach(function (q) { var d = ctx.getImageData(q[0], q[1], 4, 4).data; if (isGreen(d[0], d[1], d[2])) green++; });
          if (green >= 3) mode = 'key'; else if (++probes > 15) { mode = 'raw'; showRaw(); canvas.style.display = 'none'; return; }
          if (mode === 'key') canvas.style.display = 'block';
        }
        if (mode === 'key') {
          var img = ctx.getImageData(0, 0, cw, ch), d = img.data;
          for (var i = 0; i < d.length; i += 4) {
            var r = d[i], g = d[i + 1], b = d[i + 2], m = r > b ? r : b, gd = g - m;
            if (gd > 55) d[i + 3] = 0;
            else if (gd > 18) { d[i + 3] = Math.round(255 * (1 - (gd - 18) / 37)); d[i + 1] = m; }
            else if (gd > 0) d[i + 1] = m;   // despill: pull stray green off hair and clothing edges
          }
          ctx.putImageData(img, 0, 0);
        }
      }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(frame); else requestAnimationFrame(frame);
    }
    video.addEventListener('playing', function () { if (!stopped && mode !== 'raw') frame(); }, { once: true });
    if (video.readyState >= 2) frame();
  }
  // One live session for the whole page visit: it floats bottom-left and survives step changes / re-renders.
  var TALK_LABEL = '\uD83C\uDF99 Talk to Quoya \u2013 AI Solar Technician';
  // ---- Conversation capture with consent (2026-10-25) ----
  // Lines are buffered in memory only. Nothing leaves the browser unless the homeowner agrees: a tap on "Yes, share", or a
  // spoken yes right after Quoya asks. "No" throws the buffer away.
  var CAP = null;
  var YES_RE = /\b(yes|yeah|yep|yup|sure|okay|ok|go ahead|that's fine|that is fine|please do|of course|absolutely)\b/i, NO_RE = /\b(no|nope|nah|don't|do not|rather not|not really|please don't)\b/i;
  function capNew() { return { sid: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), lines: [], seen: {}, state: 'none', method: null, at: null, sentN: 0, timer: null, bar: null }; }
  function capAdd(who, text, id) {
    if (!CAP || CAP.state === 'no' || !text) return;
    text = String(text).trim(); if (!text) return;
    if (id) { if (CAP.seen[id]) return; CAP.seen[id] = 1; }
    CAP.lines.push({ who: who, text: text }); if (CAP.lines.length > 400) CAP.lines.shift();
    if (who === 'quoya' && CAP.state === 'none' && /share this conversation with our team/i.test(text)) capAsk();
    else if (who === 'customer' && CAP.state === 'asked') { if (YES_RE.test(text) && !NO_RE.test(text)) capGrant('voice'); else if (NO_RE.test(text) && !YES_RE.test(text)) capDeny(); }
  }
  function capAsk() {
    CAP.state = 'asked';
    var bar = document.createElement('div'); CAP.bar = bar;
    bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:64px;z-index:100000;max-width:520px;margin:0 auto;background:#fff;color:#1a1a1a;border:2px solid #0E7490;border-radius:14px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.3);font:600 .9rem/1.4 -apple-system,Segoe UI,Roboto,sans-serif';
    bar.innerHTML = '<div style="margin-bottom:9px;">Share this conversation with our team so they can help?</div><div style="display:flex;gap:8px;"><button type="button" data-y style="flex:1;margin:0;padding:11px;border:0;border-radius:100px;background:#8DC63F;color:#10260a;font-weight:800;cursor:pointer;">Yes, share</button><button type="button" data-n style="flex:1;margin:0;padding:11px;border:1px solid #bbb;border-radius:100px;background:#fff;color:#444;font-weight:700;cursor:pointer;">No thanks</button></div>';
    bar.querySelector('[data-y]').onclick = function () { capGrant('tap'); };
    bar.querySelector('[data-n]').onclick = function () { capDeny(); };
    document.body.appendChild(bar);
  }
  function capHide() { if (CAP && CAP.bar) { CAP.bar.remove(); CAP.bar = null; } }
  function capGrant(method) { if (!CAP || CAP.state === 'yes') return; CAP.state = 'yes'; CAP.method = method; CAP.at = new Date().toISOString(); capHide(); capFlush(); CAP.timer = setInterval(capFlush, 25000); }
  function capDeny() { if (!CAP) return; CAP.state = 'no'; CAP.lines.length = 0; capHide(); }
  function capFlush(final) {
    if (!CAP || CAP.state !== 'yes' || CAP.lines.length === CAP.sentN) return;
    var extra = {}; try { extra = (CTX_FN && CTX_FN()) || {}; } catch (e) {}
    CAP.sentN = CAP.lines.length;
    try { fetch('/.netlify/functions/quoya-transcript', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, extra, { sessionId: CAP.sid, step: (LIVE && LIVE.step) || CUR_STEP, consent: { method: CAP.method, at: CAP.at }, lines: CAP.lines })) }); } catch (e) {}
  }
  function capEnd() { if (!CAP) return; capFlush(true); if (CAP.timer) clearInterval(CAP.timer); capHide(); CAP = null; }
  var LIVE = null;           // {room, timer, dock, step}
  var CUR_STEP = 'welcome', CTX_FN = null, CP_T = null;
  var TALKERS = [];          // {btn, lineEl} for every mounted panel
  function setTalkUi(active, msg) {
    TALKERS = TALKERS.filter(function (t) { return t.btn.isConnected; });
    TALKERS.forEach(function (t) {
      t.btn.disabled = false;
      t.btn.textContent = active ? 'End conversation' : TALK_LABEL;
      if (msg) t.lineEl.textContent = msg;
    });
  }
  function stopLive(msg) {
    capEnd();
    if (LIVE) {
      try { LIVE.room.disconnect(); } catch (e) {}
      if (LIVE.timer) clearTimeout(LIVE.timer);
      if (LIVE.idle) clearTimeout(LIVE.idle);
      if (LIVE.dock) LIVE.dock.remove();
      if (LIVE.cap) LIVE.cap.remove();
      LIVE = null;
    }
    setTalkUi(false, msg);
  }
  function startLive() {
    setTalkUi(false); TALKERS.forEach(function (t) { t.btn.disabled = true; t.btn.textContent = 'Connecting…'; t.lineEl.textContent = 'One moment, connecting…'; });
    var stepAtStart = CUR_STEP, ctxExtra = {}; try { ctxExtra = (CTX_FN && CTX_FN()) || {}; } catch (e) {}
    return Promise.all([QA.live('start', Object.assign({}, ctxExtra, { step: stepAtStart })), loadLK()]).then(function (r) {
      var d = r[0];
      if (!d || !d.ok || !d.livekit_url || !d.livekit_client_token) throw new Error(((d && d.reason) || 'unavailable') + (d && d.status ? ' ' + d.status : '') + (d && d.detail ? ': ' + String(d.detail).slice(0, 120) : '') + (d && d.ok && !d.livekit_url ? ' (no livekit_url; keys: ' + (d.keys || []).join(',') + ')' : ''));
      var L = window.LivekitClient;
      var room = new L.Room({ adaptiveStream: true });
      var dock = document.createElement('div'); dock.id = 'qaDock';
      var phone = window.innerWidth < 700;
      dock.style.cssText = phone
        ? 'position:fixed;right:8px;top:64px;z-index:99999;width:112px;height:200px;pointer-events:none;overflow:hidden;border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.35)'
        : 'position:fixed;left:8px;bottom:0;z-index:99999;width:min(300px,42vw);height:min(520px,72vh);pointer-events:none;overflow:hidden;-webkit-mask-image:linear-gradient(to top,#000 88%,transparent 100%);mask-image:linear-gradient(to top,#000 88%,transparent 100%)';
      var cap = document.createElement('div'); cap.id = 'qaCaption';
      cap.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99998;max-width:560px;margin:0 auto;background:rgba(15,23,32,.92);color:#fff;border-radius:12px;padding:10px 13px;font-size:.92rem;line-height:1.45;display:none;pointer-events:none';
      document.body.appendChild(cap);
      function say(t) { if (!t) return; cap.textContent = t; cap.style.display = 'block'; clearTimeout(say.t); say.t = setTimeout(function () { cap.style.display = 'none'; }, 9000); }
      document.body.appendChild(dock);
      LIVE = { room: room, dock: dock, cap: cap, timer: null, step: stepAtStart };
      CAP = capNew();
      room.on(L.RoomEvent.TrackSubscribed, function (track) {
        var node = track.attach(); node.className = 'qa-live';
        if (track.kind === 'video') { dock.appendChild(node); keyVideo(node, dock); }
        else { node.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'; try { node.setAttribute('playsinline', ''); node.volume = 1; } catch (e) {} dock.appendChild(node); }
      });
      var idleT = null, IDLE_MS = 45000;
      function bumpIdle() { if (idleT) clearTimeout(idleT); idleT = setTimeout(function () { if (LIVE && LIVE.room === room) stopLive('I paused so we don\u2019t waste your time. Tap Talk to Quoya when you\u2019re ready.'); }, IDLE_MS); }
      room.on(L.RoomEvent.ActiveSpeakersChanged, function (sp) { if (sp && sp.length) bumpIdle(); });
      bumpIdle();
      try {
        room.on(L.RoomEvent.TranscriptionReceived, function (segs, part) {
          try { var isMe = part && room.localParticipant && part.identity === room.localParticipant.identity; (segs || []).forEach(function (sg) { if (sg && sg.text && sg.final !== false) { if (!isMe) say(sg.text); capAdd(isMe ? 'customer' : 'quoya', sg.text, sg.id); } }); } catch (e) {}
        });
        room.on(L.RoomEvent.DataReceived, function (payload) {
          try { var t = JSON.parse(new TextDecoder().decode(payload)); var tx = t && (t.text || t.message || t.transcript || (t.data && (t.data.text || t.data.transcript))); if (!tx) return; var mine = /user|customer|human/i.test(String(t.role || t.speaker || t.type || '')); if (!mine) say(String(tx)); capAdd(mine ? 'customer' : 'quoya', String(tx), t.id || null); } catch (e) {}
        });
      } catch (e) {}
      room.on(L.RoomEvent.Disconnected, function () { if (LIVE && LIVE.room === room) stopLive('Session ended. Tap Talk to Quoya any time.'); });
      return room.connect(d.livekit_url, d.livekit_client_token).then(function () {
        try { room.startAudio(); } catch (e) {}
        return room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true }).catch(function () { TALKERS.forEach(function (t) { t.lineEl.textContent = 'I can hear you only if you allow the microphone.'; }); });
      }).then(function () {
        setTalkUi(true, 'Go ahead, I’m listening.');
        LIVE.timer = setTimeout(function () { stopLive('That’s our time for now. Tap Talk to Quoya to continue.'); }, ((d.max_seconds || 120) * 1000));
      });
    }).catch(function (err) {
      stopLive('Live chat isn\u2019t available right now, so I\u2019ll keep guiding you here. You can also call (619) 777-6527. [' + String((err && err.message) || err).slice(0, 160) + ']');
    });
  }
  function addTalk(el, lineEl, stage, opts) {
    var box = lineEl.parentNode;
    var btn = document.createElement('button'); btn.type = 'button';
    btn.style.cssText = 'margin-top:8px;width:auto;padding:7px 14px;border-radius:10px;border:1px solid rgba(34,211,238,.6);background:rgba(34,211,238,.12);color:#22d3ee;font-weight:700;cursor:pointer';
    btn.textContent = LIVE ? 'End conversation' : TALK_LABEL;
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
  // Always-available launcher on customer pages: a small round Quoya bubble, bottom-left, free until tapped.
  function ensureLauncher() {
    if (document.getElementById('qaLauncher')) return;
    var b = document.createElement('button'); b.id = 'qaLauncher'; b.type = 'button'; b.setAttribute('aria-label', 'Talk to Quoya, the AI Solar Technician'); b.title = 'Talk to Quoya \u2013 AI Solar Technician';
    b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9400;width:64px;height:64px;padding:0;border-radius:50%;border:2px solid #22d3ee;background:#0b1623 url(/assets/quoya-poster.png) center top/cover no-repeat;box-shadow:0 6px 18px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#22d3ee;font-size:1.4rem';
    b.style.overflow = 'visible'; b.innerHTML = '<span style="position:absolute;right:-4px;bottom:-4px;width:24px;height:24px;border-radius:50%;background:#22d3ee;color:#07121c;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">\uD83C\uDF99</span>';
    b.onclick = function () { if (!LIVE) { var t = TALKERS.filter(function (x) { return x.btn.isConnected; })[0]; if (t) t.btn.click(); else startLive(); } };
    document.body.appendChild(b);
    setInterval(function () { b.style.display = LIVE ? 'none' : 'flex'; }, 500);
  }
  var QA = {
    _keyVideo: keyVideo,
    // Start the live session from a tap the customer already made (e.g. "Start now"). No-op if already live or unavailable.
    autoStart: function (step) { try { if (step) CUR_STEP = step; if (!LIVE) startLive(); } catch (e) {} },
    // Tell Quoya which screen the customer is on. If she is live, she reconnects with that checkpoint's directions.
    setContext: function (fn) { CTX_FN = fn; },
    checkpoint: function (step) {
      if (!step || step === CUR_STEP) return; CUR_STEP = step;
      if (!LIVE || LIVE.step === step) return;
      clearTimeout(CP_T); CP_T = setTimeout(function () { if (LIVE && LIVE.step !== CUR_STEP) { stopLive(); startLive(); } }, 1500);
    },
    launcher: function () { ensureCss(); ensureLauncher(); },
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
        + '<div style="min-width:0"><div class="qa-tag">QUOYA &middot; AI SOLAR TECHNICIAN</div><div class="qa-line"></div></div></div>';
      var stage = el.querySelector('.qa-stage'), lineEl = el.querySelector('.qa-line');
      try { var pi = new Image(); pi.onload = function () { if (!stage.isConnected || stage.querySelector('video')) return; stage.classList.add('qa-poster'); var o = stage.querySelector('.qa-orb'); if (o) o.style.display = 'none'; }; pi.src = '/assets/quoya-poster.png'; } catch (e) {}
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
        + '<div style="min-width:0"><div class="qa-tag">QUOYA &middot; AI SOLAR TECHNICIAN</div><div class="qa-line" style="font-size:.85rem"></div>'
        + (opts.speak && window.speechSynthesis ? '<button type="button" class="qa-hear" style="margin-top:6px;width:auto;padding:4px 10px;border-radius:8px;border:1px solid rgba(34,211,238,.5);background:transparent;color:#22d3ee;font-size:.75rem;cursor:pointer">&#128266; Hear it</button>' : '')
        + '</div><button type="button" class="qa-x" aria-label="Dismiss" style="position:absolute;top:6px;right:6px;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;line-height:24px">&times;</button></div>';
      f.querySelector('.qa-line').textContent = opts.line || '';
      f.querySelector('.qa-x').onclick = function () { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} f.remove(); if (opts.onClose) opts.onClose(); };
      var hear = f.querySelector('.qa-hear');
      if (hear) hear.onclick = function () { try { window.speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(opts.line || ''); u.rate = 1; window.speechSynthesis.speak(u); } catch (e) {} };
      document.body.appendChild(f);
      if (opts.talk !== false) { var _ln = f.querySelector('.qa-line'), _st = f.querySelector('.qa-stage');
        try { var _pi = new Image(); _pi.onload = function () { if (!_st.isConnected) return; _st.classList.add('qa-poster'); var _o = _st.querySelector('.qa-orb'); if (_o) _o.style.display = 'none'; }; _pi.src = '/assets/quoya-poster.png'; } catch (e) {} addTalk(f, _ln, _st, opts); }
      return { el: f, close: function () { f.remove(); } };
    },
    // Live session (real-time avatar). Returns {ok:false} until the server says it is configured.
    live: function (action, extra) {
      return fetch('/.netlify/functions/quoya-avatar-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: action || 'check' }, extra || {})) })
        .then(function (r) { return r.json(); }).catch(function () { return { ok: false, reason: 'network' }; });
    }
  };
  window.QuoyaAvatar = QA;
})();
