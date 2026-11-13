const test = require('node:test');
const assert = require('node:assert');
const Grooves = require('../mpc-presets.js');
const Logic = require('../mpc-logic.js');

test('rhythm presets match their meter, sounds, and length', function () {
  assert.ok(Grooves.list.length >= 10 && Grooves.list.length <= 12);
  var ids = {};
  Grooves.list.forEach(function (p) {
    assert.ok(p.id && !ids[p.id], p.id);
    ids[p.id] = true;
    assert.ok(p.name);
    assert.ok(p.bpm >= 40 && p.bpm <= 240, p.id + ' bpm');
    assert.strictEqual(Logic.resolveMeter(p.meter).id, p.meter);
    assert.ok(p.resolution === 8 || p.resolution === 16 || p.resolution === 32);
    assert.ok(p.bars >= 1 && p.bars <= Logic.BARS_MAX);
    assert.ok(p.tracks.length >= 1 && p.tracks.length <= Logic.MAX_TRACKS);
    var n = Logic.stepsPerBar(p.meter, p.resolution) * p.bars;
    var any = false;
    p.tracks.forEach(function (t) {
      assert.ok(Logic.KITS[t.kit], t.kit);
      assert.ok(Logic.KITS[t.kit].sounds.some(function (s) { return s.id === t.sound; }), p.id + ' ' + t.sound);
      assert.strictEqual(t.steps.length, n, p.id + ' ' + t.name);
      assert.ok(t.volume >= 0 && t.volume <= 100);
      t.steps.forEach(function (v) {
        assert.ok(v >= 0 && v <= 1);
        if (v > 0) any = true;
      });
    });
    assert.ok(any, p.id);
    var loaded = Logic.parseProject({
      bpm: p.bpm, meter: p.meter, resolution: p.resolution, bars: p.bars, tracks: p.tracks
    });
    assert.strictEqual(loaded.bars, p.bars);
    assert.strictEqual(loaded.tracks[0].steps.length, n);
  });
});

test('a few grooves land on the beats they are known for', function () {
  function byId(id) { return Grooves.list.filter(function (p) { return p.id === id; })[0]; }
  function ons(track) {
    return track.steps.map(function (v, i) { return v > 0 ? i : -1; }).filter(function (i) { return i >= 0; });
  }
  var rock = byId('rock');
  assert.deepStrictEqual(ons(rock.tracks[1]).slice(0, 2), [2, 6]);
  var bossa = byId('bossa');
  assert.deepStrictEqual(ons(bossa.tracks[0]).slice(0, 2), [0, 3]);
  assert.ok(ons(bossa.tracks[1]).indexOf(0) >= 0);
  assert.strictEqual(byId('waltz').meter, '3/4');
  assert.strictEqual(byId('ballad68').meter, '6/8');
  assert.strictEqual(byId('shuffle').meter, '12/8');
  assert.strictEqual(byId('funk').resolution, 16);
});
