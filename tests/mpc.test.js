const test = require('node:test');
const assert = require('node:assert');
const Logic = require('../mpc-logic.js');
const Synth = require('../mpc-synth.js');

test('step length at 120 BPM is a 16th note', function () {
  assert.strictEqual(Logic.stepSeconds(120), 0.125);
  assert.strictEqual(Logic.stepSeconds(60), 0.25);
});

test('BPM is clamped into 40..240', function () {
  assert.strictEqual(Logic.clampBpm(0), 100);
  assert.strictEqual(Logic.clampBpm('nope'), 100);
  assert.strictEqual(Logic.clampBpm(20), 40);
  assert.strictEqual(Logic.clampBpm(999), 240);
  assert.strictEqual(Logic.clampBpm(96.4), 96);
});

test('takeEvents schedules only steps before the horizon and wraps the bar', function () {
  var r = Logic.takeEvents(120, 14, 0, 0.3, 16);
  assert.deepStrictEqual(r.events.map(function (e) { return e.step; }), [14, 15, 0]);
  assert.ok(Math.abs(r.events[1].time - 0.125) < 1e-9);
  assert.ok(Math.abs(r.events[2].time - 0.25) < 1e-9);
  assert.strictEqual(r.stepIndex, 1);
  assert.ok(Math.abs(r.nextTime - 0.375) < 1e-9);
});

test('takeEvents does not emit a step that lands exactly on the horizon', function () {
  var r = Logic.takeEvents(120, 0, 0.125, 0.125, 8);
  assert.deepStrictEqual(r.events, []);
  assert.strictEqual(r.stepIndex, 0);
  assert.strictEqual(r.nextTime, 0.125);
});

test('takeEvents respects maxEvents', function () {
  var r = Logic.takeEvents(120, 0, 0, 10, 3);
  assert.strictEqual(r.events.length, 3);
  assert.strictEqual(r.stepIndex, 3);
});

test('default groove hits kick and hat on step 0, snare on step 4, open hat on step 10', function () {
  var p = Logic.defaultProject();
  var names = function (step) {
    return Logic.hitsAt(p, step).map(function (h) { return h.sound; }).sort();
  };
  assert.deepStrictEqual(names(0), ['chat', 'kick']);
  assert.deepStrictEqual(names(4), ['chat', 'snare']);
  assert.deepStrictEqual(names(10), ['ohat']);
  assert.deepStrictEqual(names(1), []);
  assert.strictEqual(Logic.hitsAt(p, 16)[0].sound === 'kick' || Logic.hitsAt(p, 16).some(function (h) { return h.sound === 'kick'; }), true);
});

test('mute and volume affect hits, not the stored pattern', function () {
  var p = Logic.defaultProject();
  var kick = Logic.findTrack(p, 't1');
  kick.mute = true;
  kick.volume = 0;
  var sounds = Logic.hitsAt(p, 0).map(function (h) { return h.sound; });
  assert.deepStrictEqual(sounds, ['chat']);
  kick.mute = false;
  kick.volume = 50;
  var hit = Logic.hitsAt(p, 0).filter(function (h) { return h.trackId === 't1'; })[0];
  assert.strictEqual(hit.gain, 0.5);
  assert.strictEqual(kick.steps[0], 1);
});

test('toggleStep flips only that step', function () {
  var p = Logic.defaultProject();
  assert.strictEqual(Logic.toggleStep(p, 't2', 4), true);
  assert.strictEqual(Logic.findTrack(p, 't2').steps[4], 0);
  assert.strictEqual(Logic.toggleStep(p, 't2', 4), true);
  assert.strictEqual(Logic.findTrack(p, 't2').steps[4], 1);
  assert.strictEqual(Logic.toggleStep(p, 'missing', 0), false);
  assert.strictEqual(Logic.toggleStep(p, 't2', 99), false);
});

test('add and remove tracks, capped at MAX_TRACKS', function () {
  var p = Logic.defaultProject();
  assert.strictEqual(p.tracks.length, 4);
  var added = Logic.addTrack(p, { kit: 'perc', sound: 'clave' });
  assert.strictEqual(added.kit, 'perc');
  assert.strictEqual(added.sound, 'clave');
  assert.strictEqual(added.name, '響棒');
  assert.strictEqual(p.tracks.length, 5);
  while (p.tracks.length < Logic.MAX_TRACKS) Logic.addTrack(p, {});
  assert.strictEqual(p.tracks.length, Logic.MAX_TRACKS);
  assert.strictEqual(Logic.addTrack(p, {}), null);
  assert.strictEqual(Logic.removeTrack(p, added.id), true);
  assert.strictEqual(Logic.findTrack(p, added.id), null);
  assert.strictEqual(Logic.removeTrack(p, added.id), false);
});

test('serialize and parse round-trip, including the export wrapper', function () {
  var p = Logic.defaultProject();
  p.bpm = 128;
  p.name = '週末';
  var json = Logic.serializeProject(p);
  var back = Logic.parseProject(json);
  assert.strictEqual(back.bpm, 128);
  assert.strictEqual(back.name, '週末');
  assert.strictEqual(back.tracks.length, 4);
  assert.deepStrictEqual(back.tracks[0].steps, p.tracks[0].steps);

  var wrapped = JSON.stringify(Logic.wrapProject(p, '2026-11-12T00:00:00.000Z'));
  var fromFile = Logic.parseProject(wrapped);
  assert.strictEqual(fromFile.bpm, 128);
  assert.strictEqual(fromFile.name, '週末');
});

test('parse rejects junk and clamps bad track fields', function () {
  assert.throws(function () { Logic.parseProject('{}'); }, /音軌/);
  assert.throws(function () { Logic.parseProject('null'); });
  assert.throws(function () { Logic.parseProject('{'); });
  var p = Logic.parseProject({
    name: '  太長的名字'.padEnd ? 'x' : 'x',
    bpm: 10,
    tracks: [
      { id: 't1', kit: 'nope', sound: 'nope', volume: 500, mute: 1, steps: [2, -1, 0.4, 0] },
      { id: 't1', kit: 'electronic', sound: 'zap', volume: -5, steps: [] }
    ]
  });
  assert.strictEqual(p.bpm, 40);
  assert.strictEqual(p.tracks[0].kit, 'acoustic');
  assert.strictEqual(p.tracks[0].sound, 'kick');
  assert.strictEqual(p.tracks[0].volume, 100);
  assert.strictEqual(p.tracks[0].mute, true);
  assert.strictEqual(p.tracks[0].steps[0], 1);
  assert.strictEqual(p.tracks[0].steps[1], 0);
  assert.strictEqual(p.tracks[0].steps[2], 0.4);
  assert.strictEqual(p.tracks[0].steps.length, 16);
  assert.notStrictEqual(p.tracks[1].id, p.tracks[0].id);
  assert.strictEqual(p.tracks[1].kit, 'electronic');
  assert.strictEqual(p.tracks[1].sound, 'zap');
  assert.strictEqual(p.tracks[1].volume, 0);
});

test('names are trimmed and control characters removed', function () {
  var p = Logic.normalize({ name: '  練習\n', tracks: [{ name: '底\u0000鼓' }] });
  assert.strictEqual(p.name, '練習');
  assert.strictEqual(p.tracks[0].name, '底鼓');
  var blank = Logic.normalize({ name: '   ', tracks: [] });
  assert.strictEqual(blank.name, '未命名');
});

test('named slots overwrite the same name and keep the newest at the end', function () {
  var a = Logic.defaultProject();
  a.bpm = 90;
  var b = Logic.defaultProject();
  b.bpm = 140;
  var slots = Logic.upsertSlot([], { name: 'A', savedAt: '1', project: a });
  slots = Logic.upsertSlot(slots, { name: 'B', savedAt: '2', project: a });
  slots = Logic.upsertSlot(slots, { name: 'A', savedAt: '3', project: b });
  assert.deepStrictEqual(slots.map(function (s) { return s.name; }), ['B', 'A']);
  assert.strictEqual(slots[1].project.bpm, 140);
  var many = [];
  for (var i = 0; i < 25; i++) many = Logic.upsertSlot(many, { name: 's' + i, project: a }, 20);
  assert.strictEqual(many.length, 20);
  assert.strictEqual(many[0].name, 's5');
  assert.strictEqual(many[19].name, 's24');
});

test('every kit has 16 distinct synthesized sounds', function () {
  var kits = Logic.kitList();
  assert.deepStrictEqual(kits.map(function (k) { return k.id; }), ['acoustic', 'electronic', 'perc']);
  kits.forEach(function (kit) {
    var sounds = Logic.KITS[kit.id].sounds;
    assert.strictEqual(sounds.length, 16);
    var ids = {};
    sounds.forEach(function (s) {
      assert.ok(s.name);
      assert.ok(!ids[s.id], s.id);
      ids[s.id] = true;
      var buf = Synth.renderVoice(48000, s.voice);
      assert.ok(buf.length > 100, s.id);
      var peak = 0;
      for (var i = 0; i < buf.length; i++) {
        assert.ok(Number.isFinite(buf[i]), kit.id + '/' + s.id);
        var a = buf[i] < 0 ? -buf[i] : buf[i];
        if (a > peak) peak = a;
      }
      assert.ok(peak > 0.05, kit.id + '/' + s.id + ' peak ' + peak);
      assert.ok(peak <= 0.980001);
    });
  });
});

test('renderVoice is deterministic', function () {
  var voice = Logic.KITS.acoustic.sounds[0].voice;
  var a = Synth.renderVoice(8000, voice);
  var b = Synth.renderVoice(8000, voice);
  assert.strictEqual(a.length, b.length);
  assert.strictEqual(a[20], b[20]);
  assert.notStrictEqual(a[20], 0);
});

test('WAV header matches 16-bit mono PCM', function () {
  var samples = new Float32Array([0, 0.5, -1]);
  var buf = Logic.encodeWavMono(samples, 44100);
  var view = new DataView(buf);
  assert.strictEqual(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), 'RIFF');
  assert.strictEqual(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)), 'WAVE');
  assert.strictEqual(view.getUint32(4, true), 36 + 6);
  assert.strictEqual(view.getUint16(20, true), 1);
  assert.strictEqual(view.getUint16(22, true), 1);
  assert.strictEqual(view.getUint32(24, true), 44100);
  assert.strictEqual(view.getUint16(34, true), 16);
  assert.strictEqual(view.getInt16(44, true), 0);
  assert.strictEqual(view.getInt16(46, true), 16384);
  assert.strictEqual(view.getInt16(48, true), -32768);
  assert.strictEqual(buf.byteLength, 44 + 6);
});

test('step length follows resolution; BPM stays a quarter note', function () {
  assert.strictEqual(Logic.stepSeconds(120), 0.125);
  assert.strictEqual(Logic.stepSeconds(120, 16), 0.125);
  assert.strictEqual(Logic.stepSeconds(120, 8), 0.25);
  assert.strictEqual(Logic.stepSeconds(120, 32), 0.0625);
  assert.strictEqual(Logic.stepSeconds(120, 7), 0.125);
});

test('steps per bar come from meter and resolution', function () {
  assert.deepStrictEqual(Logic.METERS.map(function (m) { return m.id; }),
    ['2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '5/8', '6/8', '7/8', '9/8', '12/8']);
  assert.strictEqual(Logic.stepsPerBar('4/4', 8), 8);
  assert.strictEqual(Logic.stepsPerBar('4/4', 16), 16);
  assert.strictEqual(Logic.stepsPerBar('4/4', 32), 32);
  assert.strictEqual(Logic.stepsPerBar('3/4', 16), 12);
  assert.strictEqual(Logic.stepsPerBar('6/8', 8), 6);
  assert.strictEqual(Logic.stepsPerBar('6/8', 16), 12);
  assert.strictEqual(Logic.stepsPerBar('6/8', 32), 24);
  assert.strictEqual(Logic.stepsPerBar('12/8', 32), 48);
  assert.strictEqual(Logic.stepsPerBar('7/4', 32), 56);
  assert.strictEqual(Logic.stepsPerBar('nope', 16), 16);
  Logic.METERS.forEach(function (m) {
    [8, 16, 32].forEach(function (res) {
      var starts = Logic.beatStarts(m, res);
      var per = res / m.unit;
      var end = starts[starts.length - 1] + m.groups[m.groups.length - 1] * per;
      assert.strictEqual(end, Logic.stepsPerBar(m, res), m.id + ' ' + res);
      assert.strictEqual(starts[0], 0);
    });
  });
  assert.deepStrictEqual(Logic.beatStarts('4/4', 16), [0, 4, 8, 12]);
  assert.deepStrictEqual(Logic.beatStarts('6/8', 16), [0, 6]);
  assert.deepStrictEqual(Logic.beatStarts('7/8', 8), [0, 2, 4]);
  assert.deepStrictEqual(Logic.beatStarts('12/8', 8), [0, 3, 6, 9]);
});

test('takeEvents can wrap a shorter bar at a coarser resolution', function () {
  var r = Logic.takeEvents(120, 5, 0, 1, 8, 6, 8);
  assert.deepStrictEqual(r.events.map(function (e) { return e.step; }), [5, 0, 1, 2]);
  assert.ok(Math.abs(r.events[1].time - 0.25) < 1e-9);
  assert.strictEqual(r.stepIndex, 3);
  assert.ok(Math.abs(r.nextTime - 1) < 1e-9);
});

test('old projects without meter load as 4/4 sixteenths', function () {
  var p = Logic.parseProject({ bpm: 90, tracks: [{ id: 't1', sound: 'kick', steps: [1, 0, 0, 0, 1] }] });
  assert.strictEqual(p.meter, '4/4');
  assert.strictEqual(p.resolution, 16);
  assert.strictEqual(p.bars, 1);
  assert.strictEqual(p.tracks[0].steps.length, 16);
  assert.strictEqual(p.tracks[0].steps[0], 1);
  assert.strictEqual(p.tracks[0].steps[4], 1);
  assert.strictEqual(p.tracks[0].steps[5], 0);
  var wrapped = Logic.parseProject(JSON.stringify(Logic.wrapProject(p)));
  assert.strictEqual(wrapped.meter, '4/4');
  assert.strictEqual(wrapped.resolution, 16);
  assert.strictEqual(wrapped.bars, 1);
});

test('changing resolution keeps on-grid notes and drops the rest', function () {
  var p = Logic.parseProject({
    meter: '4/4',
    resolution: 16,
    tracks: [{ id: 't1', steps: [1, 0.4, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0] }]
  });
  Logic.setGrid(p, '4/4', 8);
  assert.strictEqual(p.resolution, 8);
  assert.strictEqual(p.tracks[0].steps.length, 8);
  assert.deepStrictEqual(p.tracks[0].steps, [1, 0, 1, 0, 0, 0, 0, 1]);
  Logic.setGrid(p, '4/4', 32);
  assert.strictEqual(p.tracks[0].steps.length, 32);
  assert.strictEqual(p.tracks[0].steps[0], 1);
  assert.strictEqual(p.tracks[0].steps[8], 1);
  assert.strictEqual(p.tracks[0].steps[28], 1);
  assert.strictEqual(p.tracks[0].steps[1], 0);
  assert.strictEqual(Logic.mapStepIndex(14, 16, 8, 8), 7);
  assert.strictEqual(Logic.mapStepIndex(1, 16, 8, 8), 1);
});

test('changing meter keeps notes that still fit and drops the rest', function () {
  var p = Logic.defaultProject();
  var kick = Logic.findTrack(p, 't1').steps.slice();
  Logic.setGrid(p, '2/4', 16);
  assert.strictEqual(p.meter, '2/4');
  assert.strictEqual(Logic.stepCount(p), 16);
  assert.strictEqual(Logic.findTrack(p, 't1').steps[0], kick[0]);
  assert.strictEqual(Logic.findTrack(p, 't1').steps[7], 0);
  assert.strictEqual(Logic.findTrack(p, 't1').steps.length, 16);
  Logic.setGrid(p, '5/4', 16);
  assert.strictEqual(Logic.stepCount(p), 40);
  assert.strictEqual(Logic.findTrack(p, 't1').steps[0], 1);
  assert.strictEqual(Logic.findTrack(p, 't1').steps[19], 0);
  Logic.setGrid(p, '6/8', 16);
  assert.strictEqual(Logic.stepCount(p), 24);
  assert.strictEqual(p.resolution, 16);
  assert.strictEqual(Logic.stepSeconds(p.bpm, p.resolution), Logic.stepSeconds(p.bpm, 16));
});

test('new projects default to 2 bars and old one-bar files stay 1 bar', function () {
  var fresh = Logic.defaultProject();
  assert.strictEqual(fresh.bars, 2);
  assert.strictEqual(Logic.stepCount(fresh), 32);
  assert.strictEqual(fresh.tracks[0].steps[0], fresh.tracks[0].steps[16]);
  assert.strictEqual(fresh.tracks[0].steps[14], fresh.tracks[0].steps[30]);
  var old = Logic.parseProject({
    meter: '4/4',
    resolution: 16,
    tracks: [{ id: 't1', steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] }]
  });
  assert.strictEqual(old.bars, 1);
  assert.strictEqual(old.tracks[0].steps.length, 16);
  assert.strictEqual(old.tracks[0].steps[8], 1);
  var saved = Logic.parseProject(JSON.stringify(Logic.wrapProject(fresh)));
  assert.strictEqual(saved.bars, 2);
  assert.strictEqual(saved.tracks[0].steps.length, 32);
});

test('adding bars copies the last bar; removing drops only the tail', function () {
  var p = Logic.parseProject({
    bars: 1,
    tracks: [{ id: 't1', steps: [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }]
  });
  assert.strictEqual(Logic.tailHasNotes(p, 1), false);
  Logic.resizeBars(p, 2);
  assert.strictEqual(p.bars, 2);
  assert.strictEqual(p.tracks[0].steps.length, 32);
  assert.strictEqual(p.tracks[0].steps[16], 1);
  assert.strictEqual(p.tracks[0].steps[20], 1);
  p.tracks[0].steps[18] = 1;
  assert.strictEqual(Logic.tailHasNotes(p, 1), true);
  Logic.resizeBars(p, 1);
  assert.strictEqual(p.bars, 1);
  assert.strictEqual(p.tracks[0].steps.length, 16);
  assert.strictEqual(p.tracks[0].steps[0], 1);
  Logic.resizeBars(p, 9);
  assert.strictEqual(p.bars, Logic.BARS_MAX);
  assert.strictEqual(Logic.stepCount(p), 16 * 8);
});

test('step widths fill the row exactly for one or two visible bars', function () {
  function sum(plan, count, bars) {
    var shown = bars === 1 ? 1 : 2;
    var gaps = (count - shown) * plan.gap + (shown - 1) * plan.barGap;
    var w = 0;
    for (var i = 0; i < plan.widths.length; i++) w += plan.widths[i];
    return w + gaps;
  }
  [320, 568, 700, 844].forEach(function (width) {
    [8, 16, 32, 56, 112].forEach(function (count) {
      var bars = count > 56 ? 2 : 1;
      if (count === 112) bars = 2;
      if (count === 16 || count === 8) bars = 1;
      var plan = Logic.layoutSteps(width, count, bars);
      assert.strictEqual(plan.widths.length, count);
      assert.strictEqual(sum(plan, count, bars), width, width + ' ' + count);
      assert.ok(plan.min >= 1);
    });
  });
  var one = Logic.layoutSteps(800, 16, 1);
  var two = Logic.layoutSteps(800, 32, 2);
  assert.ok(one.min > two.min);
  var dense = Logic.layoutSteps(700, 112, 2);
  assert.strictEqual(dense.min, 4);
  assert.strictEqual(Logic.layoutSteps(560, 112, 2).min, 3);
});

test('each kit sound has its own Morandi color', function () {
  Logic.kitList().forEach(function (kit) {
    var seen = {};
    Logic.KITS[kit.id].sounds.forEach(function (s) {
      var c = Logic.soundColor(kit.id, s.id);
      assert.match(c, /^#[0-9a-f]{6}$/);
      assert.ok(!seen[c], kit.id + ' ' + s.id);
      seen[c] = true;
      assert.match(Logic.inkOn(c), /^#/);
    });
  });
});

test('quick fills follow the meter and add without erasing other hits', function () {
  assert.deepStrictEqual(Logic.presetMask('downbeat', '4/4', 16), [0]);
  assert.deepStrictEqual(Logic.presetMask('beats', '4/4', 16), [0, 4, 8, 12]);
  assert.deepStrictEqual(Logic.presetMask('offbeat', '4/4', 16), [2, 6, 10, 14]);
  assert.deepStrictEqual(Logic.presetMask('backbeat', '4/4', 16), [4, 12]);
  assert.deepStrictEqual(Logic.presetMask('backbeat', '2/4', 16), [4]);
  assert.deepStrictEqual(Logic.presetMask('eighths', '4/4', 16), [0, 2, 4, 6, 8, 10, 12, 14]);
  assert.deepStrictEqual(Logic.presetMask('sixteenths', '4/4', 32), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);
  assert.strictEqual(Logic.presetMask('sixteenths', '4/4', 8), null);
  assert.strictEqual(Logic.presetEnabled('sixteenths', '4/4', 8, 1), false);
  assert.strictEqual(Logic.presetEnabled('backbeat', '6/8', 16, 1), false);
  assert.deepStrictEqual(Logic.presetMask('beats', '6/8', 16), [0, 6]);
  assert.deepStrictEqual(Logic.presetMask('offbeat', '6/8', 16), [3, 9]);
  assert.strictEqual(Logic.presetMask('offbeat', '6/8', 8), null);
  assert.deepStrictEqual(Logic.presetMask('beats', '7/8', 8), [0, 2, 4]);
  assert.deepStrictEqual(Logic.presetMask('offbeat', '7/8', 8), [1, 3]);
  assert.deepStrictEqual(Logic.presetMask('beats', '5/8', 16), [0, 6]);
  assert.deepStrictEqual(Logic.presetMask('offbeat', '5/8', 16), [3, 8]);

  var src = [0.5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var added = Logic.applyPreset(src, 'downbeat', '4/4', 16, 2);
  assert.strictEqual(src[0], 0.5);
  assert.strictEqual(added[0], 0.5);
  assert.strictEqual(added[1], 1);
  assert.strictEqual(added[16], 1);
  assert.strictEqual(added.length, 32);
  var cleared = Logic.applyPreset(added, 'clear', '4/4', 16, 2);
  assert.ok(cleared.every(function (v) { return v === 0; }));
  var flipped = Logic.applyPreset([1, 0, 0.4], 'invert', '4/4', 16, 1);
  assert.strictEqual(flipped[0], 0);
  assert.strictEqual(flipped[1], 1);
  assert.strictEqual(flipped[2], 0);
  var copied = Logic.applyPreset([1, 0, 1, 0], 'copybar', '2/4', 8, 3);
  assert.strictEqual(Logic.stepsPerBar('2/4', 8), 4);
  assert.deepStrictEqual(copied.slice(0, 4), [1, 0, 1, 0]);
  assert.deepStrictEqual(copied.slice(4, 8), [1, 0, 1, 0]);
  assert.deepStrictEqual(copied.slice(8, 12), [1, 0, 1, 0]);
  assert.strictEqual(Logic.presetEnabled('copybar', '4/4', 16, 1), false);
});

test('setGrid is a no-op when meter and resolution do not change', function () {
  var p = Logic.defaultProject();
  var before = p.tracks[0].steps.slice();
  Logic.setGrid(p, '4/4', 16);
  assert.deepStrictEqual(p.tracks[0].steps, before);
});
