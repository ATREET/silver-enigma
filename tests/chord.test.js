const test = require('node:test');
const assert = require('node:assert');
const { detectChord } = require('../chord.js');
const N = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
// "C4" -> 60
const m = s => { const [, n, o] = s.match(/^([A-G][#b]?)(-?\d)$/); return N[n] + 12 * (+o + 1); };
const name = (...notes) => { const r = detectChord(notes.map(m)); return r ? r.name : null; };
const iv = (...notes) => detectChord(notes.map(m)).interval;

const cases = [
  [['C4', 'E4', 'G4'], 'C'],
  [['E4', 'G4', 'C5'], 'C/E'],
  [['G3', 'C4', 'E4'], 'C/G'],
  [['A3', 'C4', 'E4', 'G4'], 'Am7'],
  [['B3', 'D4', 'F4'], 'Bdim'],
  [['C4', 'E4', 'G#4'], 'Caug'],
  [['C3', 'C4', 'E4', 'G4', 'C5', 'E5'], 'C'],   // 重複八度
  [['A3', 'C4', 'E4'], 'Am'],
  [['C4', 'G4'], 'C5'],
  [['C4', 'D4', 'G4'], 'Csus2'],
  [['C4', 'F4', 'G4'], 'Csus4'],
  [['C4', 'E4', 'G4', 'A4'], 'C6'],
  [['C4', 'Eb4', 'G4', 'A4'], 'Cm6'],
  [['G3', 'B3', 'D4', 'F4'], 'G7'],
  [['B3', 'D4', 'F4', 'G4'], 'G7/B'],
  [['C4', 'E4', 'G4', 'B4'], 'Cmaj7'],
  [['D4', 'F4', 'A4', 'C5'], 'Dm7'],
  [['B3', 'D4', 'F4', 'A4'], 'Bm7b5'],
  [['B3', 'D4', 'F4', 'Ab4'], 'Bdim7'],
  [['C4', 'Eb4', 'G4', 'B4'], 'CmMaj7'],
  [['G3', 'C4', 'D4', 'F4'], 'G7sus4'],
  [['C4', 'E4', 'G4', 'D5'], 'Cadd9'],
  [['C4', 'E4', 'G4', 'Bb4', 'D5'], 'C9'],
  [['C4', 'E4', 'G4', 'B4', 'D5'], 'Cmaj9'],
  [['C4', 'Eb4', 'G4', 'Bb4', 'D5'], 'Cm9'],
  [['C3', 'G3', 'Bb3', 'D4', 'F4'], 'C11'],
  [['C3', 'E3', 'Bb3', 'D4', 'G4', 'A4'], 'C13'],
  [['C4', 'E4', 'Bb4'], 'C7'],                 // 省略五音
  [['F#4', 'A#4', 'C#5'], 'F#'],
  [['Bb3', 'D4', 'F4'], 'Bb'],
];
for (const [notes, want] of cases) {
  test(`${notes.join('-')} = ${want}`, () => assert.strictEqual(name(...notes), want));
}
test('fewer than 2 keys -> null', () => { assert.strictEqual(detectChord([60]), null); assert.strictEqual(detectChord([]), null); });
test('no match -> null (cluster)', () => assert.strictEqual(name('C4', 'C#4', 'D4'), null));
test('interval names', () => {
  assert.strictEqual(iv('C4', 'E4'), '大三度');
  assert.strictEqual(iv('C4', 'Eb4'), '小三度');
  assert.strictEqual(iv('C4', 'G4'), '完全五度');
  assert.strictEqual(iv('C4', 'C5'), '八度');
  assert.strictEqual(iv('E4', 'C5'), '小六度');
  assert.strictEqual(name('C4', 'E4'), '');    // 兩音非和弦：只顯示音程
});
test('omit-5 voicing only when root is in bass', () => {
  assert.strictEqual(name('D4', 'E4', 'G4'), null);
  assert.strictEqual(name('E4', 'G4', 'D5'), 'Em7');
});
