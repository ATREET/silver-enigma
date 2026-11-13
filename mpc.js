/* MPC：墊片、十六步音軌、循環。排程掛在鋼琴的 AudioContext 上，切回鋼琴畫面也不會停。 */
(function () {
  'use strict';
  var Logic = window.MpcLogic;
  var Synth = window.MpcSynth;
  var piano = window.__piano;
  if (!Logic || !Synth || !piano || !piano.ctx) return;

  var ctx = piano.ctx;
  var project = loadDraft();
  var selectedId = project.tracks[0] ? project.tracks[0].id : null;
  var liveKit = 'acoustic';
  var transportOn = false;
  var ticking = false;
  var timer = 0;
  var playGen = 0;
  var playhead = -1;
  var cursor = { stepIndex: 0, nextTime: 0 };
  var padTouches = {};
  var padPtrs = {};
  var padHeld = {};
  var chokeVoices = {};
  var bufferCache = {};
  var wavBlob = null;
  var draftTimer = 0;
  var toastTimer = 0;

  var drumBus = ctx.createGain();
  drumBus.gain.value = 0.95;
  var drumComp = ctx.createDynamicsCompressor();
  drumComp.threshold.value = -12;
  drumComp.knee.value = 8;
  drumComp.ratio.value = 4;
  drumComp.attack.value = 0.002;
  drumComp.release.value = 0.12;
  drumBus.connect(drumComp);
  drumComp.connect(ctx.destination);

  var modeSeg = document.getElementById('modeSeg');
  var beatToggle = document.getElementById('beatToggle');
  var bpm = document.getElementById('bpm');
  var bpmLabel = document.getElementById('bpmLabel');
  var meterSel = document.getElementById('meterSel');
  var resSeg = document.getElementById('resSeg');
  var kitSeg = document.getElementById('kitSeg');
  var muteBtn = document.getElementById('muteBtn');
  var trkVol = document.getElementById('trkVol');
  var soundSel = document.getElementById('soundSel');
  var delTrk = document.getElementById('delTrk');
  var addTrk = document.getElementById('addTrk');
  var trackScroll = document.getElementById('trackScroll');
  var padGrid = document.getElementById('padGrid');
  var stepRow = document.getElementById('stepRow');
  var viewSeg = document.getElementById('viewSeg');
  var pageGrp = document.getElementById('pageGrp');
  var pagePrev = document.getElementById('pagePrev');
  var pageNext = document.getElementById('pageNext');
  var pageLabel = document.getElementById('pageLabel');
  var followBtn = document.getElementById('followBtn');
  var barsDown = document.getElementById('barsDown');
  var barsUp = document.getElementById('barsUp');
  var barsLabel = document.getElementById('barsLabel');
  var viewSpan = 2;
  var viewOrigin = 0;
  var follow = true;
  var paintDrag = null;
  var saveOpen = document.getElementById('saveOpen');
  var grooveSel = document.getElementById('grooveSel');
  var saveSheet = document.getElementById('saveSheet');
  var saveClose = document.getElementById('saveClose');
  var slotName = document.getElementById('slotName');
  var slotSave = document.getElementById('slotSave');
  var slotList = document.getElementById('slotList');
  var exportJson = document.getElementById('exportJson');
  var importJson = document.getElementById('importJson');
  var importFile = document.getElementById('importFile');
  var exportWav = document.getElementById('exportWav');
  var toastEl = document.getElementById('toast');

  function toast(msg) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem('piano.mpc.draft');
      if (raw) return Logic.parseProject(raw);
    } catch (e) {}
    return Logic.defaultProject();
  }

  function draft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try { localStorage.setItem('piano.mpc.draft', Logic.serializeProject(project)); } catch (e) {}
    }, 60);
  }

  function invalidateWav() {
    wavBlob = null;
    if (exportWav) {
      exportWav.disabled = false;
      exportWav.textContent = '匯出音檔';
    }
  }

  function changed() {
    invalidateWav();
    draft();
  }

  function readSlots() {
    try {
      var raw = JSON.parse(localStorage.getItem('piano.mpc.slots') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }

  function selected() { return Logic.findTrack(project, selectedId); }

  function currentKit() {
    var t = selected();
    return t ? t.kit : liveKit;
  }

  function getBuffer(kit, sound) {
    var meta = Logic.resolveSound(kit, sound);
    var key = (Logic.KITS[kit] ? kit : 'acoustic') + '/' + meta.id;
    if (!bufferCache[key]) {
      var samples = Synth.renderVoice(ctx.sampleRate || 44100, meta.voice);
      var buf = ctx.createBuffer(1, samples.length, ctx.sampleRate || 44100);
      buf.getChannelData(0).set(samples);
      bufferCache[key] = {
        buffer: buf,
        choke: meta.choke ? key.split('/')[0] + ':' + meta.choke : null
      };
    }
    return bufferCache[key];
  }

  function prewarm() {
    Logic.kitList().forEach(function (kit) {
      Logic.KITS[kit.id].sounds.forEach(function (s) {
        try { getBuffer(kit.id, s.id); } catch (e) {}
      });
    });
  }

  function triggerBuffer(rec, time, gain) {
    var t = time == null ? ctx.currentTime : time;
    var key = rec.choke;
    if (key && chokeVoices[key] && chokeVoices[key].time < t - 1e-4) {
      var prev = chokeVoices[key];
      try {
        prev.g.gain.setValueAtTime(prev.level, t);
        prev.g.gain.linearRampToValueAtTime(0, t + 0.012);
        prev.src.stop(t + 0.02);
      } catch (e) {}
    }
    var src = ctx.createBufferSource();
    src.buffer = rec.buffer;
    var g = ctx.createGain();
    var level = gain > 0 ? gain : 0;
    g.gain.setValueAtTime(level, t);
    src.connect(g);
    g.connect(drumBus);
    try { src.start(t); } catch (e) { return; }
    if (key) chokeVoices[key] = { src: src, g: g, time: t, level: level };
    src.onended = function () {
      if (key && chokeVoices[key] && chokeVoices[key].src === src) delete chokeVoices[key];
      try { g.disconnect(); } catch (e2) {}
    };
  }

  function triggerStep(step, time) {
    var hits = Logic.hitsAt(project, step);
    for (var i = 0; i < hits.length; i++) {
      var hit = hits[i];
      try { triggerBuffer(getBuffer(hit.kit, hit.sound), time, hit.gain * 0.9); } catch (e) {}
    }
  }

  function barLength() { return Logic.stepsPerBar(project.meter, project.resolution); }

  function saveView() {
    try {
      localStorage.setItem('piano.mpc.view', JSON.stringify({ span: viewSpan, origin: viewOrigin, follow: follow }));
    } catch (e) {}
  }

  function loadView() {
    try {
      var v = JSON.parse(localStorage.getItem('piano.mpc.view') || '{}');
      if (v.span === 1 || v.span === 2) viewSpan = v.span;
      if (v.origin >= 0) viewOrigin = v.origin | 0;
      if (typeof v.follow === 'boolean') follow = v.follow;
    } catch (e) {}
  }

  function clampView() {
    if (!project || project.bars < 2) viewSpan = 1;
    if (viewSpan !== 1 && viewSpan !== 2) viewSpan = 1;
    var page = Math.floor(viewOrigin / viewSpan) * viewSpan;
    if (page < 0) page = 0;
    var maxStart = Math.max(0, project.bars - 1);
    if (page > maxStart) page = Math.floor(maxStart / viewSpan) * viewSpan;
    viewOrigin = page;
  }

  function shownBars() {
    clampView();
    return Math.max(1, Math.min(viewSpan, project.bars - viewOrigin));
  }

  function paintPlayhead() {
    if (follow && transportOn && playhead >= 0 && project.bars > viewSpan) {
      var len = barLength();
      var bar = Math.floor(playhead / len);
      if (bar < 0) bar = 0;
      if (bar >= project.bars) bar = project.bars - 1;
      var page = Math.floor(bar / viewSpan) * viewSpan;
      if (page !== viewOrigin) {
        viewOrigin = page;
        saveView();
        ensureSteps();
        paintView();
      }
    }
    var buttons = stepRow.children;
    for (var i = 0; i < buttons.length; i++) buttons[i].classList.toggle('now', +buttons[i].dataset.step === playhead);
  }

  function schedulePaint(step, time) {
    var gen = playGen;
    var ms = Math.max(0, (time - ctx.currentTime) * 1000);
    setTimeout(function () {
      if (gen !== playGen || !transportOn) return;
      playhead = step;
      paintPlayhead();
    }, ms);
  }

  // 不看畫面模式：鋼琴 / MPC 切換時循環照走
  function tick() {
    if (!transportOn) { ticking = false; return; }
    ticking = true;
    if (ctx.state === 'suspended') ctx.resume();
    var now = ctx.currentTime;
    if (!(cursor.nextTime >= now - 0.05)) cursor.nextTime = now + 0.02;
    var result = Logic.takeEvents(project.bpm, cursor.stepIndex, cursor.nextTime, now + 0.2, 16, Logic.stepCount(project), project.resolution);
    for (var i = 0; i < result.events.length; i++) {
      triggerStep(result.events[i].step, result.events[i].time);
      schedulePaint(result.events[i].step, result.events[i].time);
    }
    cursor.stepIndex = result.stepIndex;
    cursor.nextTime = result.nextTime;
    timer = setTimeout(tick, 25);
  }

  function paintTransport() {
    beatToggle.setAttribute('aria-pressed', transportOn ? 'true' : 'false');
    beatToggle.textContent = transportOn ? '鼓聲繼續' : '鼓聲停止';
  }

  function setTransport(on) {
    on = !!on;
    if (on === transportOn) return;
    transportOn = on;
    clearTimeout(timer);
    playGen++;
    if (on) {
      if (ctx.state !== 'running') ctx.resume();
      cursor.stepIndex = 0;
      cursor.nextTime = ctx.currentTime + 0.05;
      playhead = -1;
      paintPlayhead();
      ticking = true;
      tick();
    } else {
      ticking = false;
      playhead = -1;
      paintPlayhead();
    }
    paintTransport();
  }

  function setMode(mode) {
    mode = mode === 'mpc' ? 'mpc' : 'piano';
    document.body.dataset.mode = mode;
    piano.mode = mode;
    if (mode === 'mpc' && piano.releaseAll) piano.releaseAll();
    var buttons = modeSeg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].classList.toggle('on', buttons[i].dataset.v === mode);
    try { localStorage.setItem('piano.mode', mode); } catch (e) {}
    if (mode === 'mpc') requestAnimationFrame(applyWidths);
  }

  function paintTracks() {
    trackScroll.innerHTML = '';
    project.tracks.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'trk' + (t.id === selectedId ? ' on' : '') + (t.mute ? ' muted' : '');
      b.dataset.track = t.id;
      var nm = document.createElement('span');
      nm.textContent = t.name;
      var sub = document.createElement('small');
      sub.textContent = (Logic.KITS[t.kit] ? Logic.KITS[t.kit].name : '') + (t.mute ? ' · 靜音' : '');
      b.appendChild(nm);
      b.appendChild(sub);
      var color = Logic.soundColor(t.kit, t.sound);
      b.style.boxShadow = 'inset 5px 0 0 ' + color + (t.id === selectedId ? ', inset 0 0 0 2px #f4efe6' : '');
      trackScroll.appendChild(b);
    });
    addTrk.disabled = project.tracks.length >= Logic.MAX_TRACKS;
  }

  function paintPads() {
    var kit = currentKit();
    var sounds = Logic.KITS[kit].sounds;
    var t = selected();
    for (var i = 0; i < sounds.length; i++) {
      var b = padGrid.children[i];
      b.textContent = sounds[i].name;
      b.setAttribute('aria-label', sounds[i].name);
      var padColor = Logic.soundColor(kit, sounds[i].id);
      b.style.background = padColor;
      b.style.color = Logic.inkOn(padColor);
      var mine = !!(t && t.kit === kit && t.sound === sounds[i].id);
      b.classList.toggle('sel', mine);
    }
  }

  function paintSteps() {
    var t = selected();
    var color = t ? Logic.soundColor(t.kit, t.sound) : '';
    var buttons = stepRow.children;
    for (var i = 0; i < buttons.length; i++) {
      var abs = +buttons[i].dataset.step;
      var on = !!(t && t.steps[abs] > 0);
      buttons[i].classList.toggle('on', on);
      buttons[i].classList.toggle('now', abs === playhead);
      buttons[i].disabled = !t;
      buttons[i].style.background = on ? color : '';
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function paintKit() {
    var kit = currentKit();
    var buttons = kitSeg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].classList.toggle('on', buttons[i].dataset.kit === kit);
  }

  function paintEdit() {
    var t = selected();
    muteBtn.disabled = !t;
    delTrk.disabled = !t;
    trkVol.disabled = !t;
    soundSel.disabled = !t;
    muteBtn.setAttribute('aria-pressed', t && t.mute ? 'true' : 'false');
    if (t) trkVol.value = String(t.volume);
    var kit = t ? t.kit : liveKit;
    if (soundSel.dataset.kit !== kit) {
      soundSel.innerHTML = '';
      Logic.KITS[kit].sounds.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.name;
        soundSel.appendChild(o);
      });
      soundSel.dataset.kit = kit;
    }
    if (t) {
      soundSel.value = t.sound;
      soundSel.style.boxShadow = 'inset 6px 0 0 ' + Logic.soundColor(t.kit, t.sound);
    } else soundSel.style.boxShadow = '';
  }

  function paintView() {
    clampView();
    var viewButtons = viewSeg.querySelectorAll('button');
    for (var i = 0; i < viewButtons.length; i++) {
      var v = +viewButtons[i].dataset.v;
      viewButtons[i].classList.toggle('on', v === viewSpan);
      viewButtons[i].disabled = v === 2 && project.bars < 2;
    }
    var shown = shownBars();
    var first = viewOrigin + 1;
    var last = viewOrigin + shown;
    pageLabel.textContent = first === last ? ('第' + first + '小節') : ('第' + first + '–' + last + '小節');
    var multi = project.bars > viewSpan;
    pagePrev.disabled = !multi || viewOrigin <= 0;
    pageNext.disabled = !multi || viewOrigin + viewSpan >= project.bars;
    pageGrp.hidden = !multi;
    followBtn.hidden = !multi;
    followBtn.setAttribute('aria-pressed', follow ? 'true' : 'false');
    barsLabel.textContent = String(project.bars);
    barsDown.disabled = project.bars <= 1;
    barsUp.disabled = project.bars >= Logic.BARS_MAX;
  }

  function paintMeter() {
    if (meterSel) meterSel.value = project.meter;
    if (!resSeg) return;
    var buttons = resSeg.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) buttons[i].classList.toggle('on', +buttons[i].dataset.v === project.resolution);
  }

  var PRESETS = [
    { id: 'downbeat', label: '小節首', title: '每小節第一拍（加到現有的音上）' },
    { id: 'beats', label: '每拍', title: '每一拍的正拍（加上）' },
    { id: 'offbeat', label: '反拍', title: '每拍正中間的後半拍（加上）' },
    { id: 'backbeat', label: '2·4拍', title: '第2拍與第4拍，只用於四分拍號（加上）' },
    { id: 'eighths', label: '每8分', title: '每個八分音符（加上）' },
    { id: 'sixteenths', label: '每16分', title: '每個十六分音符（加上）' },
    { id: 'clear', label: '清除', title: '清除此軌' },
    { id: 'invert', label: '反轉', title: '有音的清掉，空的補上' },
    { id: 'copybar', label: '複製', title: '把第一小節複製到後面每一小節' }
  ];
  var undoSnap = null;
  var presetRow = document.getElementById('presetRow');

  function buildPresets() {
    PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.dataset.preset = p.id;
      b.textContent = p.label;
      b.title = p.title;
      b.setAttribute('aria-label', p.title);
      presetRow.appendChild(b);
    });
    var undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'preset';
    undoBtn.id = 'undoPreset';
    undoBtn.textContent = '還原';
    undoBtn.title = '還原上一個快速填入或節奏預設';
    undoBtn.setAttribute('aria-label', '還原上一個快速填入或節奏預設');
    presetRow.appendChild(undoBtn);
    presetRow.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.id === 'undoPreset') undoPreset();
      else runPreset(b.dataset.preset);
    });
  }

  function paintPresets() {
    var t = selected();
    var color = t ? Logic.soundColor(t.kit, t.sound) : '';
    var ink = color ? Logic.inkOn(color) : '';
    var buttons = presetRow.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (b.id === 'undoPreset') {
        var projectUndo = undoSnap && undoSnap.kind === 'project';
        var stepUndo = undoSnap && t && undoSnap.id === t.id && undoSnap.steps && undoSnap.steps.length === t.steps.length;
        b.disabled = !(projectUndo || stepUndo);
        b.style.background = '';
        b.style.color = '';
        continue;
      }
      var ok = !!(t && Logic.presetEnabled(b.dataset.preset, project.meter, project.resolution, project.bars));
      b.disabled = !ok;
      if (color && ok) {
        b.style.background = color;
        b.style.color = ink;
      } else {
        b.style.background = '';
        b.style.color = '';
      }
    }
  }

  function runPreset(kind) {
    var t = selected();
    if (!t || !Logic.presetEnabled(kind, project.meter, project.resolution, project.bars)) return;
    undoSnap = { id: t.id, steps: t.steps.slice() };
    t.steps = Logic.applyPreset(t.steps, kind, project.meter, project.resolution, project.bars);
    changed();
    paint();
  }

  function undoPreset() {
    if (!undoSnap) return;
    if (undoSnap.kind === 'project') {
      var next = Logic.parseProject(undoSnap.data);
      project.bpm = next.bpm;
      project.meter = next.meter;
      project.resolution = next.resolution;
      project.bars = next.bars;
      project.tracks = next.tracks;
      project.seq = next.seq;
      selectedId = project.tracks[0] ? project.tracks[0].id : null;
      soundSel.dataset.kit = '';
      undoSnap = null;
      if (cursor.stepIndex >= Logic.stepCount(project)) cursor.stepIndex = 0;
      if (playhead >= Logic.stepCount(project)) playhead = -1;
      clampView();
      changed();
      paint();
      return;
    }
    var t = Logic.findTrack(project, undoSnap.id);
    if (!t || t.steps.length !== undoSnap.steps.length) { undoSnap = null; paintPresets(); return; }
    t.steps = undoSnap.steps.slice();
    undoSnap = null;
    changed();
    paint();
  }

  function paint() {
    if (!selected() && project.tracks[0]) selectedId = project.tracks[0].id;
    paintTracks();
    paintPads();
    ensureSteps();
    paintEdit();
    paintKit();
    paintMeter();
    paintView();
    paintPresets();
    bpm.value = String(project.bpm);
    bpmLabel.textContent = String(project.bpm);
  }

  function applyProject(next) {
    project = next;
    selectedId = project.tracks[0] ? project.tracks[0].id : null;
    soundSel.dataset.kit = '';
    changed();
    paint();
  }

  function playPad(i) {
    if (ctx.state !== 'running') ctx.resume();
    var kit = currentKit();
    var sounds = Logic.KITS[kit].sounds;
    if (!sounds[i]) return;
    try { triggerBuffer(getBuffer(kit, sounds[i].id), ctx.currentTime, 0.9); } catch (e) {}
  }

  function setPadDown(i, down) {
    var el = padGrid.children[i];
    if (el) el.classList.toggle('down', !!down);
  }

  function pressPad(i) {
    if (i == null) return;
    padHeld[i] = (padHeld[i] || 0) + 1;
    if (padHeld[i] === 1) { setPadDown(i, true); playPad(i); }
  }

  function releasePad(i) {
    if (i == null || !padHeld[i]) return;
    padHeld[i]--;
    if (!padHeld[i]) setPadDown(i, false);
  }

  function padIndexAt(x, y) {
    var el = document.elementFromPoint(x, y);
    el = el && el.closest ? el.closest('.pad') : null;
    if (!el || !padGrid.contains(el)) return null;
    return +el.dataset.index;
  }

  function buildPads() {
    for (var i = 0; i < Logic.STEPS; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pad';
      b.dataset.index = String(i);
      padGrid.appendChild(b);
    }
    padGrid.addEventListener('touchstart', onPadTouch, { passive: false });
    padGrid.addEventListener('touchmove', onPadTouch, { passive: false });
    padGrid.addEventListener('touchend', onPadTouch, { passive: false });
    padGrid.addEventListener('touchcancel', onPadTouch, { passive: false });
    padGrid.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      var idx = padIndexAt(e.clientX, e.clientY);
      padPtrs[e.pointerId] = idx;
      if (idx != null) pressPad(idx);
    });
  }

  function onPadTouch(e) {
    e.preventDefault();
    var list = e.changedTouches;
    for (var i = 0; i < list.length; i++) {
      var tch = list[i];
      var id = tch.identifier;
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        releasePad(padTouches[id]);
        delete padTouches[id];
        continue;
      }
      var idx = padIndexAt(tch.clientX, tch.clientY);
      if (e.type === 'touchstart') {
        padTouches[id] = idx;
        if (idx != null) pressPad(idx);
      } else if (padTouches[id] !== idx) {
        releasePad(padTouches[id]);
        padTouches[id] = idx;
        if (idx != null) pressPad(idx);
      }
    }
  }

  function applyWidths() {
    var width = stepRow.clientWidth;
    var n = stepRow.children.length;
    if (width < 2 || !n) return;
    var shown = shownBars();
    var plan = Logic.layoutSteps(width, n, shown);
    var len = n / shown;
    for (var i = 0; i < n; i++) {
      var el = stepRow.children[i];
      var px = plan.widths[i] || 1;
      el.style.width = px + 'px';
      el.style.flex = '0 0 ' + px + 'px';
      var startOfBar = shown > 1 && i === len;
      var endOfBar = ((i + 1) % len) === 0;
      el.style.marginLeft = startOfBar ? plan.barGap + 'px' : '0';
      el.style.marginRight = endOfBar ? '0' : plan.gap + 'px';
    }
  }

  function ensureSteps() {
    clampView();
    var len = barLength();
    var shown = shownBars();
    var n = len * shown;
    var key = [project.meter, project.resolution, project.bars, viewSpan, viewOrigin, n].join(':');
    if (stepRow.dataset.key === key && stepRow.children.length === n) {
      paintSteps();
      applyWidths();
      return;
    }
    var starts = Logic.beatStarts(project.meter, project.resolution);
    var mark = {};
    var beatNo = {};
    starts.forEach(function (idx, ord) {
      mark[idx] = ord === 0 ? 'downbeat' : 'beat';
      beatNo[idx] = ord + 1;
    });
    stepRow.innerHTML = '';
    stepRow.dataset.key = key;
    var offset = viewOrigin * len;
    for (var i = 0; i < n; i++) {
      var rel = i % len;
      var abs = offset + i;
      var b = document.createElement('button');
      b.type = 'button';
      var cls = 'step';
      if (mark[rel] === 'downbeat') cls += ' downbeat';
      else if (mark[rel]) cls += ' beat';
      if (shown > 1 && i === len) cls += ' barline';
      b.className = cls;
      b.dataset.step = String(abs);
      var barNo = viewOrigin + Math.floor(i / len) + 1;
      b.setAttribute('aria-label', '第' + barNo + '小節 ' + (beatNo[rel] ? ('第' + beatNo[rel] + '拍') : ('第' + (rel + 1) + '步')));
      stepRow.appendChild(b);
    }
    stepRow.setAttribute('aria-label', '循環 ' + project.bars + ' 小節，正在顯示 ' + shown + ' 小節');
    paintSteps();
    applyWidths();
  }

  function applyGrid(meter, res) {
    var nextMeter = Logic.resolveMeter(meter).id;
    var nextRes = Logic.resolveResolution(res);
    if (nextMeter === project.meter && nextRes === project.resolution) return;
    undoSnap = null;
    var fromRes = project.resolution;
    var fromStep = cursor.stepIndex;
    var fromHead = playhead;
    Logic.setGrid(project, nextMeter, nextRes);
    var n = Logic.stepCount(project);
    cursor.stepIndex = Logic.mapStepIndex(fromStep, fromRes, project.resolution, n);
    if (fromHead >= 0) playhead = Logic.mapStepIndex(fromHead, fromRes, project.resolution, n);
    changed();
    paint();
  }

  function buildKits() {
    Logic.kitList().forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.kit = k.id;
      b.textContent = k.name;
      kitSeg.appendChild(b);
    });
  }

  function renderSlots() {
    slotList.innerHTML = '';
    var slots = readSlots();
    if (!slots.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '還沒有存檔。輸入名稱後按「存到此機」。';
      slotList.appendChild(empty);
      return;
    }
    slots.slice().reverse().forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'slot';
      var label = document.createElement('span');
      label.textContent = s.name;
      var load = document.createElement('button');
      load.type = 'button';
      load.className = 'btn';
      load.textContent = '載入';
      load.addEventListener('click', function () {
        try {
          applyProject(Logic.parseProject(s.project));
          project.name = s.name;
          slotName.value = s.name;
          changed();
          toast('已載入「' + s.name + '」');
          closeSave();
        } catch (e) { toast('這個存檔壞了'); }
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn';
      del.textContent = '刪除';
      del.addEventListener('click', function () {
        var next = readSlots().filter(function (x) { return x.name !== s.name; });
        try { localStorage.setItem('piano.mpc.slots', JSON.stringify(next)); } catch (e) {}
        renderSlots();
      });
      row.appendChild(label);
      row.appendChild(load);
      row.appendChild(del);
      slotList.appendChild(row);
    });
  }

  function openSave() {
    slotName.value = project.name || '未命名';
    renderSlots();
    saveSheet.hidden = false;
    slotName.focus();
  }

  function closeSave() { saveSheet.hidden = true; }

  function safeFile(name) {
    var s = String(name || 'mpc').replace(/[^\w\u4e00-\u9fff-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
    return s || 'mpc';
  }

  function shareBlob(blob, filename, textFallback) {
    var file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    var fileShare = false;
    try { fileShare = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
    if (fileShare) {
      return navigator.share({ files: [file], title: filename }).then(function () {
        toast('已開啟分享');
      }, function (err) {
        if (err && err.name === 'AbortError') return;
        return fallback();
      });
    }
    if (textFallback && navigator.share) {
      return navigator.share({ title: filename, text: textFallback }).then(function () {
        toast('已開啟分享，可存到「檔案」');
      }, function (err) {
        if (err && err.name === 'AbortError') return;
        return fallback();
      });
    }
    return fallback();
    function fallback() {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast('若 iPhone 沒有下載，請再試一次分享');
    }
  }

  function renderWav(proj) {
    var OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OC) return Promise.reject(new Error('no offline'));
    var bars = 2;
    var nSteps = Logic.stepCount(proj);
    var step = Logic.stepSeconds(proj.bpm, proj.resolution);
    var total = step * nSteps * bars + 1;
    var rate = ctx.sampleRate || 44100;
    var offline = new OC(1, Math.ceil(rate * total), rate);
    var chokes = {};
    for (var bar = 0; bar < bars; bar++) {
      for (var s = 0; s < nSteps; s++) {
        var time = (bar * nSteps + s) * step;
        var hits = Logic.hitsAt(proj, s);
        for (var h = 0; h < hits.length; h++) {
          var hit = hits[h];
          var meta = Logic.resolveSound(hit.kit, hit.sound);
          var samples = Synth.renderVoice(offline.sampleRate, meta.voice);
          var buf = offline.createBuffer(1, samples.length, offline.sampleRate);
          buf.getChannelData(0).set(samples);
          var src = offline.createBufferSource();
          src.buffer = buf;
          var g = offline.createGain();
          var level = hit.gain * 0.85;
          g.gain.setValueAtTime(level, time);
          src.connect(g);
          g.connect(offline.destination);
          var choke = meta.choke ? hit.kit + ':' + meta.choke : null;
          if (choke && chokes[choke] && chokes[choke].time < time - 1e-4) {
            var prev = chokes[choke];
            try {
              prev.g.gain.setValueAtTime(prev.level, time);
              prev.g.gain.linearRampToValueAtTime(0, time + 0.012);
              prev.src.stop(time + 0.02);
            } catch (e) {}
          }
          src.start(time);
          if (choke) chokes[choke] = { g: g, src: src, time: time, level: level };
        }
      }
    }
    return offline.startRendering().then(function (audioBuf) {
      var bytes = Logic.encodeWavMono(audioBuf.getChannelData(0), audioBuf.sampleRate);
      return new Blob([bytes], { type: 'audio/wav' });
    });
  }

  buildKits();
  buildPads();
  buildPresets();
  if (window.MpcGrooves) {
    window.MpcGrooves.list.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g.id;
      o.textContent = g.name;
      grooveSel.appendChild(o);
    });
  }
  Logic.METERS.forEach(function (m) {
    var o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.id;
    meterSel.appendChild(o);
  });
  prewarm();
  loadView();
  paint();
  paintTransport();

  try {
    var savedMode = localStorage.getItem('piano.mode');
    if (savedMode === 'mpc' || savedMode === 'piano') setMode(savedMode);
    else setMode('piano');
  } catch (e) { setMode('piano'); }

  modeSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    setMode(b.dataset.v);
  });
  beatToggle.addEventListener('click', function () { setTransport(!transportOn); });

  bpm.addEventListener('input', function () {
    project.bpm = Logic.clampBpm(bpm.value);
    bpmLabel.textContent = String(project.bpm);
    changed();
  });
  meterSel.addEventListener('change', function () { applyGrid(meterSel.value, project.resolution); });
  resSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    applyGrid(project.meter, +b.dataset.v);
  });

  kitSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var t = selected();
    if (!t) { liveKit = b.dataset.kit; paint(); return; }
    if (t.kit === b.dataset.kit) return;
    t.kit = b.dataset.kit;
    var meta = Logic.resolveSound(t.kit, t.sound);
    t.sound = meta.id;
    t.name = meta.name;
    changed();
    paint();
  });

  muteBtn.addEventListener('click', function () {
    var t = selected();
    if (!t) return;
    t.mute = !t.mute;
    changed();
    paint();
  });
  trkVol.addEventListener('input', function () {
    var t = selected();
    if (!t) return;
    var v = Math.round(+trkVol.value);
    if (v < 0) v = 0;
    if (v > 100) v = 100;
    t.volume = v;
    changed();
  });
  soundSel.addEventListener('change', function () {
    var t = selected();
    if (!t) return;
    var meta = Logic.resolveSound(t.kit, soundSel.value);
    t.sound = meta.id;
    t.name = meta.name;
    changed();
    paint();
  });
  delTrk.addEventListener('click', function () {
    var t = selected();
    if (!t) return;
    var idx = project.tracks.indexOf(t);
    Logic.removeTrack(project, t.id);
    var next = project.tracks[idx] || project.tracks[idx - 1];
    selectedId = next ? next.id : null;
    changed();
    paint();
  });
  addTrk.addEventListener('click', function () {
    var t = Logic.addTrack(project, { kit: currentKit() });
    if (!t) { toast('最多 ' + Logic.MAX_TRACKS + ' 條音軌'); return; }
    selectedId = t.id;
    changed();
    paint();
  });
  trackScroll.addEventListener('click', function (e) {
    var b = e.target.closest('[data-track]');
    if (!b) return;
    selectedId = b.dataset.track;
    paint();
  });
  function stepAt(x, y) {
    var el = document.elementFromPoint(x, y);
    el = el && el.closest ? el.closest('.step') : null;
    if (!el || !stepRow.contains(el)) return null;
    return +el.dataset.step;
  }
  function paintAbs(abs, value) {
    var t = selected();
    if (!t || abs == null || abs < 0 || abs >= t.steps.length) return;
    var cur = t.steps[abs] > 0 ? 1 : 0;
    if (cur === value) return;
    t.steps[abs] = value;
    var el = stepRow.querySelector('.step[data-step="' + abs + '"]');
    if (el) {
      el.classList.toggle('on', value > 0);
      el.style.background = value > 0 ? Logic.soundColor(t.kit, t.sound) : '';
      el.setAttribute('aria-pressed', value ? 'true' : 'false');
    }
    changed();
  }
  function beginPaint(abs) {
    var t = selected();
    if (!t || abs == null) return;
    if (undoSnap) { undoSnap = null; paintPresets(); }
    paintDrag = { value: t.steps[abs] > 0 ? 0 : 1 };
    paintAbs(abs, paintDrag.value);
  }
  function movePaint(abs) {
    if (!paintDrag) return;
    paintAbs(abs, paintDrag.value);
  }
  function endPaint() { paintDrag = null; }
  function onStepTouch(e) {
    e.preventDefault();
    var list = e.changedTouches;
    for (var i = 0; i < list.length; i++) {
      var tch = list[i];
      var abs = stepAt(tch.clientX, tch.clientY);
      if (e.type === 'touchstart') beginPaint(abs);
      else if (e.type === 'touchmove') movePaint(abs);
      else endPaint();
    }
  }
  stepRow.addEventListener('touchstart', onStepTouch, { passive: false });
  stepRow.addEventListener('touchmove', onStepTouch, { passive: false });
  stepRow.addEventListener('touchend', onStepTouch, { passive: false });
  stepRow.addEventListener('touchcancel', onStepTouch, { passive: false });
  stepRow.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    beginPaint(stepAt(e.clientX, e.clientY));
  });
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch' || !paintDrag) return;
    movePaint(stepAt(e.clientX, e.clientY));
  });
  window.addEventListener('pointerup', function (e) { if (e.pointerType !== 'touch') endPaint(); });
  window.addEventListener('pointercancel', endPaint);

  viewSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    viewSpan = +b.dataset.v === 2 ? 2 : 1;
    clampView();
    saveView();
    paint();
  });
  pagePrev.addEventListener('click', function () {
    follow = false;
    viewOrigin -= viewSpan;
    clampView();
    saveView();
    paint();
  });
  pageNext.addEventListener('click', function () {
    follow = false;
    viewOrigin += viewSpan;
    clampView();
    saveView();
    paint();
  });
  followBtn.addEventListener('click', function () {
    follow = !follow;
    saveView();
    paintView();
    if (follow) paintPlayhead();
  });
  function changeBars(delta) {
    var next = project.bars + delta;
    if (next < 1 || next > Logic.BARS_MAX) return;
    undoSnap = null;
    if (delta < 0 && Logic.tailHasNotes(project, next)) {
      if (!window.confirm('第 ' + (next + 1) + ' 小節之後有音符，確定刪掉？')) return;
    }
    Logic.resizeBars(project, next);
    if (cursor.stepIndex >= Logic.stepCount(project)) cursor.stepIndex = 0;
    if (playhead >= Logic.stepCount(project)) playhead = -1;
    clampView();
    changed();
    paint();
  }
  barsDown.addEventListener('click', function () { changeBars(-1); });
  barsUp.addEventListener('click', function () { changeBars(1); });
  if (window.ResizeObserver) new ResizeObserver(function () { applyWidths(); }).observe(stepRow);
  window.addEventListener('resize', applyWidths);
  window.addEventListener('orientationchange', function () { setTimeout(applyWidths, 60); });

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch' || !(e.pointerId in padPtrs)) return;
    var idx = padIndexAt(e.clientX, e.clientY);
    if (idx !== padPtrs[e.pointerId]) {
      releasePad(padPtrs[e.pointerId]);
      padPtrs[e.pointerId] = idx;
      if (idx != null) pressPad(idx);
    }
  });
  function padPtrUp(e) {
    if (!(e.pointerId in padPtrs)) return;
    releasePad(padPtrs[e.pointerId]);
    delete padPtrs[e.pointerId];
  }
  window.addEventListener('pointerup', padPtrUp);
  window.addEventListener('pointercancel', padPtrUp);

  window.addEventListener('keydown', function (e) {
    if (document.body.dataset.mode !== 'mpc') return;
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === ' ') { e.preventDefault(); setTransport(!transportOn); return; }
    var keys = '1234567890qwerty';
    var idx = keys.indexOf(String(e.key).toLowerCase());
    if (idx >= 0) playPad(idx);
  });

  function patternHasNotes(p) {
    var tracks = p.tracks || [];
    for (var i = 0; i < tracks.length; i++) {
      var steps = tracks[i].steps || [];
      for (var s = 0; s < steps.length; s++) if (+steps[s] > 0) return true;
    }
    return false;
  }
  function loadGroove(id) {
    var g = null;
    (window.MpcGrooves.list || []).forEach(function (item) { if (item.id === id) g = item; });
    if (!g) return;
    if (patternHasNotes(project) && !window.confirm('目前的節奏會被換成「' + g.name + '」，確定嗎？')) return;
    undoSnap = { kind: 'project', data: Logic.serializeProject(project) };
    var next = Logic.parseProject({
      name: project.name,
      bpm: g.bpm,
      meter: g.meter,
      resolution: g.resolution,
      bars: g.bars,
      tracks: g.tracks.map(function (t, i) {
        return { id: 't' + (i + 1), name: t.name, kit: t.kit, sound: t.sound, volume: t.volume, mute: false, steps: t.steps.slice() };
      })
    });
    project.bpm = next.bpm;
    project.meter = next.meter;
    project.resolution = next.resolution;
    project.bars = next.bars;
    project.tracks = next.tracks;
    project.seq = next.seq;
    selectedId = project.tracks[0] ? project.tracks[0].id : null;
    soundSel.dataset.kit = '';
    viewOrigin = 0;
    if (cursor.stepIndex >= Logic.stepCount(project)) cursor.stepIndex = 0;
    if (playhead >= Logic.stepCount(project)) playhead = -1;
    clampView();
    changed();
    paint();
    toast('已載入「' + g.name + '」');
  }
  grooveSel.addEventListener('change', function () {
    var id = grooveSel.value;
    grooveSel.value = '';
    if (id) loadGroove(id);
  });
  saveOpen.addEventListener('click', openSave);
  saveClose.addEventListener('click', closeSave);
  saveSheet.addEventListener('click', function (e) { if (e.target === saveSheet) closeSave(); });
  slotName.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); slotSave.click(); }
  });
  slotSave.addEventListener('click', function () {
    project.name = Logic.cleanName(slotName.value, '未命名');
    slotName.value = project.name;
    var slots = Logic.upsertSlot(readSlots(), {
      name: project.name,
      savedAt: new Date().toISOString(),
      project: project
    });
    try { localStorage.setItem('piano.mpc.slots', JSON.stringify(slots)); }
    catch (e) { toast('存檔失敗'); return; }
    changed();
    renderSlots();
    toast('已存「' + project.name + '」');
  });
  exportJson.addEventListener('click', function () {
    var text = JSON.stringify(Logic.wrapProject(project, new Date().toISOString()), null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    shareBlob(blob, safeFile(project.name) + '.json', text);
  });
  importJson.addEventListener('click', function () { importFile.click(); });
  importFile.addEventListener('change', function () {
    var file = importFile.files && importFile.files[0];
    importFile.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var text = String(reader.result || '');
        if (text.length > 200000) throw new Error('太大');
        applyProject(Logic.parseProject(text));
        toast('已匯入');
      } catch (e) { toast('無法讀取這個檔案'); }
    };
    reader.onerror = function () { toast('無法讀取這個檔案'); };
    reader.readAsText(file);
  });
  exportWav.addEventListener('click', function () {
    if (wavBlob) {
      var ready = wavBlob;
      wavBlob = null;
      exportWav.textContent = '匯出音檔';
      shareBlob(ready, safeFile(project.name) + '.wav');
      return;
    }
    exportWav.disabled = true;
    exportWav.textContent = '製作中…';
    renderWav(project).then(function (blob) {
      wavBlob = blob;
      exportWav.disabled = false;
      exportWav.textContent = '點一下分享音檔';
      toast('音檔好了，再點一次即可分享');
    }, function () {
      exportWav.disabled = false;
      exportWav.textContent = '匯出音檔';
      toast('這個瀏覽器無法匯出音檔');
    });
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !transportOn) return;
    if (ctx.state !== 'running') ctx.resume();
    clearTimeout(timer);
    if (!(cursor.nextTime >= ctx.currentTime)) cursor.nextTime = ctx.currentTime + 0.02;
    ticking = true;
    tick();
  });

  window.__mpc = {
    setTransport: setTransport,
    setMode: setMode,
    getProject: function () { return project; }
  };
})();
