// Drill definitions + a shared session runner.
import * as T from './theory.js';
import * as S from './stats.js';
import { pluck, blip, audio } from './audio.js';
import { PitchListener, micSupported } from './pitch.js';
import { Fretboard } from './fretboard.js';

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const range = (n) => [...Array(n).keys()];
const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const LETTER_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

// ---- shared option definitions --------------------------------------------
const OPT_LEN = { id: 'len', label: 'Session', type: 'select', def: 't60',
  choices: [{ v: 't60', l: '60 sec' }, { v: 't120', l: '2 min' }, { v: 'c20', l: '20 questions' }, { v: 'free', l: 'Endless' }] };
const OPT_LEN_SHAPES = { id: 'len', label: 'Session', type: 'select', def: 'c6',
  choices: [{ v: 'c3', l: '3 shapes' }, { v: 'c6', l: '6 shapes' }, { v: 'c10', l: '10 shapes' }, { v: 'free', l: 'Endless' }] };
const OPT_FRETS = { id: 'maxFret', label: 'Fret range', type: 'select', def: 12,
  choices: [{ v: 5, l: '0–5' }, { v: 12, l: '0–12' }, { v: 99, l: 'Whole neck' }] };
const OPT_STRINGS = { id: 'strings', label: 'Strings', type: 'multi', def: [0, 1, 2, 3, 4, 5],
  choices: range(6).map((s) => ({ v: s, l: `${T.STRING_LABELS[s]} (${6 - s})` })) };
const OPT_SHAPES = { id: 'shapes', label: 'Shapes', type: 'multi', def: [...T.SHAPE_ORDER],
  choices: T.SHAPE_ORDER.map((s) => ({ v: s, l: s })) };
const OPT_KEY = { id: 'key', label: 'Key', type: 'select', def: 'rand',
  choices: [{ v: 'rand', l: 'Random' }, ...range(12).map((p) => ({ v: p, l: T.BOTH[p] }))] };
const OPT_NATURALS = { id: 'naturals', label: 'Notes', type: 'select', def: false,
  choices: [{ v: false, l: 'All 12' }, { v: true, l: 'Naturals only' }] };
const OPT_INPUT = { id: 'input', label: 'Answer by', type: 'select', def: 'tap',
  choices: [{ v: 'tap', l: 'Tapping the screen' }, { v: 'mic', l: '🎤 Playing my guitar' }] };
const scaleOpt = (ids, def) => ({ id: 'scale', label: 'Scale', type: 'select', def,
  choices: ids.map((id) => ({ v: id, l: T.SCALES[id].name })) });

const keyChoice = (opt) => (opt === 'rand' ? Math.floor(Math.random() * 12) : +opt);

// ===========================================================================
export const DRILLS = {
  // -------------------------------------------------------------------------
  noteNamer: {
    title: 'Name the Note', icon: '♪', targetMs: 2000,
    blurb: 'A dot lights up on the neck. Name it as fast as you can.',
    options: [OPT_LEN, OPT_FRETS, OPT_STRINGS, OPT_NATURALS],
    create(ctx) {
      const o = ctx.opts;
      const cands = [];
      for (const s of o.strings) {
        for (let f = 0; f <= ctx.maxFret; f++) {
          const p = T.pcOf(T.midiAt(s, f));
          if (o.naturals && !NATURALS.includes(p)) continue;
          cands.push({ s, f, p });
        }
      }
      const answers = (o.naturals ? NATURALS : range(12)).map((p) => ({ value: p, label: o.naturals ? T.SHARPS[p] : T.BOTH[p] }));
      let cur, last, locked;
      return {
        next() {
          cur = S.weightedPick(cands, (c) => `${c.s}-${c.f}`, 'note', 2000, last);
          last = `${cur.s}-${cur.f}`;
          locked = false;
          ctx.prompt('What note is this?', 'Tip: on a keyboard, press A–G (Shift = sharp).');
          ctx.draw({ notes: [{ s: cur.s, f: cur.f, cls: 'q' }] });
          ctx.answers(answers, (v) => this.answer(v), 'notes');
          ctx.qStart();
        },
        answer(v) {
          if (locked) return;
          locked = true;
          const ok = v === cur.p;
          ctx.result(ok, 'note', `${cur.s}-${cur.f}`);
          ctx.sound(T.midiAt(cur.s, cur.f));
          ctx.draw({ notes: [{ s: cur.s, f: cur.f, cls: ok ? 'correct' : 'wrong', label: ctx.name(cur.p) }] });
          ctx.markAnswer(v, cur.p);
          ctx.done(ok ? 450 : 1500);
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  noteFinder: {
    title: 'Find the Note', icon: '⌖', targetMs: 2500,
    blurb: 'Find a note on a given string, or every place it lives on the neck. Works with your real guitar too.',
    options: [
      { id: 'mode', label: 'Mode', type: 'select', def: 'single',
        choices: [{ v: 'single', l: 'One string at a time' }, { v: 'all', l: 'Every instance on the neck' }] },
      OPT_LEN, OPT_FRETS, OPT_STRINGS, OPT_NATURALS, OPT_INPUT,
    ],
    create(ctx) {
      const o = ctx.opts;
      const maxF = ctx.maxFret;
      const pcs = o.naturals ? NATURALS : range(12);
      const useMic = o.input === 'mic' && o.mode === 'single';
      let cur, last, locked, found, mistakes;

      const single = {
        next() {
          const cands = [];
          for (const s of o.strings) for (const p of pcs) {
            if (range(maxF + 1).some((f) => T.pcOf(T.midiAt(s, f)) === p)) cands.push({ s, p });
          }
          cur = S.weightedPick(cands, (c) => `${c.s}-${c.p}`, 'find', 2500, last);
          last = `${cur.s}-${cur.p}`;
          locked = false;
          ctx.prompt(`Find <b>${ctx.name(cur.p)}</b> on the <b>${T.STRING_LABELS[cur.s]} string</b> <span class="muted">(${6 - cur.s}${ord(6 - cur.s)})</span>`,
            useMic ? 'Play it on your guitar. The app is listening.' : `Frets 0–${maxF}`);
          this.drawBase();
          ctx.qStart();
        },
        drawBase(extra = []) {
          const win = range(6).map((s) => (s === cur.s ? [0, maxF] : null));
          ctx.draw({ windows: [{ win, color: '#ffd166', opacity: 0.18 }], notes: extra });
        },
        finish(ok, f) {
          locked = true;
          ctx.result(ok, 'find', `${cur.s}-${cur.p}`);
          if (ok && f !== undefined) S.record('note', `${cur.s}-${f}`, true, ctx.elapsed());
          const all = T.allPositions(cur.p, ctx.frets, [cur.s]).map((n) => ({ ...n, cls: 'correct', label: ctx.name(cur.p) }));
          return all;
        },
        onTap(s, f) {
          if (locked || useMic) return;
          if (s !== cur.s) { ctx.flash(`Wrong string — use the ${T.STRING_LABELS[cur.s]} string`, false); return; }
          const p = T.pcOf(T.midiAt(s, f));
          const ok = p === cur.p;
          ctx.sound(T.midiAt(s, f));
          const marks = this.finish(ok, ok ? f : undefined);
          if (!ok) marks.push({ s, f, cls: 'wrong', label: ctx.name(p) });
          this.drawBase(marks);
          ctx.done(ok ? 500 : 1600);
        },
        onPitch(pt) {
          if (locked || !pt || !pt.stable) return;
          ctx.heard(pt.midi);
          const f = pt.midi - T.TUNING[cur.s];
          if (T.pcOf(pt.midi) !== cur.p) return;
          if (f < 0 || f > ctx.frets) { ctx.flash('Right note, wrong octave for that string', false); return; }
          const marks = this.finish(true, f);
          marks.push({ s: cur.s, f, cls: 'correct big', label: ctx.name(cur.p) });
          this.drawBase(marks);
          ctx.done(700);
        },
      };

      const all = {
        next() {
          cur = S.weightedPick(pcs.map((p) => ({ p })), (c) => `${c.p}`, 'findall', 6000, last);
          last = `${cur.p}`;
          cur.targets = T.allPositions(cur.p, maxF, o.strings);
          found = new Set();
          mistakes = 0;
          locked = false;
          this.render();
          ctx.qStart();
        },
        render(extra = []) {
          const left = cur.targets.length - found.size;
          ctx.prompt(`Find every <b>${ctx.name(cur.p)}</b>`, `${left} to go · frets 0–${maxF}`);
          const notes = cur.targets.filter((t) => found.has(`${t.s}-${t.f}`)).map((t) => ({ ...t, cls: 'correct', label: ctx.name(cur.p) }));
          ctx.draw({ notes: notes.concat(extra) });
        },
        onTap(s, f) {
          if (locked) return;
          if (!o.strings.includes(s) || f > maxF) { ctx.flash('Outside the practice area', false); return; }
          const k = `${s}-${f}`;
          if (found.has(k)) return;
          ctx.sound(T.midiAt(s, f));
          if (T.pcOf(T.midiAt(s, f)) === cur.p) {
            found.add(k);
            if (found.size === cur.targets.length) {
              locked = true;
              ctx.result(mistakes === 0, 'findall', `${cur.p}`, ctx.elapsed() / cur.targets.length);
              this.render();
              ctx.done(900);
            } else this.render();
          } else {
            mistakes++;
            blip(false);
            this.render([{ s, f, cls: 'wrong', label: ctx.name(T.pcOf(T.midiAt(s, f))) }]);
            ctx.after(500, () => !locked && this.render());
          }
        },
      };

      const impl = o.mode === 'all' ? all : single;
      if (useMic) ctx.listen((p) => impl.onPitch(p));
      return impl;
    },
  },

  // -------------------------------------------------------------------------
  shapeLocator: {
    title: 'Shape Sprint', icon: '⚡', targetMs: 3000,
    blurb: '"B♭ major, G shape. Go!" Tap a root of that shape. Trains finding any shape in any key instantly.',
    options: [OPT_LEN,
      { id: 'tonality', label: 'Keys', type: 'select', def: 'major',
        choices: [{ v: 'major', l: 'Major' }, { v: 'minor', l: 'Minor' }, { v: 'both', l: 'Both' }] },
      OPT_SHAPES],
    create(ctx) {
      let cur, last, locked;
      return {
        next() {
          for (let tries = 0; tries < 30; tries++) {
            const shapeId = S.weightedPick(ctx.opts.shapes, (x) => x, 'locate', 3000, last);
            const minor = ctx.opts.tonality === 'both' ? Math.random() < 0.5 : ctx.opts.tonality === 'minor';
            const tonic = Math.floor(Math.random() * 12);
            const ref = T.refMajor(tonic, minor);
            const insts = T.shapeInstances(ref, shapeId, ctx.frets);
            if (!insts.length || (cur && cur.tonic === tonic)) continue;
            cur = { shapeId, minor, tonic, ref, insts };
            break;
          }
          last = cur.shapeId;
          locked = false;
          ctx.prompt(`<b>${T.keyName(cur.tonic, cur.minor)}</b> · <b class="shape-${cur.shapeId}">${T.shapeLabel(cur.shapeId, cur.minor)}</b>`,
            'Tap any root note that sits inside that shape');
          ctx.draw({ notes: [] });
          ctx.qStart();
        },
        onTap(s, f) {
          if (locked) return;
          locked = true;
          const p = T.pcOf(T.midiAt(s, f));
          const inside = cur.insts.filter((i) => f >= i.win[s][0] && f <= i.win[s][1]);
          const ok = p === cur.tonic && inside.length > 0;
          ctx.result(ok, 'locate', cur.shapeId);
          ctx.sound(T.midiAt(s, f));
          const inst = inside[0] || T.nearestInstance(cur.ref, cur.shapeId, ctx.frets, f);
          const sc = cur.minor ? 'minPent' : 'majPent';
          const notes = T.notesInShape(inst, cur.tonic, T.SCALES[sc].ints, cur.ref, ctx.frets).map((n) => ({
            s: n.s, f: n.f, cls: n.interval === 0 ? 'root' : 'scale small', label: n.interval === 0 ? 'R' : '',
          }));
          notes.push({ s, f, cls: ok ? 'correct big' : 'wrong big', label: ctx.name(p, T.prefersFlat(cur.tonic, cur.minor)) });
          ctx.draw({ notes, windows: [{ win: inst.win, color: T.SHAPE_COLORS[cur.shapeId] }],
            bands: [{ lo: inst.lo, hi: inst.hi, color: T.SHAPE_COLORS[cur.shapeId], label: T.shapeLabel(cur.shapeId, cur.minor) }] });
          if (!ok) ctx.flash(p === cur.tonic ? 'That root belongs to a different shape' : `That's ${ctx.name(p)}, not ${ctx.name(cur.tonic, T.prefersFlat(cur.tonic, cur.minor))}`, false);
          ctx.done(ok ? 1000 : 2200);
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  shapeBuilder: {
    title: 'Build the Shape', icon: '▦', targetMs: 25000,
    blurb: 'Draw a full pattern from memory, then check it. Or play it on your guitar while the app listens.',
    options: [OPT_LEN_SHAPES,
      scaleOpt(['minPent', 'majPent', 'blues', 'major', 'minor', 'majArp', 'minArp', 'dom7Arp'], 'minPent'),
      OPT_SHAPES, OPT_KEY,
      { id: 'hints', label: 'Hints', type: 'select', def: 'roots',
        choices: [{ v: 'window', l: 'Roots + outline' }, { v: 'roots', l: 'Roots only' }, { v: 'none', l: 'None (find it yourself)' }] },
      OPT_INPUT],
    create(ctx) {
      const o = ctx.opts;
      const sc = T.SCALES[o.scale];
      const useMic = o.input === 'mic';
      let cur, last, placed, checked, seq, seqIdx, slips, lastWrong, lastMatch;

      const build = () => {
        for (let tries = 0; tries < 40; tries++) {
          const shapeId = S.weightedPick(o.shapes, (x) => x, `shape-${o.scale}`, 25000, last);
          const tonic = keyChoice(o.key);
          const ref = T.refMajor(tonic, sc.minor);
          const insts = T.shapeInstances(ref, shapeId, ctx.frets);
          if (!insts.length) continue;
          const inst = rnd(insts);
          return { shapeId, tonic, ref, insts, inst, flat: T.prefersFlat(tonic, sc.minor) };
        }
      };
      const notesOf = (inst) => T.notesInShape(inst, cur.tonic, sc.ints, cur.ref, ctx.frets);
      const showRoots = () => o.hints !== 'none';

      return {
        next() {
          cur = build();
          last = cur.shapeId;
          cur.notes = notesOf(cur.inst);
          placed = new Set();
          checked = false;
          const where = o.hints === 'none' ? 'Anywhere it fits on the neck' : `Around frets ${cur.inst.lo}–${cur.inst.hi}`;
          ctx.prompt(`<b>${T.keyName(cur.tonic, sc.minor)}</b> ${sc.name} · <b class="shape-${cur.shapeId}">${T.shapeLabel(cur.shapeId, sc.minor)}</b>`,
            useMic ? 'Play the pattern low to high, then back down. Notes light up as you hit them.' : `${where}. Tap every note, then press Check.`);
          if (useMic) {
            const asc = [...cur.notes].sort((a, b) => a.midi - b.midi);
            seq = asc.concat(asc.slice(0, -1).reverse());
            seqIdx = 0; slips = 0; lastWrong = null; lastMatch = null;
            ctx.actions([{ label: 'Skip', fn: () => this.reveal(false) }]);
          } else {
            ctx.actions([
              { label: 'Check', primary: true, fn: () => this.check() },
              { label: 'Clear', fn: () => { placed.clear(); this.render(); } },
              { label: 'Show me', fn: () => this.reveal(false) },
            ]);
          }
          this.render();
          ctx.qStart();
        },
        given() {
          return showRoots() ? cur.notes.filter((n) => n.interval === 0) : [];
        },
        render() {
          const notes = this.given().map((n) => ({ s: n.s, f: n.f, cls: 'root', label: 'R' }));
          for (const k of placed) {
            const [s, f] = k.split('-').map(Number);
            notes.push({ s, f, cls: 'user' });
          }
          if (useMic) {
            for (let i = 0; i < seqIdx; i++) notes.push({ s: seq[i].s, f: seq[i].f, cls: 'correct', label: T.INTERVALS[seq[i].interval] });
          }
          const windows = o.hints === 'window' ? [{ win: cur.inst.win, color: T.SHAPE_COLORS[cur.shapeId] }] : [];
          ctx.draw({ notes, windows });
        },
        onTap(s, f) {
          if (checked || useMic) return;
          const k = `${s}-${f}`;
          if (this.given().some((n) => n.s === s && n.f === f)) return;
          if (placed.has(k)) placed.delete(k);
          else { placed.add(k); ctx.sound(T.midiAt(s, f)); }
          this.render();
        },
        check() {
          if (checked) return;
          checked = true;
          // With no hints any complete instance is accepted.
          const candidates = o.hints === 'none' ? cur.insts : [cur.inst];
          let best = null;
          for (const inst of candidates) {
            const notes = notesOf(inst);
            const req = new Set(notes.map((n) => `${n.s}-${n.f}`));
            const given = new Set(this.given().map((n) => `${n.s}-${n.f}`));
            let hit = 0, extra = 0;
            for (const k of placed) (req.has(k) ? hit++ : extra++);
            const need = [...req].filter((k) => !given.has(k)).length;
            const score = hit - extra;
            if (!best || score > best.score) best = { inst, notes, req, given, hit, extra, need, score };
          }
          const missed = best.need - best.hit;
          const perfect = missed === 0 && best.extra === 0;
          ctx.result(perfect, `shape-${o.scale}`, cur.shapeId);
          const marks = best.notes.map((n) => {
            const k = `${n.s}-${n.f}`;
            const cls = best.given.has(k) ? 'root' : placed.has(k) ? 'correct' : 'missed';
            return { s: n.s, f: n.f, cls, label: T.INTERVALS[n.interval] };
          });
          for (const k of placed) if (!best.req.has(k)) {
            const [s, f] = k.split('-').map(Number);
            marks.push({ s, f, cls: 'wrong', label: '✕' });
          }
          ctx.draw({ notes: marks, windows: [{ win: best.inst.win, color: T.SHAPE_COLORS[cur.shapeId] }] });
          ctx.flash(perfect ? 'Perfect! 🎯' : `${best.hit}/${best.need} found${best.extra ? `, ${best.extra} extra` : ''}${missed ? `, ${missed} missed (dashed)` : ''}`, perfect);
          if (perfect) playRun(best.notes);
          ctx.actions([{ label: 'Next →', primary: true, fn: () => ctx.done(0) }, { label: 'Hear it', fn: () => playRun(best.notes) }]);
        },
        reveal(fromMic) {
          checked = true;
          if (!fromMic) ctx.result(false, `shape-${o.scale}`, cur.shapeId);
          ctx.draw({
            notes: cur.notes.map((n) => ({ s: n.s, f: n.f, cls: n.interval === 0 ? 'root' : 'scale', label: T.INTERVALS[n.interval] })),
            windows: [{ win: cur.inst.win, color: T.SHAPE_COLORS[cur.shapeId] }],
          });
          playRun(cur.notes);
          ctx.actions([{ label: 'Next →', primary: true, fn: () => ctx.done(0) }, { label: 'Hear it', fn: () => playRun(cur.notes) }]);
        },
        onPitch(pt) {
          if (checked || !pt || !pt.stable) return;
          ctx.heard(pt.midi);
          const exp = seq[seqIdx];
          const pcMatch = T.pcOf(pt.midi) === exp.pc && Math.abs(pt.midi - exp.midi) <= 12;
          if (pcMatch && pt.midi !== lastMatch) {
            lastMatch = pt.midi;
            seqIdx++;
            lastWrong = null;
            this.render();
            if (seqIdx >= seq.length) {
              checked = true;
              ctx.result(slips <= 1, `shape-${o.scale}`, cur.shapeId);
              ctx.flash(slips ? `Done, with ${slips} slip${slips > 1 ? 's' : ''}` : 'Clean run! 🎯', slips <= 1);
              ctx.actions([{ label: 'Next →', primary: true, fn: () => ctx.done(0) }]);
            }
          } else if (!pcMatch && pt.midi !== lastWrong && pt.midi !== lastMatch) {
            lastWrong = pt.midi;
            slips++;
          }
        },
        useMic,
      };
    },
  },

  // -------------------------------------------------------------------------
  intervalSpotter: {
    title: 'Interval Spotter', icon: '③', targetMs: 2500,
    blurb: 'Know what every note in a shape is (the 3rd, the ♭7) so you can aim for chord tones on purpose.',
    options: [OPT_LEN, scaleOpt(['minPent', 'majPent', 'blues', 'major', 'minor', 'mixo', 'dorian'], 'minPent'), OPT_SHAPES, OPT_KEY],
    create(ctx) {
      const o = ctx.opts;
      const sc = T.SCALES[o.scale];
      const ints = sc.ints.filter((i) => i !== 0);
      let cur, lastLabel, locked;
      return {
        next() {
          let inst, tonic, ref, shapeId;
          for (let t = 0; t < 40; t++) {
            shapeId = rnd(o.shapes);
            tonic = keyChoice(o.key);
            ref = T.refMajor(tonic, sc.minor);
            const insts = T.shapeInstances(ref, shapeId, ctx.frets);
            if (insts.length) { inst = rnd(insts); break; }
          }
          const notes = T.notesInShape(inst, tonic, sc.ints, ref, ctx.frets);
          const target = S.weightedPick(notes.filter((n) => n.interval !== 0), (n) => T.INTERVALS[n.interval], `int-${o.scale}`, 2500, lastLabel);
          lastLabel = T.INTERVALS[target.interval];
          cur = { inst, tonic, notes, target, shapeId };
          locked = false;
          ctx.prompt(`<b>${T.keyName(tonic, sc.minor)}</b> ${sc.short} · <b class="shape-${shapeId}">${T.shapeLabel(shapeId, sc.minor)}</b>`, 'What interval is the flashing note?');
          ctx.draw({
            notes: notes.map((n) => (n === target ? { s: n.s, f: n.f, cls: 'q' }
              : n.interval === 0 ? { s: n.s, f: n.f, cls: 'root', label: 'R' } : { s: n.s, f: n.f, cls: 'scale small dim' })),
            windows: [{ win: inst.win, color: T.SHAPE_COLORS[shapeId], opacity: 0.1 }],
          });
          ctx.answers(ints.map((i) => ({ value: i, label: T.INTERVALS[i], sub: T.INTERVAL_NAMES[i] })), (v) => this.answer(v), 'digits');
          ctx.qStart();
        },
        answer(v) {
          if (locked) return;
          locked = true;
          const ok = v === cur.target.interval;
          ctx.result(ok, `int-${o.scale}`, T.INTERVALS[cur.target.interval]);
          ctx.sound(cur.target.midi);
          ctx.draw({
            notes: cur.notes.map((n) => ({ s: n.s, f: n.f, label: T.INTERVALS[n.interval],
              cls: n === cur.target ? (ok ? 'correct big' : 'wrong big') : n.interval === 0 ? 'root' : 'scale dim' })),
            windows: [{ win: cur.inst.win, color: T.SHAPE_COLORS[cur.shapeId], opacity: 0.1 }],
          });
          ctx.markAnswer(v, cur.target.interval);
          ctx.done(ok ? 650 : 1700);
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  shapeNamer: {
    title: 'Name That Shape', icon: '?', targetMs: 3000,
    blurb: 'A pattern appears somewhere on the neck. Which CAGED shape is it, and what key?',
    options: [OPT_LEN, scaleOpt(['minPent', 'majPent', 'major', 'minor', 'majArp', 'minArp'], 'majPent'), OPT_SHAPES,
      { id: 'askKey', label: 'Also ask the key', type: 'select', def: true, choices: [{ v: true, l: 'Yes' }, { v: false, l: 'No' }] }],
    create(ctx) {
      const o = ctx.opts;
      const sc = T.SCALES[o.scale];
      let cur, step, last;
      return {
        next() {
          for (let t = 0; t < 40; t++) {
            const shapeId = S.weightedPick(o.shapes, (x) => x, 'nameshape', 3000, last);
            const tonic = Math.floor(Math.random() * 12);
            const ref = T.refMajor(tonic, sc.minor);
            const insts = T.shapeInstances(ref, shapeId, ctx.frets);
            if (!insts.length) continue;
            const inst = rnd(insts);
            cur = { shapeId, tonic, ref, inst, notes: T.notesInShape(inst, tonic, sc.ints, ref, ctx.frets), flat: T.prefersFlat(tonic, sc.minor) };
            break;
          }
          last = cur.shapeId;
          step = 1;
          ctx.prompt(`Which shape is this? <span class="muted">(${sc.short})</span>`, 'Roots are the bright notes');
          this.render(false);
          ctx.answers(T.SHAPE_ORDER.map((id) => ({ value: id, label: sc.minor ? T.MINOR_NAME[id] : id })), (v) => this.answer(v));
          ctx.qStart();
        },
        render(labels) {
          ctx.draw({
            notes: cur.notes.map((n) => ({ s: n.s, f: n.f, cls: n.interval === 0 ? 'root' : 'scale',
              label: labels ? (n.interval === 0 ? ctx.name(n.pc, cur.flat) : T.INTERVALS[n.interval]) : '' })),
            windows: step > 1 ? [{ win: cur.inst.win, color: T.SHAPE_COLORS[cur.shapeId] }] : [],
          });
        },
        answer(v) {
          if (step === 1) {
            const ok = v === cur.shapeId;
            ctx.result(ok, 'nameshape', cur.shapeId);
            ctx.markAnswer(v, cur.shapeId);
            step = 2;
            if (!o.askKey) { this.render(true); playRun(cur.notes); ctx.done(ok ? 800 : 1800); return; }
            ctx.after(ok ? 450 : 1300, () => {
              ctx.prompt(ok ? `${T.shapeLabel(cur.shapeId, sc.minor)} ✓ · Now: what's the key?` : `It was the ${T.shapeLabel(cur.shapeId, sc.minor)}. Now: what's the key?`, 'Name the root note');
              this.render(false);
              ctx.answers(range(12).map((p) => ({ value: p, label: T.BOTH[p] })), (x) => this.answer(x), 'notes');
              ctx.qStart();
            });
          } else if (step === 2) {
            step = 3;
            const ok = v === cur.tonic;
            ctx.result(ok, 'namekey', `${cur.shapeId}`);
            ctx.markAnswer(v, cur.tonic);
            ctx.prompt(`<b>${T.keyName(cur.tonic, sc.minor)}</b> · ${T.shapeLabel(cur.shapeId, sc.minor)}`, '');
            this.render(true);
            playRun(cur.notes);
            ctx.done(ok ? 900 : 1900);
          }
        },
      };
    },
  },
};

function ord(n) { return n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; }

export function playRun(notes) {
  const c = audio();
  const asc = [...notes].sort((a, b) => a.midi - b.midi);
  asc.forEach((n, i) => pluck(n.midi, c.currentTime + 0.05 + i * 0.13, 0.55));
}

// ===========================================================================
// Session runner: renders the drill screen and handles timing + scoring.
export class DrillRunner {
  constructor(root, drillId, opts, { onExit, onFinish, stepLabel } = {}) {
    this.root = root;
    this.def = DRILLS[drillId];
    this.id = drillId;
    this.opts = opts;
    this.onExit = onExit;
    this.onFinish = onFinish;
    this.stepLabel = stepLabel;
    this.timers = [];
    this.correct = 0; this.total = 0; this.times = []; this.streak = 0; this.bestStreak = 0;
    this.misses = {};
    this.mic = null;
  }

  start() {
    const st = S.settings();
    this.frets = st.frets;
    this.maxFret = Math.min(this.opts.maxFret ?? 99, st.frets);
    // Only draw as many frets as the drill uses (keeps phones from scrolling).
    this.boardFrets = this.opts.maxFret !== undefined ? Math.min(st.frets, Math.max(7, this.maxFret)) : st.frets;
    document.body.classList.add('focus');
    const len = this.opts.len || 't60';
    this.limitSecs = len[0] === 't' ? +len.slice(1) : null;
    this.limitCount = len[0] === 'c' ? +len.slice(1) : null;

    this.root.innerHTML = `
      <div class="drill">
        <div class="drill-top">
          <button class="icon-btn" data-act="exit" aria-label="Exit">✕</button>
          <div class="drill-title">${this.stepLabel ? `<span class="step">${this.stepLabel}</span>` : ''}${this.def.title}</div>
          <div class="drill-meta"><span class="pill" data-el="score">0 / 0</span><span class="pill" data-el="clock"></span></div>
        </div>
        <div class="progress"><div data-el="bar"></div></div>
        <div class="prompt"><div class="prompt-main" data-el="prompt"></div><div class="prompt-sub" data-el="sub"></div></div>
        <div class="flash" data-el="flash"></div>
        <div class="board-wrap" data-el="board"></div>
        <div class="heard" data-el="heard"></div>
        <div class="answers" data-el="answers"></div>
        <div class="actions" data-el="actions"></div>
      </div>`;
    this.el = {};
    this.root.querySelectorAll('[data-el]').forEach((e) => (this.el[e.dataset.el] = e));
    this.root.querySelector('[data-act=exit]').onclick = () => this.finish(true);
    this.board = new Fretboard(this.el.board, {
      getSettings: () => S.settings(),
      onTap: (s, f) => this.impl.onTap && this.impl.onTap(s, f),
    });
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);

    this.impl = this.def.create(this.ctx());
    this.t0 = performance.now();
    this.clock = setInterval(() => this.tickClock(), 200);
    this.tickClock();
    this.impl.next();
  }

  ctx() {
    const self = this;
    return {
      opts: this.opts,
      maxFret: this.maxFret,
      frets: this.frets,
      draw: (state) => this.board.draw({ frets: this.boardFrets, ...state }),
      prompt: (main, sub = '') => { this.el.prompt.innerHTML = main; this.el.sub.innerHTML = sub; },
      answers: (list, cb, keys) => this.renderAnswers(list, cb, keys),
      actions: (list) => this.renderActions(list),
      markAnswer: (chosen, correct) => {
        this.el.answers.querySelectorAll('button').forEach((b) => {
          const v = b._value;
          if (v === correct) b.classList.add('ok');
          else if (v === chosen) b.classList.add('bad');
          b.disabled = true;
        });
      },
      qStart: () => { this.qT = performance.now(); },
      elapsed: () => performance.now() - this.qT,
      result: (ok, bucket, key, ms) => this.result(ok, bucket, key, ms ?? performance.now() - this.qT),
      done: (delay) => this.after(delay, () => this.nextQuestion()),
      after: (ms, fn) => this.after(ms, fn),
      sound: (midi) => { if (S.settings().sound) pluck(midi); },
      flash: (msg, ok) => this.flash(msg, ok),
      name: (pc, flat) => {
        const sp = S.settings().spelling;
        const useFlat = sp === 'flat' ? true : sp === 'sharp' ? false : !!flat;
        return T.noteName(pc, useFlat);
      },
      heard: (midi) => { this.el.heard.textContent = `🎤 heard ${T.noteName(midi)}${Math.floor(midi / 12) - 1}`; },
      listen: (cb) => self.startMic(cb),
    };
  }

  async startMic(cb) {
    if (!micSupported()) { this.flash('Microphone not available in this browser', false); return; }
    this.mic = new PitchListener();
    this.el.heard.textContent = '🎤 starting microphone…';
    try {
      await this.mic.start(cb);
      this.el.heard.textContent = '🎤 listening. Play a note.';
    } catch (e) {
      this.el.heard.textContent = '🎤 microphone blocked. Allow mic access, or switch "Answer by" to tapping.';
    }
  }

  renderAnswers(list, cb, keys) {
    this.answerCb = cb;
    this.answerList = list;
    this.answerKeys = keys;
    this.el.answers.className = 'answers' + (list.length > 7 ? ' many' : '');
    this.el.answers.innerHTML = '';
    for (const a of list) {
      const b = document.createElement('button');
      b.className = 'ans';
      b._value = a.value;
      b.innerHTML = `<span>${a.label}</span>${a.sub ? `<small>${a.sub}</small>` : ''}`;
      b.onclick = () => cb(a.value);
      this.el.answers.appendChild(b);
    }
    this.el.actions.innerHTML = '';
  }

  renderActions(list) {
    this.el.answers.innerHTML = '';
    this.answerCb = null;
    this.el.actions.innerHTML = '';
    for (const a of list) {
      const b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.onclick = a.fn;
      this.el.actions.appendChild(b);
    }
  }

  onKey(e) {
    if (!this.answerCb || e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.answerKeys === 'notes') {
      const pc = LETTER_PC[e.key.toLowerCase()];
      if (pc === undefined) return;
      const v = (pc + (e.shiftKey ? 1 : 0)) % 12;
      if (this.answerList.some((a) => a.value === v)) { e.preventDefault(); this.answerCb(v); }
    } else {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.answerList.length) { e.preventDefault(); this.answerCb(this.answerList[n - 1].value); }
    }
  }

  result(ok, bucket, key, ms) {
    this.total++;
    if (ok) { this.correct++; this.times.push(ms); this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); }
    else { this.streak = 0; const k = `${bucket}:${key}`; this.misses[k] = (this.misses[k] || 0) + 1; }
    S.record(bucket, key, ok, ms);
    if (S.settings().sound) blip(ok);
    this.el.score.textContent = `${this.correct} / ${this.total}`;
    this.el.score.classList.toggle('hot', this.streak >= 5);
    if (this.limitCount) this.el.bar.style.width = `${(100 * this.total) / this.limitCount}%`;
  }

  flash(msg, ok) {
    this.el.flash.textContent = msg;
    this.el.flash.className = 'flash show ' + (ok ? 'ok' : 'bad');
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => (this.el.flash.className = 'flash'), 2200);
  }

  after(ms, fn) {
    const id = setTimeout(fn, ms);
    this.timers.push(id);
    return id;
  }

  tickClock() {
    const secs = (performance.now() - this.t0) / 1000;
    if (this.limitSecs) {
      const left = Math.max(0, this.limitSecs - secs);
      this.el.clock.textContent = `${Math.ceil(left)}s`;
      this.el.bar.style.width = `${(100 * secs) / this.limitSecs}%`;
      if (left <= 0) this.finish(false);
    } else {
      this.el.clock.textContent = `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
    }
  }

  nextQuestion() {
    if (this.finished) return;
    if (this.limitCount && this.total >= this.limitCount) return this.finish(false);
    this.el.flash.className = 'flash';
    this.impl.next();
  }

  cleanup() {
    document.body.classList.remove('focus');
    clearInterval(this.clock);
    this.timers.forEach(clearTimeout);
    window.removeEventListener('keydown', this.keyHandler);
    if (this.mic) this.mic.stop();
  }

  finish(aborted) {
    if (this.finished) return;
    this.finished = true;
    this.cleanup();
    const secs = Math.round((performance.now() - this.t0) / 1000);
    S.addPractice(secs);
    const summary = {
      drill: this.id, title: this.def.title, correct: this.correct, total: this.total, secs,
      acc: this.total ? this.correct / this.total : 0,
      avgMs: this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : 0,
      bestStreak: this.bestStreak,
    };
    if (this.total) S.logSession(summary);
    if (aborted && !this.onFinish) return this.onExit && this.onExit();
    this.showSummary(summary);
  }

  showSummary(s) {
    const misses = Object.entries(this.misses).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, n]) => `<li>${describeItem(k)} <span class="muted">×${n}</span></li>`).join('');
    const target = this.def.targetMs;
    const fast = s.avgMs && s.avgMs < target;
    this.root.innerHTML = `
      <div class="summary card">
        <div class="summary-title">${this.def.title}</div>
        <div class="big-stats">
          <div><b>${Math.round(s.acc * 100)}%</b><span>accuracy</span></div>
          <div><b>${s.correct}</b><span>correct</span></div>
          <div><b>${s.avgMs ? (s.avgMs / 1000).toFixed(1) + 's' : '–'}</b><span>avg time</span></div>
          <div><b>${s.bestStreak}</b><span>best streak</span></div>
        </div>
        <p class="verdict">${verdict(s.acc, fast, target)}</p>
        ${misses ? `<div class="misses"><div class="label">Missed most</div><ul>${misses}</ul><p class="muted small">These come up more often next time.</p></div>` : ''}
        <div class="actions center">
          ${this.onFinish ? '<button class="btn primary" data-a="next">Next step →</button>' : '<button class="btn primary" data-a="again">Go again</button>'}
          <button class="btn" data-a="exit">${this.onFinish ? 'End workout' : 'Done'}</button>
        </div>
      </div>`;
    const again = this.root.querySelector('[data-a=again]');
    if (again) again.onclick = () => { const r = new DrillRunner(this.root, this.id, this.opts, { onExit: this.onExit }); r.start(); };
    const nxt = this.root.querySelector('[data-a=next]');
    if (nxt) nxt.onclick = () => this.onFinish(s);
    this.root.querySelector('[data-a=exit]').onclick = () => this.onExit && this.onExit();
  }
}

function verdict(acc, fast, target) {
  const t = (target / 1000).toFixed(1);
  if (acc >= 0.9 && fast) return `🔥 Fluent. Accurate <i>and</i> under ${t}s. Try a harder setting, or use your guitar.`;
  if (acc >= 0.9) return `Accurate. Now push for speed: aim for under ${t}s per answer.`;
  if (acc >= 0.7) return 'Getting there. Slow down a little and focus on getting it right. Speed comes later.';
  return 'Tough one. Try a smaller range (fewer strings or frets) and build up from there.';
}

export function describeItem(k) {
  const [bucket, key] = k.split(':');
  if (bucket === 'note') { const [s, f] = key.split('-').map(Number); return `${T.noteName(T.midiAt(s, f))} · ${T.STRING_LABELS[s]} string, fret ${f}`; }
  if (bucket === 'find') { const [s, p] = key.split('-').map(Number); return `${T.noteName(p)} on the ${T.STRING_LABELS[s]} string`; }
  if (bucket === 'findall') return `Every ${T.noteName(+key)}`;
  if (bucket === 'locate') return `Locating the ${key} shape`;
  if (bucket === 'nameshape') return `Recognising the ${key} shape`;
  if (bucket === 'namekey') return `Key of a ${key}-shape pattern`;
  if (bucket.startsWith('shape-')) return `${key} shape: ${T.SCALES[bucket.slice(6)]?.short}`;
  if (bucket.startsWith('int-')) return `The ${key} in ${T.SCALES[bucket.slice(4)]?.short}`;
  return k;
}
