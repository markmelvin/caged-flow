// Music theory core: notes, scales, CAGED shape geometry.
// Strings are indexed 0..5 from the low E (6th string) to the high e (1st string).

export const TUNING = [40, 45, 50, 55, 59, 64]; // MIDI: E2 A2 D3 G3 B3 E4
export const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
export const STRING_NUMBERS = [6, 5, 4, 3, 2, 1];

export const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const BOTH = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
export const INTERVALS = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
export const INTERVAL_NAMES = ['Root', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th',
  'Flat 5th', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th'];

export const pcOf = (m) => ((m % 12) + 12) % 12;
export const midiAt = (s, f) => TUNING[s] + f;

// Key spelling: flats for F, B♭, E♭, A♭, D♭ major (and their relative minors).
export function prefersFlat(tonicPc, minor) {
  const maj = minor ? (tonicPc + 3) % 12 : tonicPc;
  return [5, 10, 3, 8, 1].includes(maj);
}
export function noteName(pc, flat = false) {
  return (flat ? FLATS : SHARPS)[pcOf(pc)];
}
export function keyName(tonicPc, minor) {
  return noteName(tonicPc, prefersFlat(tonicPc, minor)) + (minor ? ' minor' : ' major');
}

export const SCALES = {
  minPent:  { name: 'Minor Pentatonic', short: 'Minor Pent', ints: [0, 3, 5, 7, 10], minor: true },
  majPent:  { name: 'Major Pentatonic', short: 'Major Pent', ints: [0, 2, 4, 7, 9], minor: false },
  blues:    { name: 'Blues Scale', short: 'Blues', ints: [0, 3, 5, 6, 7, 10], minor: true },
  majBlues: { name: 'Major Blues', short: 'Maj Blues', ints: [0, 2, 3, 4, 7, 9], minor: false },
  major:    { name: 'Major (Ionian)', short: 'Major', ints: [0, 2, 4, 5, 7, 9, 11], minor: false },
  minor:    { name: 'Natural Minor (Aeolian)', short: 'Nat. Minor', ints: [0, 2, 3, 5, 7, 8, 10], minor: true },
  mixo:     { name: 'Mixolydian', short: 'Mixolydian', ints: [0, 2, 4, 5, 7, 9, 10], minor: false },
  dorian:   { name: 'Dorian', short: 'Dorian', ints: [0, 2, 3, 5, 7, 9, 10], minor: true },
  harmMin:  { name: 'Harmonic Minor', short: 'Harm. Minor', ints: [0, 2, 3, 5, 7, 8, 11], minor: true },
  majArp:   { name: 'Major Triad Arpeggio', short: 'Maj Arp', ints: [0, 4, 7], minor: false, arp: true },
  minArp:   { name: 'Minor Triad Arpeggio', short: 'Min Arp', ints: [0, 3, 7], minor: true, arp: true },
  dom7Arp:  { name: 'Dominant 7 Arpeggio', short: '7 Arp', ints: [0, 4, 7, 10], minor: false, arp: true },
  maj7Arp:  { name: 'Major 7 Arpeggio', short: 'Maj7 Arp', ints: [0, 4, 7, 11], minor: false, arp: true },
  min7Arp:  { name: 'Minor 7 Arpeggio', short: 'm7 Arp', ints: [0, 3, 7, 10], minor: true, arp: true },
};

// ---- CAGED geometry -------------------------------------------------------
// Per-string fret windows for each shape, written for the key of C major.
// Every window holds exactly 2 pentatonic notes per string and the standard
// CAGED major-scale fingering. Other keys are a simple transposition.
export const SHAPE_ORDER = ['C', 'A', 'G', 'E', 'D'];
const WIN_C = {
  C: [[0, 3], [0, 3], [0, 3], [0, 3], [0, 3], [0, 3]],
  A: [[2, 5], [2, 5], [2, 5], [2, 5], [3, 6], [2, 5]],
  G: [[5, 8], [5, 8], [5, 8], [4, 7], [5, 8], [5, 8]],
  E: [[7, 10], [7, 10], [7, 10], [7, 10], [7, 10], [7, 10]],
  D: [[10, 13], [10, 13], [9, 12], [9, 12], [10, 13], [10, 13]],
};
// In a minor key the same positions are named after the minor chord shapes.
export const MINOR_NAME = { C: 'Am', A: 'Gm', G: 'Em', E: 'Dm', D: 'Cm' };
export const SHAPE_COLORS = { C: '#ff7eb6', A: '#f5a623', G: '#4cc38a', E: '#4aa3ff', D: '#b07cff' };

// Where the roots live in each shape (shown in the guide + hints).
export const ROOT_HINTS = {
  C: 'Roots on the A string (top of shape, ring finger) and B string (index).',
  A: 'Roots on the A string (index / barre) and G string (ring finger).',
  G: 'Roots on the low E and high e (top of shape) plus the G string.',
  E: 'Roots on the low E and high e (index / barre) plus the D string.',
  D: 'Roots on the D string (lowest fret) and B string.',
};

export function shapeLabel(shapeId, minor) {
  return minor ? MINOR_NAME[shapeId] + ' shape' : shapeId + ' shape';
}

// Major root whose CAGED windows define the positions for a tonic.
export const refMajor = (tonicPc, minor) => (minor ? (tonicPc + 3) % 12 : tonicPc);

// All complete instances of a shape on a neck of maxFret frets.
export function shapeInstances(refMajorPc, shapeId, maxFret) {
  const out = [];
  for (const oct of [-12, 0, 12, 24]) {
    const s = refMajorPc + oct;
    let win = WIN_C[shapeId].map(([a, b]) => [a + s, b + s]);
    const rawLo = Math.min(...win.map((w) => w[0]));
    const hi = Math.max(...win.map((w) => w[1]));
    // Allow shapes that poke one fret behind the nut (open-position chords), clipped at 0.
    if (rawLo < -1 || hi > maxFret) continue;
    win = win.map(([a, b]) => [Math.max(0, a), b]);
    const lo = Math.max(0, rawLo);
    out.push({ shapeId, win, lo, hi, center: (lo + hi) / 2 });
  }
  return out;
}

// Notes of a pitch-class set inside one shape instance.
// Chromatic notes (outside the reference major scale, e.g. the blue note)
// may sit one fret outside the window, so they still show up in position.
export function notesInShape(inst, tonicPc, ints, refMajorPc, maxFret) {
  const pcs = new Set(ints.map((i) => (tonicPc + i) % 12));
  const diatonic = new Set([0, 2, 4, 5, 7, 9, 11].map((i) => (refMajorPc + i) % 12));
  const found = [];
  for (let s = 0; s < 6; s++) {
    const [a, b] = inst.win[s];
    for (let f = Math.max(0, a - 1); f <= Math.min(maxFret, b + 1); f++) {
      const midi = midiAt(s, f);
      const pc = pcOf(midi);
      if (!pcs.has(pc)) continue;
      const inWin = f >= a && f <= b;
      if (!inWin && diatonic.has(pc)) continue;
      found.push({ s, f, midi, pc, interval: (pc - tonicPc + 12) % 12, ext: !inWin, shapeId: inst.shapeId });
    }
  }
  // Remove duplicate pitches (prefer in-window positions).
  const byMidi = new Map();
  for (const n of found) {
    const prev = byMidi.get(n.midi);
    if (!prev || (prev.ext && !n.ext)) byMidi.set(n.midi, n);
  }
  return found.filter((n) => byMidi.get(n.midi) === n);
}

// Convenience: everything needed to draw a scale in one or all shapes.
export function scaleLayout({ tonicPc, scaleId, shapeId = 'all', maxFret = 15 }) {
  const sc = SCALES[scaleId];
  const ref = refMajor(tonicPc, sc.minor);
  const ids = shapeId === 'all' ? SHAPE_ORDER : [shapeId];
  const instances = [];
  const notes = new Map(); // "s-f" -> note (first shape wins), with list of shapes
  for (const id of ids) {
    for (const inst of shapeInstances(ref, id, maxFret)) {
      instances.push(inst);
      for (const n of notesInShape(inst, tonicPc, sc.ints, ref, maxFret)) {
        const k = n.s + '-' + n.f;
        if (notes.has(k)) notes.get(k).shapes.push(id);
        else notes.set(k, { ...n, shapes: [id] });
      }
    }
  }
  return { instances, notes: [...notes.values()], minor: sc.minor, ref };
}

// Instance of a shape nearest to a fret position.
export function nearestInstance(refMajorPc, shapeId, maxFret, nearFret) {
  const list = shapeInstances(refMajorPc, shapeId, maxFret);
  list.sort((a, b) => Math.abs(a.center - nearFret) - Math.abs(b.center - nearFret));
  return list[0];
}

// Every note on the neck with a given pitch class.
export function allPositions(pc, maxFret, strings = [0, 1, 2, 3, 4, 5]) {
  const out = [];
  for (const s of strings) for (let f = 0; f <= maxFret; f++) if (pcOf(midiAt(s, f)) === pc) out.push({ s, f });
  return out;
}

// ---- Chords & progressions -----------------------------------------------
export const CHORDS = {
  maj:  { ints: [0, 4, 7], sym: '', minor: false },
  min:  { ints: [0, 3, 7], sym: 'm', minor: true },
  dom7: { ints: [0, 4, 7, 10], sym: '7', minor: false },
  maj7: { ints: [0, 4, 7, 11], sym: 'maj7', minor: false },
  min7: { ints: [0, 3, 7, 10], sym: 'm7', minor: true },
  dim:  { ints: [0, 3, 6], sym: '°', minor: true },
};

const ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];
export function romanFor(deg, q) {
  let r = ROMAN[deg];
  if (CHORDS[q].minor) r = r.toLowerCase().replace('♭', '♭');
  return r + (q === 'dom7' ? '7' : q === 'maj7' ? 'maj7' : q === 'min7' ? '7' : q === 'dim' ? '°' : '');
}

// deg = semitones above the key tonic; bars = length in 4/4 bars.
export const PROGRESSIONS = {
  blues12:   { name: '12-Bar Blues (I7–IV7–V7)', minor: false, scale: 'minPent', style: 'shuffle', bpm: 96,
    chords: [[0, 'dom7', 4], [5, 'dom7', 2], [0, 'dom7', 2], [7, 'dom7', 1], [5, 'dom7', 1], [0, 'dom7', 1], [7, 'dom7', 1]] },
  pop:       { name: 'Pop: I–V–vi–IV', minor: false, scale: 'majPent', style: 'rock', bpm: 100,
    chords: [[0, 'maj', 1], [7, 'maj', 1], [9, 'min', 1], [5, 'maj', 1]] },
  rock145:   { name: 'Rock: I–IV–V–IV', minor: false, scale: 'majPent', style: 'rock', bpm: 116,
    chords: [[0, 'maj', 1], [5, 'maj', 1], [7, 'maj', 1], [5, 'maj', 1]] },
  mixo:      { name: 'Mixolydian rock: I–♭VII–IV', minor: false, scale: 'mixo', style: 'rock', bpm: 108,
    chords: [[0, 'maj', 1], [10, 'maj', 1], [5, 'maj', 2]] },
  jazz251:   { name: 'Jazz: ii–V–I', minor: false, scale: 'major', style: 'ballad', bpm: 84,
    chords: [[2, 'min7', 1], [7, 'dom7', 1], [0, 'maj7', 2]] },
  vampMaj:   { name: 'One-chord vamp (I)', minor: false, scale: 'majPent', style: 'rock', bpm: 100,
    chords: [[0, 'maj', 4]] },
  aeolian:   { name: 'Minor rock: i–♭VII–♭VI–♭VII', minor: true, scale: 'minPent', style: 'rock', bpm: 104,
    chords: [[0, 'min', 1], [10, 'maj', 1], [8, 'maj', 1], [10, 'maj', 1]] },
  minor145:  { name: 'Minor: i–iv–i–v', minor: true, scale: 'minor', style: 'ballad', bpm: 80,
    chords: [[0, 'min', 1], [5, 'min', 1], [0, 'min', 1], [7, 'min', 1]] },
  sadpop:    { name: 'Minor pop: i–♭VI–♭III–♭VII', minor: true, scale: 'minPent', style: 'rock', bpm: 96,
    chords: [[0, 'min', 1], [8, 'maj', 1], [3, 'maj', 1], [10, 'maj', 1]] },
  minBlues:  { name: 'Minor Blues', minor: true, scale: 'blues', style: 'shuffle', bpm: 84,
    chords: [[0, 'min7', 4], [5, 'min7', 2], [0, 'min7', 2], [8, 'dom7', 1], [7, 'dom7', 1], [0, 'min7', 1], [7, 'dom7', 1]] },
  dorian:    { name: 'Dorian funk: i7–IV7', minor: true, scale: 'dorian', style: 'rock', bpm: 100,
    chords: [[0, 'min7', 2], [5, 'dom7', 2]] },
  vampMin:   { name: 'One-chord vamp (i)', minor: true, scale: 'minPent', style: 'rock', bpm: 96,
    chords: [[0, 'min', 4]] },
};

export function chordName(rootPc, q, flat) {
  return noteName(rootPc, flat) + CHORDS[q].sym;
}
