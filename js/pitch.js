// Microphone pitch detection (YIN) so drills can listen to a real guitar.
import { audio } from './audio.js';

export class PitchListener {
  constructor() {
    this.running = false;
    this.onPitch = null; // ({midi, cents, freq, rms}) or null for silence
    this.history = [];
  }

  async start(onPitch) {
    this.onPitch = onPitch;
    const c = audio();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.src = c.createMediaStreamSource(this.stream);
    this.an = c.createAnalyser();
    this.an.fftSize = 2048;
    this.src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.analyse();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    try { this.src && this.src.disconnect(); } catch {}
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  analyse() {
    this.an.getFloatTimeDomainData(this.buf);
    const b = this.buf;
    let rms = 0;
    for (let i = 0; i < b.length; i++) rms += b[i] * b[i];
    rms = Math.sqrt(rms / b.length);
    if (rms < 0.012) {
      this.history = [];
      this.onPitch && this.onPitch(null);
      return;
    }
    const freq = yin(b, audio().sampleRate);
    if (!freq || freq < 70 || freq > 1400) {
      this.onPitch && this.onPitch(null);
      return;
    }
    const m = 69 + 12 * Math.log2(freq / 440);
    const midi = Math.round(m);
    // Require a few consistent frames before reporting a note.
    this.history.push(midi);
    if (this.history.length > 4) this.history.shift();
    const stable = this.history.length >= 3 && this.history.slice(-3).every((x) => x === midi);
    this.onPitch && this.onPitch({ midi, cents: Math.round((m - midi) * 100), freq, rms, stable });
  }
}

function yin(buf, sr) {
  const W = Math.floor(buf.length / 2);
  const maxTau = Math.min(W - 1, Math.floor(sr / 70));
  const minTau = Math.floor(sr / 1400);
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // cumulative mean normalised difference
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    d[tau] = running ? (d[tau] * tau) / running : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < 0.15) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // parabolic interpolation
  const x0 = tau > 1 ? d[tau - 1] : d[tau];
  const x2 = tau < maxTau ? d[tau + 1] : d[tau];
  const denom = 2 * (2 * d[tau] - x2 - x0);
  const better = denom ? tau + (x2 - x0) / denom : tau;
  return sr / better;
}

export const micSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
