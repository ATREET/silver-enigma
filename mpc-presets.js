/* 內建節奏。純資料；字串只是方便對拍，載入時就展開成步進。 */
(function (root) {
  'use strict';

  function decode(pattern, expect, label) {
    var map = { '.': 0, x: 1, g: 0.35, m: 0.55 };
    var out = [];
    for (var i = 0; i < pattern.length; i++) {
      var c = pattern.charAt(i);
      if (c === ' ' || c === '|' || c === '\n') continue;
      if (map[c] == null) throw new Error(label + ' bad ' + c);
      out.push(map[c]);
    }
    if (expect && out.length !== expect) throw new Error(label + ' len ' + out.length + ' != ' + expect);
    return out;
  }

  function T(name, kit, sound, volume, pattern, expect) {
    return { name: name, kit: kit, sound: sound, volume: volume, mute: false, steps: decode(pattern, expect, name) };
  }

  // 4/4 八分，兩小節 16 步。搖滾：底鼓在 1、3、3 的後半；軍鼓 2、4；閉鈸八分。第二小節最後加一記。
  var rock = {
    id: 'rock', name: '搖滾', bpm: 112, meter: '4/4', resolution: 8, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 100, 'x...xx..|x...xx.x', 16),
      T('軍鼓', 'acoustic', 'snare', 90, '..x...x.|..x...x.', 16),
      T('閉鈸', 'acoustic', 'chat', 52, 'xxxxxxxx|xxxxxxx.', 16),
      T('開鈸', 'acoustic', 'ohat', 58, '........|.......x', 16)
    ]
  };

  // 流行：底鼓在 1、2 的後半、3；拍手在 2、4。
  var pop = {
    id: 'pop', name: '流行', bpm: 118, meter: '4/4', resolution: 8, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 100, 'x..xx...|x..xx..x', 16),
      T('拍手', 'acoustic', 'clap', 86, '..x...x.|..x...x.', 16),
      T('閉鈸', 'acoustic', 'chat', 48, 'xxxxxxxx|xxxxxx.x', 16),
      T('開鈸', 'acoustic', 'ohat', 56, '........|......x.', 16)
    ]
  };

  // 放克：十六分。底鼓 1、2 的 a、3 的後半；軍鼓 2、4，中間有鬼音。第二小節最後四個十六分成填音。
  var funk = {
    id: 'funk', name: '放克', bpm: 102, meter: '4/4', resolution: 16, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 100, 'x......x..x.....|x......x..x..x..', 32),
      T('軍鼓', 'acoustic', 'snare', 88, '....x.g.....x.g.|....x.g.....xxxx', 32),
      T('閉鈸', 'acoustic', 'chat', 46, 'xmxmxmxmxmxmxmxm|xmxmxmxmxmxmxm..', 32),
      T('開鈸', 'acoustic', 'ohat', 54, '................|..............x.', 32)
    ]
  };

  // 嘻哈：電鼓。底鼓在 1 與 3 的後半；軍鼓 2、4；閉帽打八分。
  var hiphop = {
    id: 'hiphop', name: '嘻哈', bpm: 90, meter: '4/4', resolution: 16, bars: 2,
    tracks: [
      T('電底鼓', 'electronic', 'kick', 100, 'x.........x.....|x.........x..x..', 32),
      T('電軍鼓', 'electronic', 'snare', 90, '....x.......x...|....x.......x.g.', 32),
      T('閉帽', 'electronic', 'chat', 50, 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.', 32)
    ]
  };

  // R&B：底鼓帶切分（1、1 的 a、3 的後半），軍鼓 2、4 並帶鬼音，閉鈸十六分。
  var rnb = {
    id: 'rnb', name: 'R&B', bpm: 86, meter: '4/4', resolution: 16, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 96, 'x..x......x.....|x..x......x.x...', 32),
      T('軍鼓', 'acoustic', 'snare', 84, '....x..g....x..g|....x..g....x..g', 32),
      T('閉鈸', 'acoustic', 'chat', 44, 'xmxmxmxmxmxmxmxm|xmxmxmxmxmxmxmxm', 32)
    ]
  };

  // 迪斯可：四拍底鼓、2 與 4 拍手、反拍開帽。
  var disco = {
    id: 'disco', name: '迪斯可', bpm: 118, meter: '4/4', resolution: 8, bars: 2,
    tracks: [
      T('電底鼓', 'electronic', 'kick', 100, 'x.x.x.x.|x.x.x.x.', 16),
      T('電拍手', 'electronic', 'clap', 82, '..x...x.|..x...x.', 16),
      T('開帽', 'electronic', 'ohat', 54, '.x.x.x.x|.x.x.x.x', 16)
    ]
  };

  // 雷鬼 one drop：第 3 拍底鼓與軍鼓一起，閉鈸打反拍。
  var reggae = {
    id: 'reggae', name: '雷鬼', bpm: 76, meter: '4/4', resolution: 8, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 100, '....x...|....x...', 16),
      T('軍鼓', 'acoustic', 'snare', 82, '....x...|....x...', 16),
      T('閉鈸', 'acoustic', 'chat', 50, '.x.x.x.x|.x.x.xx.', 16),
      T('開鈸', 'acoustic', 'ohat', 56, '........|.......x', 16)
    ]
  };

  // 巴薩諾瓦：鼓邊走 3-2 鍵子，底鼓在 1 與 2 的後半，閉鈸八分。
  var bossa = {
    id: 'bossa', name: '巴薩諾瓦', bpm: 132, meter: '4/4', resolution: 8, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 92, 'x..x....|x..x...x', 16),
      T('鼓邊', 'acoustic', 'rim', 84, 'x..x..x.|.x..x..x', 16),
      T('閉鈸', 'acoustic', 'chat', 40, 'xxxxxxxx|xxxxxxxx', 16)
    ]
  };

  // 爵士搖擺：用十六分格子近似三連音。騎鈸打在每拍與該拍最後一個十六分（a）。
  var jazz = {
    id: 'jazz', name: '爵士搖擺', bpm: 132, meter: '4/4', resolution: 16, bars: 2,
    tracks: [
      T('騎鈸', 'acoustic', 'ride', 70, 'x..xx..xx..xx..x|x..xx..xx..xx..x', 32),
      T('底鼓', 'acoustic', 'kick', 42, 'x.......x.......|x.......x.....x.', 32),
      T('軍鼓', 'acoustic', 'snare', 72, '....x.......x...|....x.......x..g', 32)
    ]
  };

  // 華爾滋 3/4：第 1 拍底鼓，第 2、3 拍軍鼓。
  var waltz = {
    id: 'waltz', name: '華爾滋', bpm: 108, meter: '3/4', resolution: 8, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 100, 'x.....|x.....', 12),
      T('軍鼓', 'acoustic', 'snare', 78, '..x.x.|..x.x.', 12),
      T('閉鈸', 'acoustic', 'chat', 48, 'x.x.x.|x.x...', 12),
      T('開鈸', 'acoustic', 'ohat', 54, '......|....x.', 12)
    ]
  };

  // 6/8 慢歌：底鼓在第一大拍，軍鼓在第二大拍（第 4 個八分）。
  var ballad = {
    id: 'ballad68', name: '六八慢歌', bpm: 80, meter: '6/8', resolution: 8, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 100, 'x.....|x.....', 12),
      T('軍鼓', 'acoustic', 'snare', 84, '...x..|...x.x', 12),
      T('閉鈸', 'acoustic', 'chat', 46, 'xxxxxx|xxxxx.', 12),
      T('開鈸', 'acoustic', 'ohat', 52, '......|.....x', 12)
    ]
  };

  // 12/8 藍調 shuffle：每拍的第一與第三個八分，軍鼓在第 2、4 大拍。
  var shuffle = {
    id: 'shuffle', name: '藍調', bpm: 138, meter: '12/8', resolution: 8, bars: 2,
    tracks: [
      T('底鼓', 'acoustic', 'kick', 100, 'x.....x.....|x....xx.....', 24),
      T('軍鼓', 'acoustic', 'snare', 88, '...x.....x..|...x.....xxx', 24),
      T('騎鈸', 'acoustic', 'ride', 62, 'x.xx.xx.xx.x|x.xx.xx.xx.x', 24)
    ]
  };

  var list = [rock, pop, funk, hiphop, rnb, disco, reggae, bossa, jazz, waltz, ballad, shuffle];

  var api = { list: list };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MpcGrooves = api;
})(typeof self !== 'undefined' ? self : this);
