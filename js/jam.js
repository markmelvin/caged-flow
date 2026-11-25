// Jam: backing track + live fretboard showing position, chord tones and the next targets.
import * as T from './theory.js';
import * as S from './stats.js';
import { BackingTrack, pluck } from './audio.js';
import { Fretboard } from './fretboard.js';

const PROMPTS = [
  'Land on the <b>3rd</b> of each chord as it arrives',
  'Call & response: play 2 bars, rest 2 bars',
  'Only 3 notes this phrase. Make them count',
  'Start your phrase on beat 2 or on the "and"',
  'Stay on the top 3 strings',
  'Use only the bright chord tones (arpeggio)',
  'Long notes only. Let them ring',
  'Bend or slide <i>into</i> a chord tone',
  'Play one short lick, then move it to fit the next chord',
  'Hit the <b>root</b> right on beat 1 of the change',
  'Descend through the whole shape, then climb back up',
  'Target the <b>♭7</b> or <b>5th</b>. Avoid the root',
  'Repeat a 3-note rhythm and vary the notes',
  'Slide up into the next shape and keep going',
];

const POS_DEFAULT = { major: 'E', minor: 'G' }; // E shape / Em shape (classic "box 1")

export function renderJam(root, { preset = null, onDone = null, stepLabel = '', minutes = 0 } = {}) {
  const saved = S.settings().jam || {};
  const cfg = Object.assign({
    key: S.settings().focusKey ?? 9, prog: 'blues12', scale: null, pos: null, view: 'key', shift: 0,
    bpm: null, style: null, drums: true, vol: 0.8, prompts: true, labels: 'int',
  }, preset ? {} : saved, preset || {});
  const prog0 = T.PROGRESSIONS[cfg.prog];
  cfg.scale ||= prog0.scale;
  cfg.bpm ||= prog0.bpm;
  cfg.style ||= prog0.style;
  cfg.pos ||= POS_DEFAULT[T.SCALES[cfg.scale].minor ? 'minor' : 'major'];

  let track = null, playing = false, startedAt = 0;
  let curPos = cfg.pos, anchor = 6, lastCenter = null;
  let chordList = [], beatMap = [];
  let current = { chordIdx: 0, beatsLeft: 4, beatInBar: 0, countIn: 0 };
  let promptIdx = Math.floor(Math.random() * PROMPTS.length);
  let stepTimer = null;

  const keyOpts = [...Array(12).keys()].map((p) => `<option value="${p}">${T.BOTH[p]}</option>`).join('');
  const progOpts = Object.entries(T.PROGRESSIONS).map(([id, p]) => `<option value="${id}">${p.name}</option>`).join('');
  const scaleOpts = Object.entries(T.SCALES).map(([id, s]) => `<option value="${id}">${s.name}</option>`).join('');

  root.innerHTML = `
    <div class="jam">
      ${stepLabel ? `<div class="step-banner"><span class="step">${stepLabel}</span> Improvise! <span class="muted" data-el="stepclock"></span> <button class="btn small" data-a="stepdone">Finish workout ✓</button></div>` : ''}
      <details class="card jam-setup" ${preset ? '' : 'open'}>
        <summary>Setup <span class="muted" data-el="summary"></span></summary>
        <div class="grid-form">
          <label>Key<select data-c="key">${keyOpts}</select></label>
          <label class="wide">Progression<select data-c="prog">${progOpts}</select></label>
          <label class="wide">Scale to solo with<select data-c="scale">${scaleOpts}</select></label>
          <label>Style<select data-c="style"><option value="rock">Rock / pop</option><option value="shuffle">Blues shuffle</option><option value="ballad">Ballad</option></select></label>
          <label>Tempo <span data-el="bpmv"></span><input type="range" min="50" max="180" step="2" data-c="bpm"></label>
          <label>Fretboard view<select data-c="view"><option value="key">Position + chord tones</option><option value="follow">Follow each chord's shape</option></select></label>
          <label>Labels<select data-c="labels"><option value="int">Chord intervals (R 3 5)</option><option value="key">Key intervals</option><option value="note">Note names</option></select></label>
          <label>Auto-shift position<select data-c="shift"><option value="0">Off</option><option value="4">Every 4 bars</option><option value="8">Every 8 bars</option><option value="12">Every 12 bars</option></select></label>
          <label>Volume<input type="range" min="0" max="1" step="0.05" data-c="vol"></label>
          <label class="check"><input type="checkbox" data-c="drums"> Drums</label>
          <label class="check"><input type="checkbox" data-c="prompts"> Improv challenges</label>
        </div>
      </details>
      <div class="pos-row"><span class="label">Position</span><div class="chips" data-el="pos"></div></div>
      <div class="jam-live card">
        <div class="jam-head">
          <button class="btn primary play" data-a="play">▶ Play</button>
          <div class="now">
            <div class="now-chord" data-el="chord">–</div>
            <div class="now-sub" data-el="chordsub">Press play. You get a one-bar count-in.</div>
          </div>
          <div class="beats" data-el="beats"><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="chord-strip" data-el="strip"></div>
        <div class="jam-prompt" data-el="prompt"></div>
      </div>
      <div class="board-wrap" data-el="board"></div>
      <div class="legend">
        <span><i class="dot chord"></i>current chord tones (aim here)</span>
        <span><i class="dot ghost"></i>next chord's tones</span>
        <span><i class="dot scale"></i>other scale notes</span>
      </div>
    </div>`;

  const el = {};
  root.querySelectorAll('[data-el]').forEach((e) => (el[e.dataset.el] = e));
  const board = new Fretboard(el.board, {
    getSettings: () => S.settings(),
    onTap: (s, f) => S.settings().sound && pluck(T.midiAt(s, f)),
  });

  // ---- controls ----
  const controls = root.querySelectorAll('[data-c]');
  const syncControls = () => {
    controls.forEach((c) => {
      const k = c.dataset.c;
      if (c.type === 'checkbox') c.checked = !!cfg[k];
      else c.value = cfg[k];
    });
    el.bpmv.textContent = `${cfg.bpm} bpm`;
    el.summary.textContent = `· ${T.keyName(cfg.key, T.PROGRESSIONS[cfg.prog].minor)} · ${T.PROGRESSIONS[cfg.prog].name} · ${cfg.bpm} bpm`;
  };
  controls.forEach((c) => {
    c.addEventListener(c.type === 'range' ? 'input' : 'change', () => {
      const k = c.dataset.c;
      let v = c.type === 'checkbox' ? c.checked : c.value;
      if (['key', 'bpm', 'shift'].includes(k)) v = +v;
      if (k === 'vol') v = +v;
      const prevMinor = T.SCALES[cfg.scale].minor;
      cfg[k] = v;
      if (k === 'prog') {
        const p = T.PROGRESSIONS[v];
        cfg.scale = p.scale; cfg.style = p.style; cfg.bpm = p.bpm;
      }
      if ((k === 'prog' || k === 'scale') && T.SCALES[cfg.scale].minor !== prevMinor) {
        cfg.pos = POS_DEFAULT[T.SCALES[cfg.scale].minor ? 'minor' : 'major'];
      }
      if (k === 'vol' && track) { track.setVolume(v); persist(); return; }
      if (k === 'bpm') el.bpmv.textContent = `${v} bpm`;
      syncControls();
      persist();
      rebuild();
      if (playing && ['key', 'prog', 'bpm', 'style', 'drums'].includes(k)) restart();
    });
  });
  const persist = () => { if (!preset) S.setSetting('jam', { ...cfg }); };

  const renderPosChips = () => {
    const minor = T.SCALES[cfg.scale].minor;
    el.pos.innerHTML = [...T.SHAPE_ORDER, 'all'].map((id) =>
      `<button class="chip ${cfg.pos === id ? 'on' : ''}" data-p="${id}" style="${id !== 'all' ? `--chip:${T.SHAPE_COLORS[id]}` : ''}">${id === 'all' ? 'Whole neck' : minor ? T.MINOR_NAME[id] : id}</button>`).join('');
    el.pos.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
      cfg.pos = b.dataset.p; curPos = cfg.pos; lastCenter = null; anchor = 6;
      persist(); renderPosChips(); draw();
    }));
  };

  // ---- model ----
  function rebuild() {
    const p = T.PROGRESSIONS[cfg.prog];
    const flat = T.prefersFlat(cfg.key, p.minor);
    chordList = p.chords.map(([deg, q, bars]) => ({
      rootPc: (cfg.key + deg) % 12, ints: T.CHORDS[q].ints, q, bars, deg,
      name: T.chordName((cfg.key + deg) % 12, q, flat), roman: T.romanFor(deg, q),
    }));
    beatMap = [];
    chordList.forEach((c, ci) => { const n = c.bars * 4; for (let b = 0; b < n; b++) beatMap.push({ ci, left: n - b }); });
    curPos = cfg.pos;
    lastCenter = null;
    el.strip.innerHTML = chordList.map((c, i) =>
      `<div class="strip-chord" data-i="${i}" style="flex:${c.bars}"><b>${c.name}</b><span>${c.roman}</span></div>`).join('');
    renderPosChips();
    draw();
  }

  function keyInstance() {
    const sc = T.SCALES[cfg.scale];
    const ref = T.refMajor(cfg.key, sc.minor);
    if (curPos === 'all') return null;
    if (lastCenter == null) {
      const inst = T.nearestInstance(ref, curPos, S.settings().frets, anchor);
      lastCenter = inst?.center ?? 6;
      return inst;
    }
    return T.nearestInstance(ref, curPos, S.settings().frets, lastCenter);
  }

  function shiftPosition() {
    const sc = T.SCALES[cfg.scale];
    const ref = T.refMajor(cfg.key, sc.minor);
    const order = T.SHAPE_ORDER;
    const next = order[(order.indexOf(curPos) + 1) % order.length];
    const list = T.shapeInstances(ref, next, S.settings().frets).sort((a, b) => a.center - b.center);
    const up = list.find((i) => i.center > (lastCenter ?? 0)) || list[0];
    curPos = next;
    lastCenter = up?.center ?? 6;
    return next;
  }

  function labelFor(n, chord, mode, flat) {
    if (mode === 'note') return T.noteName(n.pc, flat);
    if (mode === 'key') return T.INTERVALS[(n.pc - cfg.key + 12) % 12];
    return chord ? T.INTERVALS[(n.pc - chord.rootPc + 12) % 12] : '';
  }

  function draw() {
    const frets = S.settings().frets;
    const sc = T.SCALES[cfg.scale];
    const minor = sc.minor;
    const ref = T.refMajor(cfg.key, minor);
    const flat = T.prefersFlat(cfg.key, T.PROGRESSIONS[cfg.prog].minor);
    const chord = chordList[current.chordIdx] || chordList[0];
    const nextChord = chordList[(current.chordIdx + 1) % chordList.length];
    const showGhost = playing && current.beatsLeft <= 1 && nextChord !== chord && !current.countIn;
    const notes = [];
    let windows = [], bands = [];

    if (cfg.view === 'follow' && chord) {
      // Each chord's own nearest CAGED shape
      const near = lastCenter ?? keyInstance()?.center ?? 6;
      const best = bestChordShape(chord, near, frets);
      const ghost = showGhost ? bestChordShape(nextChord, best.inst.center, frets) : null;
      const pent = T.CHORDS[chord.q].minor ? T.SCALES.minPent : T.SCALES.majPent;
      const scaleNotes = T.notesInShape(best.inst, chord.rootPc, pent.ints, best.ref, frets);
      const tones = T.notesInShape(best.inst, chord.rootPc, chord.ints, best.ref, frets);
      const toneKeys = new Set(tones.map((n) => `${n.s}-${n.f}`));
      for (const n of scaleNotes) if (!toneKeys.has(`${n.s}-${n.f}`)) notes.push({ s: n.s, f: n.f, cls: 'scale small dim', label: cfg.labels === 'int' ? '' : labelFor(n, chord, cfg.labels, flat) });
      if (ghost) {
        for (const n of T.notesInShape(ghost.inst, nextChord.rootPc, nextChord.ints, ghost.ref, frets)) {
          if (!toneKeys.has(`${n.s}-${n.f}`)) notes.push({ s: n.s, f: n.f, cls: 'ghost', label: labelFor(n, nextChord, cfg.labels, flat) });
        }
      }
      for (const n of tones) notes.push({ s: n.s, f: n.f, cls: 'chord' + (n.interval === 0 ? ' croot' : ''), label: labelFor(n, chord, cfg.labels, flat) });
      windows = [{ win: best.inst.win, color: T.SHAPE_COLORS[best.id], opacity: 0.14 }];
      bands = [{ lo: best.inst.lo, hi: best.inst.hi, color: T.SHAPE_COLORS[best.id], label: `${chord.name}: ${T.shapeLabel(best.id, T.CHORDS[chord.q].minor)}` }];
    } else {
      const inst = keyInstance();
      let scaleNotes;
      if (inst) {
        scaleNotes = T.notesInShape(inst, cfg.key, sc.ints, ref, frets);
        windows = [{ win: inst.win, color: T.SHAPE_COLORS[curPos], opacity: 0.13 }];
        bands = [{ lo: inst.lo, hi: inst.hi, color: T.SHAPE_COLORS[curPos], label: T.shapeLabel(curPos, minor) }];
      } else {
        scaleNotes = T.scaleLayout({ tonicPc: cfg.key, scaleId: cfg.scale, shapeId: 'all', maxFret: frets }).notes;
      }
      const chordTones = (c) => {
        if (!c) return [];
        if (inst) return T.notesInShape(inst, c.rootPc, c.ints, ref, frets);
        const set = new Set(c.ints.map((i) => (c.rootPc + i) % 12));
        const out = [];
        for (let s = 0; s < 6; s++) for (let f = 0; f <= frets; f++) {
          const m = T.midiAt(s, f);
          if (set.has(T.pcOf(m))) out.push({ s, f, midi: m, pc: T.pcOf(m), interval: (T.pcOf(m) - c.rootPc + 12) % 12 });
        }
        return out;
      };
      const tones = chordTones(chord);
      const toneKeys = new Set(tones.map((n) => `${n.s}-${n.f}`));
      for (const n of scaleNotes) {
        if (toneKeys.has(`${n.s}-${n.f}`)) continue;
        notes.push({ s: n.s, f: n.f, cls: 'scale small' + (n.interval === 0 ? ' kroot' : ''), label: cfg.labels === 'int' ? '' : labelFor(n, chord, cfg.labels, flat) });
      }
      if (showGhost) {
        for (const n of chordTones(nextChord)) if (!toneKeys.has(`${n.s}-${n.f}`)) notes.push({ s: n.s, f: n.f, cls: 'ghost', label: labelFor(n, nextChord, cfg.labels, flat) });
      }
      for (const n of tones) notes.push({ s: n.s, f: n.f, cls: 'chord' + (n.interval === 0 ? ' croot' : ''), label: labelFor(n, chord, cfg.labels, flat) });
    }
    board.draw({ notes, windows, bands });
  }

  function bestChordShape(chord, near, frets) {
    const minor = T.CHORDS[chord.q].minor;
    const ref = T.refMajor(chord.rootPc, minor);
    let best = null;
    for (const id of T.SHAPE_ORDER) {
      const inst = T.nearestInstance(ref, id, frets, near);
      if (!inst) continue;
      const d = Math.abs(inst.center - near);
      if (!best || d < best.d) best = { id, inst, d, ref };
    }
    return best;
  }

  // ---- transport ----
  function onBeat(ev) {
    const beatsEl = el.beats.children;
    if (ev.countIn) {
      current.countIn = ev.countIn;
      el.chord.textContent = `${ev.countIn}`;
      el.chordsub.textContent = 'Count-in…';
      [...beatsEl].forEach((b, i) => b.classList.toggle('on', i === ev.countIn - 1));
      if (ev.countIn === 4) { current.chordIdx = 0; current.beatsLeft = 1; draw(); }
      return;
    }
    current.countIn = 0;
    const bm = beatMap[ev.idx];
    current.chordIdx = bm.ci;
    current.beatsLeft = bm.left;
    current.beatInBar = ev.beatInBar;
    [...beatsEl].forEach((b, i) => b.classList.toggle('on', i === ev.beatInBar));
    const c = chordList[bm.ci];
    const nx = chordList[(bm.ci + 1) % chordList.length];
    el.chord.innerHTML = `${c.name} <small>${c.roman}</small>`;
    el.chordsub.innerHTML = nx !== c ? `next: <b>${nx.name}</b> in ${bm.left} beat${bm.left > 1 ? 's' : ''}` : 'one-chord vamp';
    el.strip.querySelectorAll('.strip-chord').forEach((d, i) => d.classList.toggle('on', i === bm.ci));

    if (ev.beatInBar === 0) {
      const bar = Math.floor(ev.step / 4);
      if (cfg.shift && bar > 0 && bar % cfg.shift === 0 && cfg.pos !== 'all' && cfg.view === 'key') {
        const id = shiftPosition();
        showPrompt(`Shift ↑ to the <b style="color:${T.SHAPE_COLORS[id]}">${T.shapeLabel(id, T.SCALES[cfg.scale].minor)}</b>`);
      } else if (cfg.prompts && bar % 4 === 0) {
        promptIdx = (promptIdx + 1 + Math.floor(Math.random() * 3)) % PROMPTS.length;
        showPrompt(PROMPTS[promptIdx]);
      }
    }
    draw();
  }

  function showPrompt(html) {
    el.prompt.innerHTML = html;
    el.prompt.classList.remove('pop');
    void el.prompt.offsetWidth;
    el.prompt.classList.add('pop');
  }

  function play() {
    track = new BackingTrack({
      bpm: cfg.bpm, style: cfg.style, drums: cfg.drums, volume: cfg.vol,
      chords: chordList.map((c) => ({ rootPc: c.rootPc, ints: c.ints, bars: c.bars })), onBeat,
    });
    track.start();
    playing = true;
    startedAt ||= performance.now();
    root.querySelector('[data-a=play]').textContent = '■ Stop';
    root.querySelector('[data-a=play]').classList.add('stop');
    if (window.innerWidth < 700) root.querySelector('.jam-setup').open = false;
    if (cfg.prompts) showPrompt(PROMPTS[promptIdx]);
  }
  function stop() {
    if (track) track.stop();
    track = null;
    playing = false;
    if (startedAt) { S.addPractice(Math.round((performance.now() - startedAt) / 1000)); startedAt = 0; }
    const b = root.querySelector('[data-a=play]');
    if (b) { b.textContent = '▶ Play'; b.classList.remove('stop'); }
    current = { chordIdx: 0, beatsLeft: 4, beatInBar: 0, countIn: 0 };
    curPos = cfg.pos; lastCenter = null;
    if (el.chord) { el.chord.textContent = '–'; el.chordsub.textContent = 'Stopped'; }
    draw();
  }
  function restart() { stop(); play(); }

  root.querySelector('[data-a=play]').onclick = () => (playing ? stop() : play());
  const stepDone = root.querySelector('[data-a=stepdone]');
  if (stepDone) {
    const t0 = performance.now();
    stepTimer = setInterval(() => {
      const s = Math.floor((performance.now() - t0) / 1000);
      const left = Math.max(0, minutes * 60 - s);
      el.stepclock.textContent = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : 'Time! Finish when you like';
    }, 500);
    stepDone.onclick = () => { cleanup(); onDone && onDone(); };
  }

  syncControls();
  rebuild();

  function cleanup() {
    stop();
    clearInterval(stepTimer);
  }
  return { cleanup };
}
