// App shell: routing, Explore, Train (+ workout), Progress, Guide, Settings.
import * as T from './theory.js';
import * as S from './stats.js';
import { Fretboard } from './fretboard.js';
import { DRILLS, DrillRunner, describeItem, playRun } from './drills.js';
import { renderJam } from './jam.js';
import { pluck, audio } from './audio.js';
import { PitchListener, micSupported } from './pitch.js';

const view = document.getElementById('view');
let cleanupView = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- routing --
const ROUTES = { train: renderTrain, explore: renderExplore, jam: renderJamView, progress: renderProgress, guide: renderGuide, settings: renderSettings };

// Drill pages live at #train/<slug>, e.g. #train/build-the-shape.
const slug = (id) => DRILLS[id].title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function route() {
  const [name, sub] = (location.hash.slice(1) || 'train').split('/');
  if (cleanupView) { try { cleanupView(); } catch {} cleanupView = null; }
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === name));
  view.innerHTML = '';
  window.scrollTo(0, 0);
  (ROUTES[name] || renderTrain)(sub);
}
window.addEventListener('hashchange', route);
// A link to the current #train fires no hashchange, so re-route by hand to leave a running drill or workout.
// Other pages keep their state (a playing jam, the tuner); modified clicks open a new tab instead.
document.addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  const a = e.target.closest('a[href="#train"]');
  if (a && location.hash === '#train') route();
});
// Unlock audio on first interaction (mobile browsers require a gesture).
window.addEventListener('pointerdown', () => audio(), { once: true });

// ------------------------------------------------------------------ Train --
function renderTrain(sub) {
  const drill = sub && Object.keys(DRILLS).find((id) => slug(id) === sub);
  if (drill) return renderDrillSetup(drill);
  const t = S.totals();
  const plan = workoutPlan();
  const st = S.streak();
  view.innerHTML = `
    <section class="hero card">
      <div class="hero-stats">
        <div><b>${st}</b><span>day streak ${st ? '🔥' : ''}</span></div>
        <div><b>${Math.round(t.todaySecs / 60)}</b><span>min today</span></div>
        <div><b>${Math.round(t.secs / 60)}</b><span>min total</span></div>
      </div>
      <div class="workout">
        <div>
          <div class="workout-title">${t.workoutToday ? '✅ Workout done today' : "Today's workout"} <span class="muted">≈ 12 min</span></div>
          <div class="workout-sub">Focus: <b>${T.keyName(plan.key, plan.minor)}</b> · <b class="shape-${plan.shape}">${T.shapeLabel(plan.shape, plan.minor)}</b> + <b class="shape-${plan.neighbor}">${T.shapeLabel(plan.neighbor, plan.minor)}</b> · ${T.SCALES[plan.scale].short}</div>
          <ol class="workout-steps">${plan.steps.map((s) => `<li>${s.label}</li>`).join('')}</ol>
        </div>
        <button class="btn primary big" data-a="workout">${t.workoutToday ? 'Do it again' : 'Start workout ▶'}</button>
      </div>
    </section>
    <h2 class="section-title">Drills</h2>
    <div class="drill-grid">
      ${Object.entries(DRILLS).map(([id, d]) => `
        <a class="drill-card card" href="#train/${slug(id)}">
          <span class="drill-icon">${d.icon}</span>
          <span class="drill-name">${d.title}</span>
          <span class="drill-blurb">${d.blurb}</span>
        </a>`).join('')}
      <a class="drill-card card" href="#jam">
        <span class="drill-icon">🎸</span><span class="drill-name">Jam & Improvise</span>
        <span class="drill-blurb">Backing tracks in any key. The neck shows your position, the chord tones to aim for, and what's coming next.</span>
      </a>
    </div>
    <p class="muted small center">New to CAGED? Start with the <a href="#guide">Guide</a>, then explore the shapes in <a href="#explore">Explore</a>.</p>`;
  view.querySelector('[data-a=workout]').onclick = () => runWorkout(plan);
}

function renderDrillSetup(id) {
  const d = DRILLS[id];
  const saved = S.settings()['opt_' + id] || {};
  const opts = {};
  for (const o of d.options) opts[o.id] = saved[o.id] !== undefined ? saved[o.id] : structuredClone(o.def);
  const draw = () => {
    view.innerHTML = `
      <div class="setup card">
        <button class="icon-btn back" data-a="back">←</button>
        <div class="setup-head"><span class="drill-icon">${d.icon}</span><div><h2>${d.title}</h2><p class="muted">${d.blurb}</p></div></div>
        ${d.options.map((o) => `
          <div class="opt"><div class="label">${o.label}</div><div class="chips">
            ${o.choices.map((c) => {
              const on = o.type === 'multi' ? opts[o.id].includes(c.v) : opts[o.id] === c.v;
              const color = o.id === 'shapes' ? ` style="--chip:${T.SHAPE_COLORS[c.v]}"` : '';
              return `<button class="chip ${on ? 'on' : ''}" data-o="${o.id}" data-v='${JSON.stringify(c.v)}'${color}>${c.l}</button>`;
            }).join('')}
          </div></div>`).join('')}
        ${opts.input === 'mic' ? `<p class="note">🎤 Use headphones or a quiet room. Pitch detection works best with single, clean notes${micSupported() ? '' : '. <b>Your browser has no microphone support.</b>'}</p>` : ''}
        <div class="actions"><button class="btn primary big" data-a="start">Start ▶</button></div>
      </div>`;
    view.querySelector('[data-a=back]').onclick = () => (location.hash = 'train');
    view.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => {
      const o = d.options.find((x) => x.id === b.dataset.o);
      const v = JSON.parse(b.dataset.v);
      if (o.type === 'multi') {
        const arr = opts[o.id];
        const i = arr.indexOf(v);
        if (i >= 0) { if (arr.length > 1) arr.splice(i, 1); } else arr.push(v);
      } else opts[o.id] = v;
      draw();
    }));
    view.querySelector('[data-a=start]').onclick = () => {
      S.setSetting('opt_' + id, opts);
      startDrill(id, opts);
    };
  };
  draw();
}

function startDrill(id, opts, extra = {}) {
  const r = new DrillRunner(view, id, opts, { onExit: () => (location.hash === '#train' ? renderTrain() : (location.hash = '#train')), ...extra });
  cleanupView = () => r.cleanup();
  r.start();
}

// --- daily workout --------------------------------------------------------
function workoutPlan() {
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  const circle = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]; // circle of fourths
  const key = circle[day % 12];
  const minor = day % 2 === 1;
  const scale = minor ? 'minPent' : 'majPent';
  // Introduce shapes in a sensible order, then focus on the weakest.
  const intro = minor ? ['G', 'E', 'D', 'C', 'A'] : ['E', 'D', 'C', 'A', 'G'];
  let shape = intro.find((id) => !S.item(`shape-${scale}`, id));
  if (!shape) {
    let worst = 2;
    for (const id of intro) {
      const m = S.mastery(`shape-${scale}`, id, 25000) ?? 0;
      if (m < worst) { worst = m; shape = id; }
    }
  }
  const o = T.SHAPE_ORDER;
  const neighbor = o[(o.indexOf(shape) + 1) % 5];
  const majorProgs = ['blues12', 'pop', 'rock145', 'mixo', 'vampMaj'];
  const minorProgs = ['aeolian', 'minBlues', 'sadpop', 'dorian', 'vampMin', 'minor145'];
  const prog = minor ? minorProgs[Math.floor(day / 2) % minorProgs.length] : majorProgs[Math.floor(day / 2) % majorProgs.length];
  const all6 = [0, 1, 2, 3, 4, 5];
  const steps = [
    { type: 'drill', id: 'noteNamer', label: 'Warm-up: name notes (1 min)', opts: { len: 't60', maxFret: 12, strings: all6, naturals: false } },
    { type: 'drill', id: 'shapeLocator', label: 'Shape Sprint: find shapes in any key (1 min)', opts: { len: 't60', tonality: minor ? 'minor' : 'major', shapes: [...o] } },
    { type: 'drill', id: 'shapeBuilder', label: `Build the ${T.shapeLabel(shape, minor)} & ${T.shapeLabel(neighbor, minor)} from memory`, opts: { len: 'c4', scale, shapes: [shape, neighbor], key, hints: 'roots', input: 'tap' } },
    { type: 'drill', id: 'intervalSpotter', label: 'Interval Spotter in those shapes (1 min)', opts: { len: 't60', scale, shapes: [shape, neighbor], key: 'rand' } },
    { type: 'drill', id: 'noteFinder', label: 'Find every instance of a note (1 min)', opts: { mode: 'all', len: 't60', maxFret: 12, strings: all6, naturals: false, input: 'tap' } },
    { type: 'jam', label: `Improvise: ${T.PROGRESSIONS[prog].name} (4 min)`, minutes: 4,
      preset: { key, prog, scale, pos: shape, view: 'key', shift: 0, prompts: true, labels: 'int' } },
  ];
  return { key, minor, scale, shape, neighbor, steps };
}

function runWorkout(plan) {
  let i = 0;
  const results = [];
  const next = () => {
    if (cleanupView) { try { cleanupView(); } catch {} cleanupView = null; }
    if (i >= plan.steps.length) return finishWorkout(results);
    const step = plan.steps[i];
    const label = `Step ${i + 1}/${plan.steps.length}`;
    i++;
    if (step.type === 'drill') {
      startDrill(step.id, step.opts, { stepLabel: label, onFinish: (s) => { results.push(s); next(); }, onExit: () => renderTrain() });
    } else {
      view.innerHTML = '';
      const j = renderJam(view, { preset: step.preset, minutes: step.minutes, stepLabel: label, onDone: next });
      cleanupView = j.cleanup;
    }
  };
  next();
}

function finishWorkout(results) {
  S.markWorkout();
  const acc = results.length ? results.reduce((a, r) => a + r.acc, 0) / results.length : 0;
  view.innerHTML = `
    <div class="summary card">
      <div class="summary-title">Workout complete 🎉</div>
      <div class="big-stats">
        <div><b>${S.streak()}</b><span>day streak</span></div>
        <div><b>${Math.round(acc * 100)}%</b><span>avg accuracy</span></div>
        <div><b>${results.length + 1}</b><span>steps done</span></div>
      </div>
      <ul class="result-list">${results.map((r) => `<li><span>${r.title}</span><b>${Math.round(r.acc * 100)}%</b><span class="muted">${r.avgMs ? (r.avgMs / 1000).toFixed(1) + 's' : ''}</span></li>`).join('')}</ul>
      <p class="verdict">Come back tomorrow for a new key and focus shape. Doing this daily is what makes it stick.</p>
      <div class="actions center"><a class="btn primary" href="#progress">See progress</a><button class="btn" data-a="home">Home</button></div>
    </div>`;
  view.querySelector('[data-a=home]').onclick = () => renderTrain();
}

// ---------------------------------------------------------------- Explore --
function renderExplore() {
  const st = S.settings();
  const ex = Object.assign({ key: st.focusKey ?? 9, scale: 'minPent', shape: 'G', labels: 'int', chord: true, outline: true }, st.explore || {});
  view.innerHTML = `
    <div class="explore">
      <div class="card controls">
        <div class="opt"><div class="label">Key</div><div class="chips keys" data-el="keys"></div></div>
        <div class="row">
          <label>Scale / arpeggio<select data-el="scale">${Object.entries(T.SCALES).map(([id, s]) => `<option value="${id}">${s.name}</option>`).join('')}</select></label>
          <label>Labels<select data-el="labels"><option value="int">Intervals</option><option value="note">Note names</option><option value="none">None (test yourself)</option></select></label>
          <label class="check"><input type="checkbox" data-el="chord"> Highlight chord tones</label>
          <label class="check"><input type="checkbox" data-el="outline"> Shape outline</label>
        </div>
        <div class="opt"><div class="label">Shape</div><div class="chips" data-el="shapes"></div></div>
      </div>
      <div class="info card" data-el="info"></div>
      <div class="board-wrap" data-el="board"></div>
      <div class="actions center">
        <button class="btn" data-a="play">▶ Hear it</button>
        <button class="btn" data-a="prev">◀ Previous shape</button>
        <button class="btn" data-a="next">Next shape ▶</button>
        <a class="btn primary" href="#jam">Jam over it 🎸</a>
      </div>
    </div>`;
  const el = {};
  view.querySelectorAll('[data-el]').forEach((e) => (el[e.dataset.el] = e));
  const board = new Fretboard(el.board, { getSettings: () => S.settings(), onTap: (s, f) => S.settings().sound && pluck(T.midiAt(s, f)) });
  let layout;

  const save = () => S.setSetting('explore', ex);
  const draw = () => {
    const sc = T.SCALES[ex.scale];
    const flat = T.prefersFlat(ex.key, sc.minor);
    el.keys.innerHTML = [...Array(12).keys()].map((p) => `<button class="chip ${p === ex.key ? 'on' : ''}" data-k="${p}">${T.noteName(p, flat)}</button>`).join('');
    el.shapes.innerHTML = [...T.SHAPE_ORDER, 'all'].map((id) => `<button class="chip ${ex.shape === id ? 'on' : ''}" data-s="${id}" ${id !== 'all' ? `style="--chip:${T.SHAPE_COLORS[id]}"` : ''}>${id === 'all' ? 'All 5 (whole neck)' : sc.minor ? T.MINOR_NAME[id] : id}</button>`).join('');
    el.scale.value = ex.scale; el.labels.value = ex.labels; el.chord.checked = ex.chord; el.outline.checked = ex.outline;
    el.keys.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { ex.key = +b.dataset.k; save(); draw(); }));
    el.shapes.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { ex.shape = b.dataset.s; save(); draw(); }));

    const frets = S.settings().frets;
    layout = T.scaleLayout({ tonicPc: ex.key, scaleId: ex.scale, shapeId: ex.shape, maxFret: frets });
    const triad = sc.minor ? [0, 3, 7] : [0, 4, 7];
    const notes = layout.notes.map((n) => {
      const isChord = ex.chord && !sc.arp && triad.includes(n.interval);
      const label = ex.labels === 'none' ? '' : ex.labels === 'note' ? T.noteName(n.pc, flat) : T.INTERVALS[n.interval];
      let fill;
      if (ex.shape === 'all' && n.interval !== 0) fill = n.shapes.length > 1 ? '#cfd6e4' : T.SHAPE_COLORS[n.shapes[0]];
      return { s: n.s, f: n.f, label, fill, cls: (n.interval === 0 ? 'root' : isChord ? 'chordtone' : 'scale') + (n.ext ? ' ext' : '') };
    });
    const windows = ex.outline ? layout.instances.map((i) => ({ win: i.win, color: T.SHAPE_COLORS[i.shapeId], opacity: ex.shape === 'all' ? 0.08 : 0.16 })) : [];
    const bands = layout.instances.map((i) => ({ lo: i.lo, hi: i.hi, color: T.SHAPE_COLORS[i.shapeId], label: sc.minor ? T.MINOR_NAME[i.shapeId] : i.shapeId }));
    board.draw({ notes, windows, bands });

    // info panel
    const kn = T.keyName(ex.key, sc.minor);
    if (ex.shape === 'all') {
      const order = sc.minor ? 'Am → Gm → Em → Dm → Cm' : 'C → A → G → E → D';
      el.info.innerHTML = `<b>${kn} · ${sc.name}</b> across the whole neck. The five shapes link up in the order <b>${order}</b>, then repeat 12 frets higher.
        Each shape shares its edge notes with the next one. That overlap is how you slide between positions mid-solo. Grey notes belong to two shapes.`;
    } else {
      const inst = layout.instances[0];
      const rootLetter = sc.minor ? T.MINOR_NAME[ex.shape][0] : ex.shape;
      const relKey = sc.minor ? T.keyName((ex.key + 3) % 12, false) : T.keyName((ex.key + 9) % 12, true);
      const relShape = sc.minor ? `${ex.shape} shape` : `${T.MINOR_NAME[ex.shape]} shape`;
      const next = T.SHAPE_ORDER[(T.SHAPE_ORDER.indexOf(ex.shape) + 1) % 5];
      el.info.innerHTML = `<b>${kn} · ${sc.name} · <span class="shape-${ex.shape}">${T.shapeLabel(ex.shape, sc.minor)}</span></b>
        ${inst ? `<span class="muted">(frets ${inst.lo}–${inst.hi}${layout.instances[1] ? ` and ${layout.instances[1].lo}–${layout.instances[1].hi}` : ''})</span>` : '<span class="muted">(does not fit on the neck with the current fret count)</span>'}
        <ul>
          <li><b>Roots:</b> ${T.ROOT_HINTS[rootLetter]}</li>
          <li><b>Same notes, same place:</b> the ${relShape} of ${relKey} (relative ${sc.minor ? 'major' : 'minor'}).</li>
          <li><b>Next shape up the neck:</b> ${T.shapeLabel(next, sc.minor)}</li>
          ${ex.chord && !sc.arp ? `<li><b>Bigger notes</b> = the ${sc.minor ? 'minor' : 'major'} chord tones (R, ${sc.minor ? '♭3' : '3'}, 5). Land on these when the chord changes.</li>` : ''}
        </ul>`;
    }
  };
  el.scale.onchange = () => { ex.scale = el.scale.value; save(); draw(); };
  el.labels.onchange = () => { ex.labels = el.labels.value; save(); draw(); };
  el.chord.onchange = () => { ex.chord = el.chord.checked; save(); draw(); };
  el.outline.onchange = () => { ex.outline = el.outline.checked; save(); draw(); };
  const step = (d) => {
    const o = T.SHAPE_ORDER;
    ex.shape = ex.shape === 'all' ? o[0] : o[(o.indexOf(ex.shape) + d + 5) % 5];
    save(); draw();
  };
  view.querySelector('[data-a=next]').onclick = () => step(1);
  view.querySelector('[data-a=prev]').onclick = () => step(-1);
  view.querySelector('[data-a=play]').onclick = () => {
    if (ex.shape === 'all') return playRun(layout.notes.filter((n) => n.shapes[0] === T.SHAPE_ORDER[0]));
    const inst = layout.instances[0];
    if (inst) playRun(layout.notes.filter((n) => n.shapes.includes(ex.shape) && n.f >= inst.lo - 1 && n.f <= inst.hi + 1));
  };
  draw();
}

// -------------------------------------------------------------------- Jam --
function renderJamView() {
  const j = renderJam(view);
  cleanupView = j.cleanup;
}

// --------------------------------------------------------------- Progress --
function renderProgress() {
  const t = S.totals();
  const data = S.allData();
  const frets = Math.min(15, S.settings().frets);
  const shapeScales = ['minPent', 'majPent', 'blues', 'major', 'minor', 'majArp', 'minArp', 'dom7Arp'];
  const cell = (m) => {
    if (m === null || m === undefined) return '<td class="heat none">·</td>';
    const hue = Math.round(m * 120);
    return `<td class="heat" style="background:hsl(${hue} 65% 42%)">${Math.round(m * 100)}</td>`;
  };
  view.innerHTML = `
    <div class="progress-view">
      <div class="hero card"><div class="hero-stats">
        <div><b>${S.streak()}</b><span>day streak</span></div>
        <div><b>${Math.round(t.secs / 60)}</b><span>minutes practised</span></div>
        <div><b>${t.sessions}</b><span>sessions</span></div>
      </div></div>
      <div class="card">
        <h3>Fretboard note knowledge</h3>
        <p class="muted small">Every position from <i>Name the Note</i> and <i>Find the Note</i>. Green = fast and accurate, red = weak, grey = not practised yet. Weak spots come up more often in drills.</p>
        <div class="board-wrap" data-el="heat"></div>
      </div>
      <div class="card">
        <h3>Shape mastery</h3>
        <p class="muted small">From <i>Build the Shape</i> (score 0–100).</p>
        <div class="table-wrap"><table class="mastery">
          <tr><th></th>${T.SHAPE_ORDER.map((s) => `<th class="shape-${s}">${s}</th>`).join('')}</tr>
          ${shapeScales.filter((sc) => T.SHAPE_ORDER.some((s) => S.item('shape-' + sc, s))).map((sc) => `<tr><td class="rowh">${T.SCALES[sc].short}</td>${T.SHAPE_ORDER.map((s) => cell(S.mastery('shape-' + sc, s, 25000))).join('')}</tr>`).join('') || `<tr><td colspan="6" class="muted">No shapes built yet. Try <a href="#train/${slug('shapeBuilder')}">Build the Shape</a>.</td></tr>`}
          <tr><td class="rowh">Locate</td>${T.SHAPE_ORDER.map((s) => cell(S.mastery('locate', s, 3000))).join('')}</tr>
          <tr><td class="rowh">Recognise</td>${T.SHAPE_ORDER.map((s) => cell(S.mastery('nameshape', s, 3000))).join('')}</tr>
        </table></div>
      </div>
      <div class="card">
        <h3>Intervals</h3>
        <div data-el="ints" class="int-bars"></div>
      </div>
      <div class="card">
        <h3>Weakest spots right now</h3>
        <ul data-el="weak" class="weak-list"></ul>
      </div>
      <div class="card">
        <h3>Recent sessions</h3>
        <ul class="result-list">${S.recentSessions().slice(0, 12).map((s) => `<li><span>${s.title}</span><b>${Math.round(s.acc * 100)}%</b><span class="muted">${s.avgMs ? (s.avgMs / 1000).toFixed(1) + 's' : ''} · ${new Date(s.at).toLocaleDateString()}</span></li>`).join('') || '<li class="muted">Nothing yet. Go play!</li>'}</ul>
      </div>
    </div>`;
  const heat = view.querySelector('[data-el=heat]');
  const fb = new Fretboard(heat, { getSettings: () => ({ ...S.settings(), frets }) });
  const notes = [];
  for (let s = 0; s < 6; s++) for (let f = 0; f <= frets; f++) {
    const m = S.mastery('note', `${s}-${f}`, 2000);
    notes.push({ s, f, label: T.noteName(T.pcOf(T.midiAt(s, f))), fill: m === null ? undefined : `hsl(${Math.round(m * 120)} 65% 42%)`, cls: m === null ? 'scale dim small' : 'heatnote' });
  }
  fb.draw({ notes, frets });

  // intervals aggregated over scales
  const agg = {};
  for (const [k, it] of Object.entries(data.items)) {
    if (!k.startsWith('int-')) continue;
    const lab = k.split(':')[1];
    (agg[lab] ||= { n: 0, c: 0 });
    agg[lab].n += it.n; agg[lab].c += it.c;
  }
  const intsEl = view.querySelector('[data-el=ints]');
  const labs = T.INTERVALS.filter((l) => agg[l]);
  intsEl.innerHTML = labs.length ? labs.map((l) => {
    const p = agg[l].c / agg[l].n;
    return `<div class="int-bar"><span>${l}</span><div><i style="width:${p * 100}%;background:hsl(${p * 120} 65% 45%)"></i></div><b>${Math.round(p * 100)}%</b></div>`;
  }).join('') : '<p class="muted">No interval drills yet.</p>';

  // weakest items
  const scored = Object.entries(data.items).filter(([, it]) => it.n >= 2).map(([k, it]) => {
    const [b, key] = k.split(':');
    return { k, m: S.mastery(b, key, b === 'note' || b === 'find' ? 2000 : b.startsWith('shape-') ? 25000 : 3000) };
  }).sort((a, b) => a.m - b.m).slice(0, 8);
  view.querySelector('[data-el=weak]').innerHTML = scored.map((x) => `<li>${esc(describeItem(x.k))} <span class="muted">${Math.round(x.m * 100)}</span></li>`).join('') || '<li class="muted">Practise a bit and your weak spots will show up here.</li>';
}

// ------------------------------------------------------------------ Guide --
function renderGuide() {
  view.innerHTML = `
    <article class="guide">
      <div class="card">
        <h2>1 · The big idea</h2>
        <p>There are only five open-chord shapes: <b>C, A, G, E, D</b>. Any major chord can be played with each of them somewhere on the neck,
        and they always follow each other in that order: <b>C → A → G → E → D → C…</b>, repeating every 12 frets. Below is a <b>C major</b> chord in all five shapes.</p>
        <div class="board-wrap" data-g="big"></div>
        <p>Every scale you solo with (pentatonic, blues, major, modes) lives <i>inside and around</i> these chord shapes. So the chord shape is your map,
        and its <b>root notes</b> are your landmarks.</p>
      </div>
      <div class="card">
        <h2>2 · Each shape and where its roots are</h2>
        <div class="chips" data-g="shapechips"></div>
        <p data-g="shapetext"></p>
        <div class="board-wrap" data-g="shape"></div>
      </div>
      <div class="card">
        <h2>3 · Pentatonics live inside the shapes</h2>
        <p>Each shape holds exactly <b>two pentatonic notes per string</b>. That's the familiar "box". In a <b>minor</b> key the same positions are named after the minor chord shapes:</p>
        <div class="table-wrap"><table class="map">
          <tr><th>Major shape</th>${T.SHAPE_ORDER.map((s) => `<td class="shape-${s}"><b>${s}</b></td>`).join('')}</tr>
          <tr><th>Minor shape (relative minor)</th>${T.SHAPE_ORDER.map((s) => `<td class="shape-${s}">${T.MINOR_NAME[s]}</td>`).join('')}</tr>
          <tr><th>Minor pentatonic "box"</th>${T.SHAPE_ORDER.map((s) => `<td>${{ C: 4, A: 5, G: 1, E: 2, D: 3 }[s]}</td>`).join('')}</tr>
        </table></div>
        <p>So the famous "box 1" A minor pentatonic at the 5th fret <i>is</i> the <b>Em shape</b> of A minor, which is the <b>G shape</b> of C major. One set of five patterns, two sets of names.</p>
        <div class="board-wrap" data-g="pent"></div>
      </div>
      <div class="card">
        <h2>4 · Changing key = sliding the whole map</h2>
        <p>The shapes never change. Only their position does. The fastest way to locate them in a new key:</p>
        <ol>
          <li>Find the key's note on the <b>low E string</b>. That root anchors the <b>E shape</b> (above it) and the <b>G shape</b> (below it).</li>
          <li>Find it on the <b>A string</b>. That anchors the <b>A shape</b> (above) and the <b>C shape</b> (below).</li>
          <li>Find it on the <b>D string</b>. That anchors the <b>D shape</b>.</li>
        </ol>
        <p>That's why knowing the notes on the E, A and D strings cold matters so much. <i>Name the Note</i>, <i>Find the Note</i> and <i>Shape Sprint</i> drill exactly this.</p>
      </div>
      <div class="card">
        <h2>5 · Turning patterns into solos</h2>
        <ol>
          <li><b>Own one position first.</b> Jam in a single shape (Jam → Position) until you stop looking at the screen.</li>
          <li><b>Aim for chord tones.</b> The bright notes in Jam are the current chord's R/3/5. Landing on them on the chord change is what makes a solo sound "right". The 3rd matters most.</li>
          <li><b>Anticipate.</b> Dashed rings show the next chord's tones one beat early, so you can resolve right on the change.</li>
          <li><b>Connect two shapes.</b> Use "Auto-shift" to get pushed into the next shape every few bars. Slide through the shared edge notes.</li>
          <li><b>Follow the chords.</b> Switch the Jam view to "Follow each chord's CAGED shape" to see each chord's own shape near your hand. This is the key to soloing <i>through</i> changes.</li>
          <li><b>Say the notes.</b> Set labels to "Note names" now and then and say each note aloud as you play it. That ties the patterns to the fretboard notes.</li>
        </ol>
      </div>
      <div class="card">
        <h2>6 · A plan that works</h2>
        <ul>
          <li><b>Every day, 12 minutes:</b> the Daily Workout. It rotates through keys (circle of 4ths), introduces shapes in order, then keeps hammering your weakest one.</li>
          <li><b>Weeks 1–2:</b> minor and major pentatonic, two adjacent shapes at a time. Notes on the E and A strings.</li>
          <li><b>Weeks 3–4:</b> all five shapes, Shape Sprint under 3 s, notes on all strings. Start using "Follow chords" in Jam.</li>
          <li><b>Then:</b> major scale & arpeggios per shape, Mixolydian/Dorian over the matching jams, and the 🎤 guitar-listening mode so the knowledge moves into your hands.</li>
        </ul>
        <p class="center"><a class="btn primary" href="#train">Start practising →</a></p>
      </div>
    </article>`;
  const mk = (sel) => new Fretboard(view.querySelector(`[data-g=${sel}]`), { getSettings: () => S.settings() });
  const frets = S.settings().frets;
  // 1: C major triads in all shapes
  const big = T.scaleLayout({ tonicPc: 0, scaleId: 'majArp', shapeId: 'all', maxFret: frets });
  mk('big').draw({
    notes: big.notes.map((n) => ({ s: n.s, f: n.f, label: T.INTERVALS[n.interval], cls: n.interval === 0 ? 'root' : 'scale', fill: n.interval === 0 ? undefined : T.SHAPE_COLORS[n.shapes[0]] })),
    bands: big.instances.map((i) => ({ lo: i.lo, hi: i.hi, color: T.SHAPE_COLORS[i.shapeId], label: i.shapeId })),
    windows: big.instances.map((i) => ({ win: i.win, color: T.SHAPE_COLORS[i.shapeId], opacity: 0.07 })),
  });
  // 2: shape detail
  const shapeFb = mk('shape');
  let cur = 'C';
  const drawShape = () => {
    view.querySelector('[data-g=shapechips]').innerHTML = T.SHAPE_ORDER.map((s) => `<button class="chip ${s === cur ? 'on' : ''}" data-s="${s}" style="--chip:${T.SHAPE_COLORS[s]}">${s} shape</button>`).join('');
    view.querySelectorAll('[data-g=shapechips] [data-s]').forEach((b) => (b.onclick = () => { cur = b.dataset.s; drawShape(); }));
    const l = T.scaleLayout({ tonicPc: 0, scaleId: 'majPent', shapeId: cur, maxFret: frets });
    const inst = l.instances[0];
    view.querySelector('[data-g=shapetext]').innerHTML = `<b>${cur} shape of C</b> (frets ${inst.lo}–${inst.hi}). ${T.ROOT_HINTS[cur]} Big notes = the chord; small = the rest of the major pentatonic.`;
    shapeFb.draw({
      notes: l.notes.filter((n) => n.f >= inst.lo - 1 && n.f <= inst.hi + 1).map((n) => ({ s: n.s, f: n.f, label: T.INTERVALS[n.interval],
        cls: n.interval === 0 ? 'root' : [4, 7].includes(n.interval) ? 'chordtone' : 'scale small' })),
      windows: [{ win: inst.win, color: T.SHAPE_COLORS[cur] }],
      bands: [{ lo: inst.lo, hi: inst.hi, color: T.SHAPE_COLORS[cur], label: cur }],
    });
  };
  drawShape();
  // 3: A minor pent, all positions
  const pent = T.scaleLayout({ tonicPc: 9, scaleId: 'minPent', shapeId: 'all', maxFret: frets });
  mk('pent').draw({
    notes: pent.notes.map((n) => ({ s: n.s, f: n.f, label: T.INTERVALS[n.interval], cls: n.interval === 0 ? 'root' : 'scale', fill: n.interval === 0 ? undefined : n.shapes.length > 1 ? '#cfd6e4' : T.SHAPE_COLORS[n.shapes[0]] })),
    bands: pent.instances.map((i) => ({ lo: i.lo, hi: i.hi, color: T.SHAPE_COLORS[i.shapeId], label: T.MINOR_NAME[i.shapeId] })),
  });
}

// --------------------------------------------------------------- Settings --
function renderSettings() {
  const st = S.settings();
  view.innerHTML = `
    <div class="card settings">
      <h2>Settings</h2>
      <label>Frets shown<select data-s="frets"><option value="12">12</option><option value="15">15</option><option value="17">17</option><option value="22">22</option></select></label>
      <label>Fretboard orientation<select data-s="orientation"><option value="auto">Auto (vertical on phones held upright)</option><option value="h">Always horizontal</option><option value="v">Always vertical</option></select></label>
      <label>Note spelling<select data-s="spelling"><option value="auto">Automatic (by key)</option><option value="sharp">Sharps (C♯)</option><option value="flat">Flats (D♭)</option></select></label>
      <label>Default key<select data-s="focusKey">${[...Array(12).keys()].map((p) => `<option value="${p}">${T.BOTH[p]}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-s="leftHanded"> Left-handed (mirror the neck)</label>
      <label class="check"><input type="checkbox" data-s="sound"> Sounds</label>
    </div>
    <div class="card">
      <h2>Tuner</h2>
      <p class="muted small">Uses the same pitch detection as the 🎤 drills, so it doubles as a mic check.</p>
      <div class="tuner"><div class="tuner-note" data-el="tnote">–</div><div class="tuner-meter"><i data-el="tneedle"></i></div><div class="muted" data-el="tcents"></div></div>
      <div class="actions"><button class="btn" data-a="tuner">Start tuner</button></div>
    </div>
    <div class="card">
      <h2>Your data</h2>
      <p class="muted small">Progress is stored on this device only. Export it to move it to another device.</p>
      <div class="actions">
        <button class="btn" data-a="export">Export progress</button>
        <label class="btn">Import<input type="file" accept="application/json" data-a="import" hidden></label>
        <button class="btn danger" data-a="reset">Reset progress</button>
      </div>
    </div>
    <div class="card">
      <h2>Install as an app</h2>
      <p class="small"><b>Phone:</b> open this site in Safari (iPhone) or Chrome (Android) → Share / menu → <i>Add to Home Screen</i>.<br>
      <b>PC / Mac:</b> in Chrome or Edge click the install icon in the address bar.<br>Once installed it works offline.</p>
      <button class="btn primary" data-a="install" hidden>Install now</button>
    </div>`;
  view.querySelectorAll('[data-s]').forEach((c) => {
    const k = c.dataset.s;
    if (c.type === 'checkbox') c.checked = !!st[k]; else c.value = st[k];
    c.onchange = () => {
      let v = c.type === 'checkbox' ? c.checked : c.value;
      if (k === 'frets' || k === 'focusKey') v = +v;
      S.setSetting(k, v);
    };
  });
  let tuner = null;
  const el = {};
  view.querySelectorAll('[data-el]').forEach((e) => (el[e.dataset.el] = e));
  const tb = view.querySelector('[data-a=tuner]');
  tb.onclick = async () => {
    if (tuner) { tuner.stop(); tuner = null; tb.textContent = 'Start tuner'; return; }
    if (!micSupported()) { el.tcents.textContent = 'Microphone not supported in this browser.'; return; }
    tuner = new PitchListener();
    try {
      await tuner.start((p) => {
        if (!p) return;
        el.tnote.textContent = T.noteName(p.midi) + (Math.floor(p.midi / 12) - 1);
        el.tneedle.style.left = `${50 + p.cents}%`;
        el.tneedle.className = Math.abs(p.cents) < 6 ? 'good' : '';
        el.tcents.textContent = `${p.cents > 0 ? '+' : ''}${p.cents} cents · ${p.freq.toFixed(1)} Hz`;
      });
      tb.textContent = 'Stop tuner';
    } catch { el.tcents.textContent = 'Microphone access was blocked.'; tuner = null; }
  };
  cleanupView = () => tuner && tuner.stop();
  view.querySelector('[data-a=export]').onclick = () => {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `caged-flow-progress-${S.today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  view.querySelector('[data-a=import]').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { S.importJSON(await f.text()); alert('Progress imported.'); route(); } catch (err) { alert('Import failed: ' + err.message); }
  };
  view.querySelector('[data-a=reset]').onclick = () => {
    if (confirm('Erase all progress and stats on this device? Settings are kept.')) { S.resetAll(); alert('Progress reset.'); }
  };
  const ib = view.querySelector('[data-a=install]');
  if (deferredInstall) { ib.hidden = false; ib.onclick = async () => { deferredInstall.prompt(); deferredInstall = null; ib.hidden = true; }; }
}

// ------------------------------------------------------------- PWA bits --
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

route();
