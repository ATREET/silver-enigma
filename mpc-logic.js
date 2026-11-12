/* MPC 專案、節拍排程、存檔格式。純資料，不含 DOM / 音訊節點，瀏覽器與 Node 共用。 */
(function (root) {
  'use strict';

  var STEPS = 16; // 預設 4/4、十六分音符的步數；鼓墊也是 16 個
  var BPM_MIN = 40;
  var BPM_MAX = 240;
  var MAX_TRACKS = 8;
  var FORMAT = 'silver-enigma-mpc';
  // BPM 一律是四分音符速度。拍號只決定小節有多長、重音落在哪。
  // 6/8、9/8、12/8 的「一拍」是附點四分音符（三個八分），格子上的重音跟著這個走。
  // 5/8 用 3+2，7/8 用 2+2+3（單位是分母音符）。
  var METER_LIST = [
    { id: '2/4', beats: 2, unit: 4, groups: [1, 1] },
    { id: '3/4', beats: 3, unit: 4, groups: [1, 1, 1] },
    { id: '4/4', beats: 4, unit: 4, groups: [1, 1, 1, 1] },
    { id: '5/4', beats: 5, unit: 4, groups: [1, 1, 1, 1, 1] },
    { id: '6/4', beats: 6, unit: 4, groups: [1, 1, 1, 1, 1, 1] },
    { id: '7/4', beats: 7, unit: 4, groups: [1, 1, 1, 1, 1, 1, 1] },
    { id: '5/8', beats: 5, unit: 8, groups: [3, 2] },
    { id: '6/8', beats: 6, unit: 8, groups: [3, 3] },
    { id: '7/8', beats: 7, unit: 8, groups: [2, 2, 3] },
    { id: '9/8', beats: 9, unit: 8, groups: [3, 3, 3] },
    { id: '12/8', beats: 12, unit: 8, groups: [3, 3, 3, 3] }
  ];
  var METER_BY_ID = {};
  METER_LIST.forEach(function (m) { METER_BY_ID[m.id] = m; });

  function resolveMeter(id) {
    if (id && METER_BY_ID[id]) return METER_BY_ID[id];
    if (id && id.id && METER_BY_ID[id.id]) return METER_BY_ID[id.id];
    return METER_BY_ID['4/4'];
  }

  function resolveResolution(n) {
    n = +n;
    if (n === 8 || n === 16 || n === 32) return n;
    return 16;
  }

  function stepsPerBar(meter, resolution) {
    var m = resolveMeter(meter);
    var res = resolveResolution(resolution);
    return m.beats * res / m.unit;
  }

  function beatStarts(meter, resolution) {
    var m = resolveMeter(meter);
    var res = resolveResolution(resolution);
    var per = res / m.unit;
    var starts = [];
    var pos = 0;
    for (var i = 0; i < m.groups.length; i++) {
      starts.push(pos);
      pos += m.groups[i] * per;
    }
    return starts;
  }

  function stepCount(project) {
    if (project && (project.meter || project.resolution)) return stepsPerBar(project.meter, project.resolution);
    return STEPS;
  }

  function snd(id, name, choke, voice) {
    return { id: id, name: name, choke: choke || null, voice: voice };
  }

  var KITS = {
    acoustic: {
      name: '原聲',
      sounds: [
        snd('kick', '底鼓', 'kick', { kind: 'kick', dur: 0.42, f0: 49, f1: 156, sweep: 16, amp: 7.2, click: 0.2, seed: 1 }),
        snd('snare', '軍鼓', null, { kind: 'snare', dur: 0.28, f: 186, toneDecay: 24, noiseDecay: 11, tone: 0.4, noise: 0.62, lpCoef: 0.36, seed: 2 }),
        snd('clap', '拍手', null, { kind: 'clap', dur: 0.32, seed: 3 }),
        snd('chat', '閉鈸', 'hat', { kind: 'hat', dur: 0.05, decay: 64, smooth: 0.11, gain: 0.52, seed: 4 }),
        snd('ohat', '開鈸', 'hat', { kind: 'hat', dur: 0.46, decay: 6.2, smooth: 0.13, metal: 0.22, f: 5200, gain: 0.48, seed: 5 }),
        snd('tomL', '低筒鼓', null, { kind: 'tom', dur: 0.4, f0: 90, f1: 138, sweep: 12, amp: 6.4, seed: 6 }),
        snd('tomH', '高筒鼓', null, { kind: 'tom', dur: 0.3, f0: 170, f1: 228, sweep: 14, amp: 8, seed: 7 }),
        snd('rim', '鼓邊', null, { kind: 'rim', dur: 0.08, f: 460, decay: 58, seed: 8 }),
        snd('crash', '碎音鈸', null, { kind: 'cymbal', dur: 0.95, f: 330, decay: 2.4, seed: 9 }),
        snd('ride', '騎鈸', null, { kind: 'cymbal', dur: 0.55, f: 510, decay: 5.2, seed: 10 }),
        snd('shaker', '沙鈴', null, { kind: 'hat', dur: 0.12, decay: 20, smooth: 0.2, gain: 0.48, seed: 11 }),
        snd('cow', '牛鈴', null, { kind: 'bell', dur: 0.28, f1: 587, f2: 845, decay: 9, seed: 12 }),
        snd('tamb', '鈴鼓', null, { kind: 'hat', dur: 0.28, decay: 8.5, smooth: 0.15, metal: 0.32, f: 6800, gain: 0.46, seed: 13 }),
        snd('conga', '康加鼓', null, { kind: 'tom', dur: 0.26, f0: 198, f1: 252, sweep: 16, amp: 9, click: 0.04, seed: 14 }),
        snd('clave', '響棒', null, { kind: 'rim', dur: 0.065, f: 2050, decay: 72, click: 0.18, seed: 15 }),
        snd('snap', '響指', null, { kind: 'clap', dur: 0.11, bursts: [0, 0.007], burst: 72, tail: 18, seed: 16 })
      ]
    },
    electronic: {
      name: '電子',
      sounds: [
        snd('kick', '電底鼓', 'kick', { kind: 'kick', dur: 0.82, f0: 38, f1: 128, sweep: 20, amp: 2.8, click: 0.06, drive: 1.7, seed: 21 }),
        snd('snare', '電軍鼓', null, { kind: 'snare', dur: 0.2, f: 230, toneDecay: 30, noiseDecay: 15, tone: 0.22, noise: 0.8, lpCoef: 0.26, seed: 22 }),
        snd('clap', '電拍手', null, { kind: 'clap', dur: 0.3, seed: 23 }),
        snd('chat', '閉帽', 'hat', { kind: 'hat', dur: 0.038, decay: 86, smooth: 0.08, gain: 0.5, seed: 24 }),
        snd('ohat', '開帽', 'hat', { kind: 'hat', dur: 0.34, decay: 7.5, smooth: 0.1, metal: 0.18, gain: 0.46, seed: 25 }),
        snd('tomL', '低音鼓', null, { kind: 'tom', dur: 0.48, f0: 68, f1: 108, amp: 4.6, seed: 26 }),
        snd('tomM', '中音鼓', null, { kind: 'tom', dur: 0.32, f0: 136, f1: 188, amp: 7, seed: 27 }),
        snd('rim', '邊擊', null, { kind: 'rim', dur: 0.055, f: 680, decay: 85, seed: 28 }),
        snd('cow', '銅鈴', null, { kind: 'bell', dur: 0.22, f1: 760, f2: 1120, decay: 12, seed: 29 }),
        snd('clap2', '層拍手', null, { kind: 'clap', dur: 0.26, bursts: [0, 0.016, 0.028], seed: 30 }),
        snd('shaker', '沙錘', null, { kind: 'hat', dur: 0.1, decay: 24, smooth: 0.18, seed: 31 }),
        snd('blip', '短音', null, { kind: 'zap', dur: 0.12, f0: 200, f1: 1500, amp: 12, sweepTime: 0.07, seed: 32 }),
        snd('wood', '木魚', null, { kind: 'rim', dur: 0.08, f: 340, decay: 42, click: 0.12, seed: 33 }),
        snd('zap', '滑音', null, { kind: 'zap', dur: 0.3, f0: 64, f1: 980, amp: 4.5, drive: 1.35, seed: 34 }),
        snd('noise', '噪音', null, { kind: 'hat', dur: 0.18, decay: 6.5, smooth: 0.42, gain: 0.4, seed: 35 }),
        snd('tick', '滴答', null, { kind: 'rim', dur: 0.032, f: 2600, decay: 100, click: 0.45, seed: 36 })
      ]
    },
    perc: {
      name: '打擊',
      sounds: [
        snd('congaL', '低康加', null, { kind: 'tom', dur: 0.34, f0: 124, f1: 168, amp: 6.8, seed: 41 }),
        snd('congaH', '高康加', null, { kind: 'tom', dur: 0.24, f0: 206, f1: 268, amp: 9, seed: 42 }),
        snd('bongoL', '低邦哥', null, { kind: 'tom', dur: 0.2, f0: 276, f1: 340, amp: 11, seed: 43 }),
        snd('bongoH', '高邦哥', null, { kind: 'tom', dur: 0.16, f0: 392, f1: 470, amp: 13, click: 0.05, seed: 44 }),
        snd('wood', '木魚', null, { kind: 'rim', dur: 0.07, f: 860, decay: 52, seed: 45 }),
        snd('cow', '牛鈴', null, { kind: 'bell', dur: 0.32, f1: 554, f2: 830, decay: 7.5, seed: 46 }),
        snd('shaker', '沙鈴', null, { kind: 'hat', dur: 0.14, decay: 17, smooth: 0.22, seed: 47 }),
        snd('tamb', '鈴鼓', null, { kind: 'hat', dur: 0.3, decay: 7.8, smooth: 0.16, metal: 0.28, seed: 48 }),
        snd('clave', '響棒', null, { kind: 'rim', dur: 0.055, f: 1900, decay: 78, seed: 49 }),
        snd('agogoL', '低阿果', null, { kind: 'bell', dur: 0.36, f1: 415, f2: 622, decay: 6.5, seed: 50 }),
        snd('agogoH', '高阿果', null, { kind: 'bell', dur: 0.28, f1: 784, f2: 1175, decay: 8, seed: 51 }),
        snd('cabasa', '卡巴薩', null, { kind: 'guiro', dur: 0.2, rateHz: 42, decay: 8, seed: 52 }),
        snd('tri', '三角鐵', null, { kind: 'bell', dur: 0.72, f1: 1240, f2: 1860, decay: 3.2, edge: 2.4, seed: 53 }),
        snd('guiro', '刮葫', null, { kind: 'guiro', dur: 0.36, rateHz: 20, decay: 3.2, seed: 54 }),
        snd('rim', '鼓邊', null, { kind: 'rim', dur: 0.075, f: 510, decay: 62, seed: 55 }),
        snd('finger', '指鈴', null, { kind: 'bell', dur: 0.18, f1: 1580, f2: 2140, decay: 11, edge: 3.2, seed: 56 })
      ]
    }
  };

  function kitList() {
    return Object.keys(KITS).map(function (id) { return { id: id, name: KITS[id].name }; });
  }

  function resolveSound(kit, sound) {
    var pack = KITS[kit] || KITS.acoustic;
    var sounds = pack.sounds;
    for (var i = 0; i < sounds.length; i++) if (sounds[i].id === sound) return sounds[i];
    return sounds[0];
  }

  function clampBpm(n) {
    n = Math.round(+n);
    if (!(n > 0)) n = 100;
    if (n < BPM_MIN) return BPM_MIN;
    if (n > BPM_MAX) return BPM_MAX;
    return n;
  }

  function clampVol(n) {
    n = Math.round(+n);
    if (!(n >= 0)) return 0;
    if (n > 100) return 100;
    return n;
  }

  function cleanName(s, fallback) {
    s = (s == null ? '' : String(s)).replace(/[\u0000-\u001f]/g, '').trim();
    if (!s) return fallback;
    return s.slice(0, 40);
  }

  function emptySteps(count) {
    var n = count > 0 ? count | 0 : STEPS;
    var s = [];
    for (var i = 0; i < n; i++) s.push(0);
    return s;
  }

  function copySteps(raw, count) {
    var steps = emptySteps(count);
    if (!raw) return steps;
    for (var i = 0; i < steps.length; i++) {
      var v = +raw[i];
      if (!(v > 0)) v = 0;
      if (v > 1) v = 1;
      steps[i] = v;
    }
    return steps;
  }

  // 對不到新格子的音丟掉，不挪到隔壁拍。超過新小節的也丟掉。
  function remapSteps(steps, fromRes, toRes, toCount) {
    var from = resolveResolution(fromRes);
    var to = resolveResolution(toRes);
    var out = emptySteps(toCount);
    var src = steps || [];
    for (var s = 0; s < src.length; s++) {
      var vel = +src[s] || 0;
      if (!(vel > 0)) continue;
      if (vel > 1) vel = 1;
      var mapped = s * to / from;
      var idx = Math.round(mapped);
      if (Math.abs(mapped - idx) > 1e-6) continue;
      if (idx < 0 || idx >= out.length) continue;
      if (vel > out[idx]) out[idx] = vel;
    }
    return out;
  }

  function mapStepIndex(index, fromRes, toRes, toCount) {
    var from = resolveResolution(fromRes);
    var to = resolveResolution(toRes);
    var n = toCount > 0 ? toCount | 0 : 1;
    var idx = Math.round((+index || 0) * to / from);
    return ((idx % n) + n) % n;
  }

  function stepSeconds(bpm, resolution) {
    var res = resolution == null ? 16 : resolveResolution(resolution);
    return (60 / clampBpm(bpm)) * (4 / res);
  }

  /* 從 nextTime 起，把 time < horizon 的步排進佇列。不修改輸入。未給步數時維持 16 步、十六分音符。 */
  function takeEvents(bpm, stepIndex, nextTime, horizon, maxEvents, count, resolution) {
    var n = count > 0 ? count | 0 : STEPS;
    var dur = stepSeconds(bpm, resolution);
    var step = ((stepIndex % n) + n) % n;
    var time = +nextTime;
    if (!(time >= 0) && time !== 0) time = 0;
    var limit = maxEvents > 0 ? maxEvents | 0 : 64;
    var events = [];
    var guard = 0;
    while (time < horizon && events.length < limit && guard < 10000) {
      events.push({ step: step, time: time });
      time += dur;
      step = (step + 1) % n;
      guard++;
    }
    return { events: events, stepIndex: step, nextTime: time };
  }

  function trackFrom(raw, usedIds, seqBox, index, count) {
    var kit = raw && KITS[raw.kit] ? raw.kit : 'acoustic';
    var meta = resolveSound(kit, raw && raw.sound);
    var id = raw && typeof raw.id === 'string' ? raw.id : '';
    if (!id || usedIds[id]) {
      id = 't' + seqBox.n;
      seqBox.n += 1;
    }
    usedIds[id] = true;
    var m = /^t(\d+)$/.exec(id);
    if (m) seqBox.n = Math.max(seqBox.n, +m[1] + 1);
    return {
      id: id,
      name: cleanName(raw && raw.name, meta.name || ('音軌 ' + (index + 1))),
      kit: kit,
      sound: meta.id,
      mute: !!(raw && raw.mute),
      volume: clampVol(raw && raw.volume != null ? raw.volume : 80),
      steps: copySteps(raw && raw.steps, count)
    };
  }

  function normalize(data) {
    data = data && typeof data === 'object' ? data : {};
    var meter = resolveMeter(data.meter);
    var resolution = resolveResolution(data.resolution);
    var count = stepsPerBar(meter, resolution);
    var used = {};
    var seqBox = { n: 1 };
    var tracks = [];
    var list = Array.isArray(data.tracks) ? data.tracks : [];
    for (var i = 0; i < list.length && tracks.length < MAX_TRACKS; i++) {
      if (!list[i] || typeof list[i] !== 'object') continue;
      tracks.push(trackFrom(list[i], used, seqBox, tracks.length, count));
    }
    if (typeof data.seq === 'number' && data.seq > seqBox.n) seqBox.n = data.seq | 0;
    return {
      version: 1,
      name: cleanName(data.name, '未命名'),
      bpm: clampBpm(data.bpm == null ? 100 : data.bpm),
      meter: meter.id,
      resolution: resolution,
      seq: seqBox.n,
      tracks: tracks
    };
  }

  function stepsOn(indexes) {
    var s = emptySteps();
    indexes.forEach(function (i) { if (i >= 0 && i < STEPS) s[i] = 1; });
    return s;
  }

  function defaultProject() {
    var hat = stepsOn([0, 2, 4, 6, 8, 12, 14]);
    return normalize({
      name: '未命名',
      bpm: 96,
      meter: '4/4',
      resolution: 16,
      seq: 5,
      tracks: [
        { id: 't1', name: '底鼓', kit: 'acoustic', sound: 'kick', volume: 100, steps: stepsOn([0, 8, 14]) },
        { id: 't2', name: '軍鼓', kit: 'acoustic', sound: 'snare', volume: 88, steps: stepsOn([4, 12]) },
        { id: 't3', name: '閉鈸', kit: 'acoustic', sound: 'chat', volume: 52, steps: hat },
        { id: 't4', name: '開鈸', kit: 'acoustic', sound: 'ohat', volume: 64, steps: stepsOn([10]) }
      ]
    });
  }

  function parseProject(input) {
    var data = typeof input === 'string' ? JSON.parse(input) : input;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('格式不對');
    if (data.format === FORMAT && data.project && typeof data.project === 'object') data = data.project;
    if (!Array.isArray(data.tracks)) throw new Error('缺少音軌');
    return normalize(data);
  }

  function serializeProject(project) {
    return JSON.stringify(normalize(project));
  }

  function wrapProject(project, exportedAt) {
    return {
      format: FORMAT,
      version: 1,
      exportedAt: exportedAt || null,
      project: normalize(project)
    };
  }

  function findTrack(project, id) {
    for (var i = 0; i < project.tracks.length; i++) if (project.tracks[i].id === id) return project.tracks[i];
    return null;
  }

  function addTrack(project, partial) {
    partial = partial || {};
    if (project.tracks.length >= MAX_TRACKS) return null;
    var kit = KITS[partial.kit] ? partial.kit : 'acoustic';
    var meta = resolveSound(kit, partial.sound || 'kick');
    var id = 't' + (project.seq || 1);
    project.seq = (project.seq || 1) + 1;
    var track = {
      id: id,
      name: cleanName(partial.name, meta.name),
      kit: kit,
      sound: meta.id,
      mute: !!partial.mute,
      volume: clampVol(partial.volume == null ? 80 : partial.volume),
      steps: copySteps(partial.steps, stepCount(project))
    };
    project.tracks.push(track);
    return track;
  }

  function setGrid(project, meterId, resolution) {
    var meter = resolveMeter(meterId == null ? project.meter : meterId);
    var res = resolveResolution(resolution == null ? project.resolution : resolution);
    var count = stepsPerBar(meter, res);
    var same = project.meter === meter.id && project.resolution === res;
    if (same) {
      var fit = true;
      for (var i = 0; i < project.tracks.length; i++) if (project.tracks[i].steps.length !== count) fit = false;
      if (fit) return project;
    }
    var fromRes = resolveResolution(project.resolution);
    for (var t = 0; t < project.tracks.length; t++) {
      project.tracks[t].steps = remapSteps(project.tracks[t].steps, fromRes, res, count);
    }
    project.meter = meter.id;
    project.resolution = res;
    return project;
  }

  function removeTrack(project, id) {
    var next = [];
    var removed = false;
    for (var i = 0; i < project.tracks.length; i++) {
      if (project.tracks[i].id === id) removed = true;
      else next.push(project.tracks[i]);
    }
    project.tracks = next;
    return removed;
  }

  function toggleStep(project, trackId, index) {
    var t = findTrack(project, trackId);
    var n = stepCount(project);
    var i = index | 0;
    if (!t || i < 0 || i >= n) return false;
    t.steps[i] = t.steps[i] > 0 ? 0 : 1;
    return true;
  }

  function hitsAt(project, step) {
    var n = stepCount(project);
    var i = ((step % n) + n) % n;
    var out = [];
    var tracks = project && project.tracks || [];
    for (var n = 0; n < tracks.length; n++) {
      var t = tracks[n];
      var vel = +t.steps[i] || 0;
      if (t.mute || !(vel > 0)) continue;
      if (vel > 1) vel = 1;
      var vol = clampVol(t.volume) / 100;
      out.push({
        trackId: t.id,
        kit: t.kit,
        sound: t.sound,
        velocity: vel,
        gain: vol * vel
      });
    }
    return out;
  }

  function encodeWavMono(samples, sampleRate) {
  var n = samples.length;
  var rate = sampleRate > 0 ? sampleRate | 0 : 44100;
  var buffer = new ArrayBuffer(44 + n * 2);
  var view = new DataView(buffer);
  function str(offset, s) {
    for (var i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }
  str(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, n * 2, true);
  for (var i = 0; i < n; i++) {
    var s = +samples[i] || 0;
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    var v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7FFF);
    if (v < -32768) v = -32768;
    if (v > 32767) v = 32767;
    view.setInt16(44 + i * 2, v, true);
  }
  return buffer;
}

function upsertSlot(slots, entry, max) {
    max = max || 20;
    var name = cleanName(entry.name, '未命名');
    var next = [];
    (slots || []).forEach(function (s) { if (s && s.name !== name) next.push(s); });
    next.push({ name: name, savedAt: entry.savedAt || null, project: normalize(entry.project) });
    if (next.length > max) next = next.slice(next.length - max);
    return next;
  }

  var api = {
    STEPS: STEPS,
    BPM_MIN: BPM_MIN,
    BPM_MAX: BPM_MAX,
    MAX_TRACKS: MAX_TRACKS,
    FORMAT: FORMAT,
    METERS: METER_LIST,
    KITS: KITS,
    kitList: kitList,
    resolveSound: resolveSound,
    resolveMeter: resolveMeter,
    resolveResolution: resolveResolution,
    stepsPerBar: stepsPerBar,
    beatStarts: beatStarts,
    stepCount: stepCount,
    remapSteps: remapSteps,
    mapStepIndex: mapStepIndex,
    setGrid: setGrid,
    clampBpm: clampBpm,
    stepSeconds: stepSeconds,
    takeEvents: takeEvents,
    emptySteps: emptySteps,
    defaultProject: defaultProject,
    normalize: normalize,
    parseProject: parseProject,
    serializeProject: serializeProject,
    wrapProject: wrapProject,
    findTrack: findTrack,
    addTrack: addTrack,
    removeTrack: removeTrack,
    toggleStep: toggleStep,
    hitsAt: hitsAt,
    upsertSlot: upsertSlot,
    cleanName: cleanName,
    encodeWavMono: encodeWavMono
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MpcLogic = api;
})(typeof self !== 'undefined' ? self : this);
