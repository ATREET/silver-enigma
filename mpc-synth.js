/* 鼓聲合成：純函式，回傳 Float32Array。瀏覽器與 Node 都能跑，不依賴 AudioContext。 */
(function (root) {
  'use strict';

  function noise(i, seed) {
    var x = Math.sin((i + 1) * (12.9898 + (seed || 1) * 0.173)) * 43758.5453;
    return x - Math.floor(x);
  }

  function fadeTail(out, rate) {
    var n = out.length;
    var fadeN = Math.min(n, Math.max(1, Math.floor(rate * 0.004)));
    for (var i = 0; i < fadeN; i++) out[n - 1 - i] *= i / fadeN;
  }

  function limitPeak(out, maxPeak) {
    var peak = 0;
    for (var i = 0; i < out.length; i++) {
      var a = out[i] < 0 ? -out[i] : out[i];
      if (a > peak) peak = a;
    }
    if (peak > maxPeak) {
      var g = maxPeak / peak;
      for (var j = 0; j < out.length; j++) out[j] *= g;
    }
  }

  function renderKick(out, rate, v) {
    var phase = 0;
    var f0 = v.f0 || 46;
    var f1 = v.f1 || 150;
    var sweep = v.sweep || 14;
    var amp = v.amp || 7;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      var f = f0 + (f1 - f0) * Math.exp(-t * sweep);
      phase += 2 * Math.PI * f / rate;
      var body = Math.sin(phase) * Math.exp(-t * amp);
      var click = (noise(i, v.seed) * 2 - 1) * Math.exp(-t * (v.clickDecay || 80)) * (v.click || 0);
      var s = body + click;
      if (v.drive) s = Math.tanh(s * v.drive);
      out[i] = s;
    }
  }

  function renderSnare(out, rate, v) {
    var phase = 0;
    var lp = 0;
    var f = v.f || 188;
    var coef = v.lpCoef == null ? 0.38 : v.lpCoef;
    var toneMix = v.tone == null ? 0.42 : v.tone;
    var noiseMix = v.noise == null ? 0.58 : v.noise;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      phase += 2 * Math.PI * f / rate;
      var tone = Math.sin(phase) * Math.exp(-t * (v.toneDecay || 22));
      var ns = noise(i, v.seed) * 2 - 1;
      lp += coef * (ns - lp);
      var nz = (ns - lp) * Math.exp(-t * (v.noiseDecay || 12));
      out[i] = tone * toneMix + nz * noiseMix;
    }
  }

  function renderHat(out, rate, v) {
    var lp = 0;
    var phase = 0;
    var smooth = v.smooth == null ? 0.16 : v.smooth;
    var decay = v.decay || 30;
    var metal = v.metal || 0;
    var f = v.f || 6200;
    var gain = v.gain == null ? 0.55 : v.gain;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      var ns = noise(i, v.seed) * 2 - 1;
      lp += smooth * (ns - lp);
      var hp = ns - lp;
      phase += 2 * Math.PI * f / rate;
      var ring = Math.sin(phase);
      var e = Math.exp(-t * decay);
      out[i] = (hp * (1 - metal) + ring * metal * 0.35) * e * gain;
    }
  }

  function renderClap(out, rate, v) {
    var bursts = v.bursts || [0, 0.011, 0.022];
    var lp = 0;
    var burstK = v.burst || 48;
    var tail = v.tail || 9;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      var e = 0;
      for (var b = 0; b < bursts.length; b++) {
        var dt = t - bursts[b];
        if (dt >= 0) e += Math.exp(-dt * burstK);
      }
      e *= Math.exp(-t * tail);
      var ns = noise(i, v.seed) * 2 - 1;
      lp += 0.32 * (ns - lp);
      out[i] = (ns - lp) * e * 0.42;
    }
  }

  function renderTom(out, rate, v) {
    var phase = 0;
    var f0 = v.f0 || v.f || 120;
    var f1 = v.f1 || f0 * 1.35;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      var f = f0 + (f1 - f0) * Math.exp(-t * (v.sweep || 11));
      phase += 2 * Math.PI * f / rate;
      var body = Math.sin(phase) * Math.exp(-t * (v.amp || 8));
      var click = (noise(i, v.seed) * 2 - 1) * Math.exp(-t * 55) * (v.click || 0.07);
      out[i] = body + click;
    }
  }

  function renderCymbal(out, rate, v) {
    var ratios = [1, 1.42, 1.78, 2.21, 2.67, 3.31, 4.09];
    var phases = [0, 0, 0, 0, 0, 0, 0];
    var f = v.f || 360;
    var lp = 0;
    var decay = v.decay || 3;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      var s = 0;
      for (var k = 0; k < ratios.length; k++) {
        phases[k] += 2 * Math.PI * f * ratios[k] / rate;
        s += Math.sin(phases[k]) * (k % 2 ? 0.55 : 1);
      }
      s = Math.tanh(s * 0.4);
      var ns = noise(i, v.seed) * 2 - 1;
      lp += 0.22 * (ns - lp);
      var e = Math.exp(-t * decay);
      out[i] = (s * 0.32 + (ns - lp) * 0.38) * e;
    }
  }

  function renderBell(out, rate, v) {
    var f1 = v.f1 || 587;
    var f2 = v.f2 || 845;
    var p1 = 0;
    var p2 = 0;
    var edge = v.edge == null ? 5 : v.edge;
    var decay = v.decay || 8;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      p1 += 2 * Math.PI * f1 / rate;
      p2 += 2 * Math.PI * f2 / rate;
      var s = Math.tanh(Math.sin(p1) * edge) * 0.34 + Math.tanh(Math.sin(p2) * edge) * 0.2;
      out[i] = s * Math.exp(-t * decay);
    }
  }

  function renderRim(out, rate, v) {
    var phase = 0;
    var f = v.f || 700;
    var decay = v.decay || 60;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      phase += 2 * Math.PI * f / rate;
      var click = (noise(i, v.seed) * 2 - 1) * Math.exp(-t * 150) * (v.click == null ? 0.3 : v.click);
      out[i] = Math.sin(phase) * Math.exp(-t * decay) * 0.65 + click;
    }
  }

  function renderZap(out, rate, v) {
    var phase = 0;
    var f0 = v.f0 || 90;
    var f1 = v.f1 || 1100;
    var sweepTime = v.sweepTime || (v.dur || 0.2) * 0.75;
    if (sweepTime < 0.02) sweepTime = 0.02;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      var k = t / sweepTime;
      if (k > 1) k = 1;
      var f = f1 * Math.pow(f0 / f1, k);
      phase += 2 * Math.PI * f / rate;
      var s = Math.sin(phase) * Math.exp(-t * (v.amp || 7));
      if (v.drive) s = Math.tanh(s * v.drive);
      out[i] = s;
    }
  }

  function renderGuiro(out, rate, v) {
    var lp = 0;
    var hz = v.rateHz || 26;
    var decay = v.decay || 4;
    for (var i = 0; i < out.length; i++) {
      var t = i / rate;
      var ns = noise(i, v.seed) * 2 - 1;
      lp += 0.28 * (ns - lp);
      var g = 0.5 + 0.5 * Math.sin(2 * Math.PI * hz * t);
      g = Math.pow(g, 8);
      out[i] = (ns - lp) * g * Math.exp(-t * decay) * 0.75;
    }
  }

  var RENDER = {
    kick: renderKick,
    snare: renderSnare,
    hat: renderHat,
    clap: renderClap,
    tom: renderTom,
    cymbal: renderCymbal,
    bell: renderBell,
    rim: renderRim,
    zap: renderZap,
    guiro: renderGuiro
  };

  function renderVoice(rate, voice) {
    var dur = voice && voice.dur > 0 ? voice.dur : 0.2;
    var len = Math.max(1, Math.floor(rate * dur));
    var out = new Float32Array(len);
    var fn = RENDER[(voice && voice.kind) || ''] || renderRim;
    fn(out, rate, voice || {});
    fadeTail(out, rate);
    limitPeak(out, 0.98);
    return out;
  }

  var api = { renderVoice: renderVoice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MpcSynth = api;
})(typeof self !== 'undefined' ? self : this);
