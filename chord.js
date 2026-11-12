/* 和弦辨識：以音高類別集合比對各根音的和弦模板（可在瀏覽器與 Node 使用） */
(function (root) {
  'use strict';
  var NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  // 依「簡單程度」排序；越前面越優先
  var BASE = [
    ['5', [0, 7]],
    ['', [0, 4, 7]],
    ['m', [0, 3, 7]],
    ['dim', [0, 3, 6]],
    ['aug', [0, 4, 8]],
    ['sus4', [0, 5, 7]],
    ['sus2', [0, 2, 7]],
    ['7', [0, 4, 7, 10]],
    ['m7', [0, 3, 7, 10]],
    ['maj7', [0, 4, 7, 11]],
    ['6', [0, 4, 7, 9]],
    ['m6', [0, 3, 7, 9]],
    ['m7b5', [0, 3, 6, 10]],
    ['dim7', [0, 3, 6, 9]],
    ['7sus4', [0, 5, 7, 10]],
    ['mMaj7', [0, 3, 7, 11]],
    ['add9', [0, 2, 4, 7]],
    ['9', [0, 2, 4, 7, 10]],
    ['m9', [0, 2, 3, 7, 10]],
    ['maj9', [0, 2, 4, 7, 11]],
    ['11', [0, 2, 4, 5, 7, 10]],
    ['11', [0, 2, 5, 7, 10]],        // 常見省略三音的 11
    ['13', [0, 2, 4, 7, 9, 10]],
    ['13', [0, 4, 7, 9, 10]]         // 省略九音的 13
  ];
  // 七和弦以上允許省略五音（加上少量懲罰）
  var OMIT5_OK = { '7': 1, 'm7': 1, 'maj7': 1, '9': 1, 'm9': 1, 'maj9': 1, '11': 1, '13': 1, 'mMaj7': 1 };
  var TEMPLATES = [];
  BASE.forEach(function (t, i) {
    TEMPLATES.push({ q: t[0], mask: toMask(t[1]), rank: i });
    if (OMIT5_OK[t[0]]) {
      var iv = t[1].filter(function (x) { return x !== 7; });
      if (iv.length >= 3) TEMPLATES.push({ q: t[0], mask: toMask(iv), rank: i + 4, rootBassOnly: true });
    }
  });
  var INTERVALS = ['八度', '小二度', '大二度', '小三度', '大三度', '完全四度', '三全音', '完全五度', '小六度', '大六度', '小七度', '大七度'];

  function toMask(arr) { var m = 0; arr.forEach(function (x) { m |= 1 << (x % 12); }); return m; }
  function rotMask(pcMask, r) { // 以 r 為根音的相對音程遮罩
    var m = 0;
    for (var p = 0; p < 12; p++) if (pcMask & (1 << p)) m |= 1 << ((p - r + 12) % 12);
    return m;
  }

  /**
   * @param {number[]} midis 目前按住的 MIDI 音高（可重複、任意順序）
   * @returns {{name:string, root:string, quality:string, bass:string, interval:string}|null}
   */
  function detectChord(midis) {
    if (!midis || midis.length < 2) return null;
    var uniq = Array.from(new Set(midis)).sort(function (a, b) { return a - b; });
    if (uniq.length < 2) return null;
    var bassPc = ((uniq[0] % 12) + 12) % 12;
    var pcMask = 0;
    uniq.forEach(function (m) { pcMask |= 1 << (((m % 12) + 12) % 12); });
    var pcCount = 0; for (var i = 0; i < 12; i++) if (pcMask & (1 << i)) pcCount++;

    var interval = '';
    if (pcCount <= 2) {
      var hi = uniq[uniq.length - 1], lo = uniq[0];
      var d = (hi - lo) % 12;
      if (pcCount === 1) interval = '八度';
      else {
        // 兩個音高類別：找出非低音的另一音與低音的距離
        var other = -1;
        for (var p = 0; p < 12; p++) if ((pcMask & (1 << p)) && p !== bassPc) other = p;
        interval = INTERVALS[(other - bassPc + 12) % 12];
      }
      void d;
    }

    var best = null;
    for (var r = 0; r < 12; r++) {
      if (!(pcMask & (1 << r))) continue;
      var rel = rotMask(pcMask, r);
      for (var t = 0; t < TEMPLATES.length; t++) {
        var tp = TEMPLATES[t];
        if (tp.mask !== rel) continue;
        if ((tp.q === '5' || tp.rootBassOnly) && r !== bassPc) continue; // 強力和弦與省略五音的和弦只在根音於低音時
        var score = tp.rank + (r === bassPc ? 0 : 100);
        if (!best || score < best.score) best = { score: score, r: r, q: tp.q };
      }
    }
    if (!best) {
      return interval ? { name: '', root: '', quality: '', bass: NAMES[bassPc], interval: interval } : null;
    }
    var name = NAMES[best.r] + best.q + (best.r === bassPc ? '' : '/' + NAMES[bassPc]);
    return { name: name, root: NAMES[best.r], quality: best.q, bass: NAMES[bassPc], interval: interval };
  }

  var api = { detectChord: detectChord, NOTE_NAMES: NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Chord = api;
})(typeof self !== 'undefined' ? self : this);
