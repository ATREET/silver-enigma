(function () {
  'use strict';
  // ---------- 設定 ----------
  var SAMPLE_NOTES = ['A0'];
  for (var o = 1; o <= 7; o++) ['C', 'Ds', 'Fs', 'A'].forEach(function (n) { SAMPLE_NOTES.push(n + o); });
  SAMPLE_NOTES.push('C8');
  var PC = { C: 0, Ds: 3, Fs: 6, A: 9 };
  function sampleMidi(n) { var m = n.match(/^([A-Z]s?)(\d)$/); return PC[m[1]] + 12 * (+m[2] + 1); }
  var ABC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var SOL = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  var REVERB = { none: { dry: 1, s: 0, l: 0 }, short: { dry: 0.9, s: 0.35, l: 0 }, long: { dry: 0.85, s: 0, l: 0.45 } };

  var settings = { octave: 4, range: 2, labels: 'abc', reverb: 'short', sustain: false, volume: 80 };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('piano.settings') || '{}')); } catch (e) {}
  function save() { try { localStorage.setItem('piano.settings', JSON.stringify(settings)); } catch (e) {} }

  // ---------- 音訊 ----------
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {} // iOS 17+：不受靜音開關影響
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = new AC({ latencyHint: 'interactive' });
  var master = ctx.createGain();
  var limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 8;
  limiter.attack.value = 0.003; limiter.release.value = 0.15;
  var dry = ctx.createGain(), wetS = ctx.createGain(), wetL = ctx.createGain();
  var convS = ctx.createConvolver(), convL = ctx.createConvolver();
  convS.buffer = makeIR(1.2, 6000); convL.buffer = makeIR(3.5, 3500);
  master.connect(dry); dry.connect(limiter);
  master.connect(convS); convS.connect(wetS); wetS.connect(limiter);
  master.connect(convL); convL.connect(wetL); wetL.connect(limiter);
  limiter.connect(ctx.destination);
  function setVolume(v, instant) {
    var g = Math.pow(v / 100, 2) * 0.9;
    if (instant) master.gain.value = g; else master.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
  }
  function setReverb(kind, instant) {
    var r = REVERB[kind] || REVERB.none, t = ctx.currentTime;
    [[dry, r.dry], [wetS, r.s], [wetL, r.l]].forEach(function (p) {
      if (instant) p[0].gain.value = p[1];
      else { p[0].gain.cancelScheduledValues(t); p[0].gain.setTargetAtTime(p[1], t, 0.04); }
    });
  }
  function makeIR(seconds, cutoff) { // 產生立體聲殘響脈衝：指數衰減噪音 + 隨時間變暗的低通
    var rate = ctx.sampleRate, len = Math.floor(rate * seconds), buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), y = 0;
      for (var i = 0; i < len; i++) {
        var t = i / rate, env = Math.exp(-6.9 * t / seconds);
        var fc = cutoff * Math.exp(-1.5 * t / seconds), a = Math.exp(-2 * Math.PI * fc / rate);
        y = (1 - a) * (Math.random() * 2 - 1) + a * y;
        d[i] = y * env * (i < rate * 0.005 ? i / (rate * 0.005) : 1);
      }
    }
    return buf;
  }

  var buffers = {}; // midi -> AudioBuffer
  var sampleMidis = SAMPLE_NOTES.map(sampleMidi);
  function nearestSample(midi) {
    var best = sampleMidis[0];
    sampleMidis.forEach(function (s) { if (Math.abs(s - midi) < Math.abs(best - midi)) best = s; });
    return best;
  }
  function decode(ab) {
    return new Promise(function (res, rej) {
      var p = ctx.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    });
  }
  var loaded = 0, statusEl = document.getElementById('status'), bar = document.getElementById('progBar');
  function loadAll() {
    return Promise.all(SAMPLE_NOTES.map(function (n) {
      return fetch('samples/' + n + '.mp3').then(function (r) {
        if (!r.ok) throw new Error(n + ' ' + r.status);
        return r.arrayBuffer();
      }).then(decode).then(function (b) {
        buffers[sampleMidi(n)] = b; loaded++;
        bar.style.width = (100 * loaded / SAMPLE_NOTES.length) + '%';
        statusEl.textContent = '正在載入鋼琴音色… ' + loaded + ' / ' + SAMPLE_NOTES.length;
      });
    }));
  }

  var voices = {}; // midi -> {src, g, sustained}
  function noteOn(midi) {
    if (ctx.state !== 'running') ctx.resume();
    var sm = nearestSample(midi), buf = buffers[sm];
    if (!buf) return;
    if (voices[midi]) stopVoice(voices[midi], 0.015);
    var t = ctx.currentTime;
    var src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (midi - sm) / 12);
    var g = ctx.createGain();
    var vel = 0.85 - Math.max(0, midi - 84) * 0.006;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.002);
    src.connect(g); g.connect(master); src.start(t);
    var v = { src: src, g: g, sustained: false, midi: midi };
    src.onended = function () { if (voices[midi] === v) delete voices[midi]; try { g.disconnect(); } catch (e) {} };
    voices[midi] = v;
  }
  function stopVoice(v, tau) {
    var t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.setTargetAtTime(0, t, tau);
    try { v.src.stop(t + tau * 8); } catch (e) {}
    if (voices[v.midi] === v) delete voices[v.midi];
  }
  function noteOff(midi) {
    var v = voices[midi]; if (!v) return;
    if (settings.sustain) { v.sustained = true; return; }
    stopVoice(v, 0.07);
  }
  function releaseSustained() {
    Object.keys(voices).forEach(function (k) { var v = voices[k]; if (v.sustained && !pressCount(+k)) stopVoice(v, 0.12); });
  }

  // ---------- 鍵盤 ----------
  var kb = document.getElementById('keyboard');
  var keyEls = {};
  var held = {}; // midi -> 按住次數（多指 / 電腦鍵盤）
  function pressCount(m) { return held[m] || 0; }
  function isBlack(m) { return [1, 3, 6, 8, 10].indexOf(m % 12) >= 0; }
  function lowMidi() { return 12 * (settings.octave + 1); }
  function highMidi() { return lowMidi() + 12 * settings.range; }
  function label(m) {
    if (settings.labels === 'none') return m % 12 === 0 ? '<span class="c">C' + (m / 12 - 1) + '</span>' : '';
    var n = (settings.labels === 'solfege' ? SOL : ABC)[m % 12];
    if (isBlack(m)) return settings.labels === 'abc' ? n : '';
    return m % 12 === 0 ? '<span class="c">' + n + (m / 12 - 1) + '</span>' : n;
  }
  function build() {
    kb.innerHTML = ''; keyEls = {};
    var lo = lowMidi(), hi = highMidi(), whites = 0, m;
    for (m = lo; m <= hi; m++) if (!isBlack(m)) whites++;
    var w = 100 / whites, i = 0;
    for (m = lo; m <= hi; m++) {
      var el = document.createElement('div');
      el.className = 'key ' + (isBlack(m) ? 'black' : 'white');
      el.dataset.midi = m;
      el.innerHTML = label(m);
      if (isBlack(m)) { el.style.left = (i * w - w * 0.3) + '%'; el.style.width = (w * 0.6) + '%'; }
      else { el.style.left = (i * w) + '%'; el.style.width = w + '%'; i++; }
      if (pressCount(m)) el.classList.add('down');
      kb.appendChild(el); keyEls[m] = el;
    }
    document.getElementById('octLabel').textContent = 'C' + settings.octave;
  }
  function press(m) {
    held[m] = pressCount(m) + 1;
    if (held[m] === 1) { noteOn(m); if (keyEls[m]) keyEls[m].classList.add('down'); }
    updateChord();
  }
  function release(m) {
    if (!held[m]) return;
    held[m]--;
    if (!held[m]) { delete held[m]; noteOff(m); if (keyEls[m]) keyEls[m].classList.remove('down'); }
    updateChord();
  }
  function keyAt(x, y) {
    var el = document.elementFromPoint(x, y);
    el = el && el.closest ? el.closest('.key') : null;
    return el && kb.contains(el) ? +el.dataset.midi : null;
  }

  // 觸控：用 Touch Events（iOS 最穩定），追蹤每根手指，支援滑音
  var touches = {}; // id -> midi|null
  function onTouch(e) {
    e.preventDefault();
    if (ctx.state !== 'running') ctx.resume();
    var list = e.changedTouches;
    for (var i = 0; i < list.length; i++) {
      var t = list[i], id = t.identifier;
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        if (touches[id] != null) release(touches[id]);
        delete touches[id];
        continue;
      }
      var m = keyAt(t.clientX, t.clientY);
      if (e.type === 'touchstart') { touches[id] = m; if (m != null) press(m); }
      else if (touches[id] !== m) { // touchmove 換鍵
        if (m != null) press(m);
        if (touches[id] != null) release(touches[id]);
        touches[id] = m;
      }
    }
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (t) { kb.addEventListener(t, onTouch, { passive: false }); });

  // 滑鼠 / 觸控筆：Pointer Events（觸控交給上面處理）
  var ptrs = {};
  kb.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    var m = keyAt(e.clientX, e.clientY); ptrs[e.pointerId] = m; if (m != null) press(m);
  });
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch' || !(e.pointerId in ptrs)) return;
    var m = keyAt(e.clientX, e.clientY);
    if (m !== ptrs[e.pointerId]) { if (m != null) press(m); if (ptrs[e.pointerId] != null) release(ptrs[e.pointerId]); ptrs[e.pointerId] = m; }
  });
  function ptrUp(e) {
    if (!(e.pointerId in ptrs)) return;
    if (ptrs[e.pointerId] != null) release(ptrs[e.pointerId]); delete ptrs[e.pointerId];
  }
  window.addEventListener('pointerup', ptrUp); window.addEventListener('pointercancel', ptrUp);

  // 電腦鍵盤（外接鍵盤 / 桌機測試）
  var KEYMAP = 'awsedftgyhujkolp;\''.split('');
  var kbdDown = {};
  window.addEventListener('keydown', function (e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.body.dataset.mode === 'mpc') return;
    var k = e.key.toLowerCase(), idx = KEYMAP.indexOf(k);
    if (idx >= 0 && !kbdDown[k]) { kbdDown[k] = lowMidi() + idx; press(kbdDown[k]); }
    else if (k === 'z') shiftOct(-1); else if (k === 'x') shiftOct(1);
    else if (k === ' ') { e.preventDefault(); setSustain(!settings.sustain); }
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase(); if (kbdDown[k] != null) { release(kbdDown[k]); delete kbdDown[k]; }
  });
  function releaseAll() {
    Object.keys(held).forEach(function (m) { held[m] = 1; release(+m); });
    touches = {}; ptrs = {}; kbdDown = {};
  }
  window.addEventListener('blur', releaseAll);

  // ---------- 和弦顯示 ----------
  var chordName = document.getElementById('chordName'), chordSub = document.getElementById('chordSub');
  function updateChord() {
    var ms = Object.keys(held).map(Number);
    if (ms.length < 2) { chordName.textContent = ''; chordSub.textContent = ''; return; }
    var r = window.Chord.detectChord(ms);
    if (!r) { chordName.textContent = '—'; chordSub.textContent = ''; return; }
    chordName.textContent = r.name || r.interval;
    chordSub.textContent = r.name ? r.interval : '';
  }

  // ---------- 控制列 ----------
  function clampOct() { settings.octave = Math.max(1, Math.min(8 - settings.range, settings.octave)); }
  function shiftOct(d) { settings.octave += d; clampOct(); save(); build(); }
  document.getElementById('octDown').addEventListener('click', function () { shiftOct(-1); });
  document.getElementById('octUp').addEventListener('click', function () { shiftOct(1); });
  function seg(id, key, cb) {
    var el = document.getElementById(id);
    function paint() { Array.prototype.forEach.call(el.children, function (b) { b.classList.toggle('on', b.dataset.v === String(settings[key])); }); }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      settings[key] = key === 'range' ? +b.dataset.v : b.dataset.v; save(); paint(); cb && cb();
    });
    paint();
  }
  seg('rangeSeg', 'range', function () { clampOct(); build(); });
  seg('labelSeg', 'labels', build);
  seg('reverbSeg', 'reverb', function () { setReverb(settings.reverb); });
  var susBtn = document.getElementById('sustain');
  function setSustain(on) {
    settings.sustain = on; save(); susBtn.setAttribute('aria-pressed', on);
    if (!on) releaseSustained();
  }
  susBtn.addEventListener('click', function () { setSustain(!settings.sustain); });
  susBtn.setAttribute('aria-pressed', settings.sustain);
  var vol = document.getElementById('vol');
  vol.value = settings.volume;
  vol.addEventListener('input', function () { settings.volume = +vol.value; setVolume(settings.volume); save(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  clampOct(); build(); setVolume(settings.volume, true); setReverb(settings.reverb, true);

  // ---------- 啟動 / 解鎖音訊 ----------
  var overlay = document.getElementById('overlay'), startBtn = document.getElementById('start');
  function unlock() {
    var p = ctx.resume();
    var s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
    return p;
  }
  startBtn.addEventListener('click', function () { unlock(); overlay.classList.add('hidden'); });
  ['touchstart', 'pointerdown', 'keydown'].forEach(function (t) {
    document.addEventListener(t, function () { if (ctx.state !== 'running') unlock(); }, { capture: true, passive: true });
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && ctx.state !== 'running') ctx.resume(); });

  loadAll().then(function () {
    statusEl.textContent = '音色載入完成！';
    startBtn.disabled = false;
    window.__pianoReady = true;
  }).catch(function (err) {
    statusEl.textContent = '載入失敗，請確認網路後重新整理（' + err.message + '）';
    console.error(err);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW 註冊失敗', e); });
  }
  window.__piano = { press: press, release: release, releaseAll: releaseAll, held: held, ctx: ctx, buffers: buffers, mode: 'piano' };
})();
