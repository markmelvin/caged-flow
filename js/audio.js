// Web Audio: plucked-string synth for note feedback + a small backing band.
let ctx = null;
let master = null;
let noiseBuf = null;
const ksCache = new Map();

export function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---- Karplus-Strong pluck --------------------------------------------------
function ksBuffer(midi) {
  if (ksCache.has(midi)) return ksCache.get(midi);
  const c = audio();
  const sr = c.sampleRate;
  const len = Math.floor(sr * 1.8);
  const buf = c.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const period = sr / mtof(midi);
  const N = Math.max(2, Math.floor(period - 0.5));
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const r = Math.random() * 2 - 1;
    prev = prev * 0.45 + r * 0.55; // soften the attack
    d[i] = prev;
  }
  const decay = midi > 70 ? 0.994 : 0.997;
  for (let i = N; i < len; i++) d[i] = decay * 0.5 * (d[i - N] + (i - N - 1 >= 0 ? d[i - N - 1] : 0));
  // Loop length is N + 0.5 samples; correct the residual with playbackRate.
  const entry = { buf, rate: mtof(midi) / (sr / (N + 0.5)) };
  ksCache.set(midi, entry);
  return entry;
}

export function pluck(midi, when = 0, vel = 0.7) {
  const c = audio();
  const src = c.createBufferSource();
  const ks = ksBuffer(midi);
  src.buffer = ks.buf;
  src.playbackRate.value = ks.rate;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3800;
  const g = c.createGain();
  const t = when || c.currentTime;
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
  src.connect(lp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 1.8);
}

export function blip(ok) {
  const c = audio();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(ok ? 880 : 220, t);
  if (ok) o.frequency.setValueAtTime(1320, t + 0.07);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.18 : 0.3));
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.35);
}

// ---- Drum & instrument voices -----------------------------------------------
function noise() {
  const c = audio();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function kick(t, out) {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(1.0, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.4);
}

function snare(t, out, vel = 0.5) {
  const c = audio();
  const n = c.createBufferSource();
  n.buffer = noise();
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const g = c.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  n.connect(hp).connect(g).connect(out);
  n.start(t);
  n.stop(t + 0.2);
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(190, t);
  og.gain.setValueAtTime(vel * 0.7, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.12);
}

function hat(t, out, vel = 0.18, open = false) {
  const c = audio();
  const n = c.createBufferSource();
  n.buffer = noise();
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7500;
  const g = c.createGain();
  const len = open ? 0.25 : 0.045;
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(hp).connect(g).connect(out);
  n.start(t, Math.random() * 0.5);
  n.stop(t + len + 0.02);
}

function bass(midi, t, dur, out) {
  const c = audio();
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = mtof(midi);
  const o2 = c.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = mtof(midi);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(280, t + Math.min(dur, 0.25));
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.45, t + 0.008);
  g.gain.setTargetAtTime(0.25, t + 0.02, 0.15);
  g.gain.setTargetAtTime(0.0001, t + dur * 0.92, 0.03);
  o.connect(lp);
  o2.connect(lp);
  lp.connect(g).connect(out);
  o.start(t); o2.start(t);
  o.stop(t + dur + 0.2); o2.stop(t + dur + 0.2);
}

function keys(midis, t, dur, out, vel = 0.11) {
  const c = audio();
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.012);
  g.gain.setTargetAtTime(vel * 0.45, t + 0.05, 0.4);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.06);
  lp.connect(g).connect(out);
  midis.forEach((m, i) => {
    const st = t + i * 0.012; // tiny strum
    for (const [type, mult, lvl] of [['triangle', 1, 1], ['sine', 2, 0.35], ['sawtooth', 1, 0.08]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = mtof(m) * mult;
      o.detune.value = (Math.random() - 0.5) * 8;
      const og = c.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(lp);
      o.start(st);
      o.stop(t + dur + 0.5);
    }
  });
}

// ---- Backing track scheduler ------------------------------------------------
// chords: [{rootPc, ints, bars}] ; callbacks fire in sync with audio.
export class BackingTrack {
  constructor({ bpm = 100, style = 'rock', chords, onBeat, drums = true, volume = 0.8 }) {
    Object.assign(this, { bpm, style, chords, onBeat, drums, volume });
    this.timer = null;
    this.running = false;
  }

  start() {
    const c = audio();
    this.out = c.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(master);
    this.beats = [];
    for (const ch of this.chords) for (let i = 0; i < ch.bars * 4; i++) this.beats.push(ch);
    this.step = -4; // one bar count-in
    this.nextTime = c.currentTime + 0.12;
    this.running = true;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    if (this.out) {
      const c = audio();
      this.out.gain.setTargetAtTime(0, c.currentTime, 0.03);
      const o = this.out;
      setTimeout(() => o.disconnect(), 400);
    }
    for (const id of this._uiTimers || []) clearTimeout(id);
    this._uiTimers = [];
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.value = v;
  }

  tick() {
    const c = audio();
    const spb = 60 / this.bpm;
    while (this.nextTime < c.currentTime + 0.15) {
      this.scheduleBeat(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step++;
    }
  }

  scheduleBeat(step, t, spb) {
    const out = this.out;
    const ui = (fn, at) => {
      const id = setTimeout(fn, Math.max(0, (at - audio().currentTime) * 1000));
      (this._uiTimers ||= []).push(id);
      if (this._uiTimers.length > 64) this._uiTimers.splice(0, 32);
    };
    if (step < 0) { // count-in clicks
      hat(t, out, step === -4 ? 0.35 : 0.22, false);
      ui(() => this.onBeat && this.onBeat({ countIn: 4 + step + 1 }), t);
      return;
    }
    const total = this.beats.length;
    const idx = step % total;
    const beatInBar = idx % 4;
    const ch = this.beats[idx];
    const isChordStart = idx === 0 || this.beats[idx - 1] !== ch;
    const barIdx = Math.floor(step / 4);
    const swing = this.style === 'shuffle' ? 2 / 3 : 0.5;
    const off = t + spb * swing; // the "and"
    const bassRoot = 33 + ((ch.rootPc - 9 + 12) % 12); // A1..G#2
    const third = ch.ints.includes(4) ? 4 : 3;
    const voicing = voice(ch);

    if (this.drums) {
      if (this.style === 'ballad') {
        if (beatInBar === 0) kick(t, out);
        if (beatInBar === 2) snare(t, out, 0.4);
        if (beatInBar === 3) kick(off, out);
        hat(t, out, 0.14);
        hat(off, out, 0.07);
      } else {
        if (beatInBar === 0 || beatInBar === 2) kick(t, out);
        if (this.style === 'rock' && beatInBar === 2) kick(off, out);
        if (beatInBar === 1 || beatInBar === 3) snare(t, out, 0.5);
        hat(t, out, 0.17);
        hat(off, out, this.style === 'shuffle' ? 0.12 : 0.1, beatInBar === 3 && barIdx % 4 === 3);
      }
    }

    if (this.style === 'shuffle') {
      const minor = third === 3;
      const walk = minor ? [0, 3, 7, 9, 10, 9, 7, 3] : [0, 4, 7, 9, 10, 9, 7, 4];
      const n = walk[(barIdx % 2) * 4 + beatInBar];
      bass(bassRoot + n, t, spb * swing * 0.95, out);
      bass(bassRoot + n, off, spb * (1 - swing) * 0.9, out);
      if (beatInBar === 1 || beatInBar === 3) keys(voicing, off, spb * 0.3, out, 0.12);
      if (beatInBar === 0 && isChordStart) keys(voicing, t, spb * 0.5, out, 0.1);
    } else if (this.style === 'ballad') {
      const pat = [0, 7, 12, 7];
      bass(bassRoot + pat[beatInBar], t, spb * 0.95, out);
      if (beatInBar === 0) keys(voicing, t, spb * 3.9, out, 0.1);
      if (beatInBar === 2) keys([voicing[voicing.length - 1] + 12], off, spb, out, 0.05);
    } else {
      bass(bassRoot, t, spb * 0.45, out);
      bass(bassRoot + (beatInBar === 3 ? 7 : 0), off, spb * 0.45, out);
      if (beatInBar === 0) keys(voicing, t, spb * 1.8, out, 0.1);
      if (beatInBar === 2) keys(voicing, t, spb * 0.9, out, 0.08);
      if (beatInBar === 3) keys(voicing, off, spb * 0.4, out, 0.06);
    }

    ui(() => this.onBeat && this.onBeat({ idx, beatInBar, chord: ch, isChordStart, barIdx, step }), t);
  }
}

function voice(ch) {
  const root = 52 + ((ch.rootPc - 4 + 12) % 12); // E3..D#4
  return ch.ints.map((i) => root + i);
}
