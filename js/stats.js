// Persistent progress + adaptive weighting (weak / slow / unseen items come up more).
const KEY = 'cagedflow.v1';

const DEFAULT = {
  settings: {
    frets: 15, orientation: 'auto', leftHanded: false, sound: true, spelling: 'auto',
    focusKey: 9, // A
  },
  items: {},      // "bucket:key" -> { n, c, t, last, recent: [0/1...] }
  days: {},       // "YYYY-MM-DD" -> { secs, sessions, workout }
  sessions: [],   // recent session summaries
};

let data = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) return { ...DEFAULT, ...raw, settings: { ...DEFAULT.settings, ...raw.settings } };
  } catch {}
  return structuredClone(DEFAULT);
}
let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  }, 150);
}

export const settings = () => data.settings;
export function setSetting(k, v) { data.settings[k] = v; save(); }

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function record(bucket, key, correct, ms) {
  const k = bucket + ':' + key;
  const it = data.items[k] || (data.items[k] = { n: 0, c: 0, t: 0, recent: [] });
  it.n++;
  if (correct) it.c++;
  if (correct && ms) it.t = it.t ? it.t * 0.7 + ms * 0.3 : ms;
  it.recent.push(correct ? 1 : 0);
  if (it.recent.length > 10) it.recent.shift();
  it.last = Date.now();
  save();
}

export function item(bucket, key) {
  return data.items[bucket + ':' + key];
}

// 0..1 mastery: recent accuracy blended with speed against a target time.
export function mastery(bucket, key, targetMs = 2000) {
  const it = item(bucket, key);
  if (!it || !it.n) return null;
  const acc = it.recent.reduce((a, b) => a + b, 0) / it.recent.length;
  const speed = it.t ? Math.max(0, Math.min(1, (targetMs * 2.5 - it.t) / (targetMs * 1.5))) : 0;
  const confidence = Math.min(1, it.n / 5);
  return (acc * 0.65 + speed * 0.35) * confidence;
}

export function weight(bucket, key, targetMs = 2000) {
  const m = mastery(bucket, key, targetMs);
  if (m === null) return 3; // unseen: introduce
  return 0.4 + (1 - m) * 4;
}

export function weightedPick(list, keyFn, bucket, targetMs, avoid) {
  const ws = list.map((x) => {
    const k = keyFn(x);
    return k === avoid ? 0.0001 : weight(bucket, k, targetMs);
  });
  const total = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= ws[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

export function addPractice(secs) {
  const d = (data.days[today()] ||= { secs: 0, sessions: 0 });
  d.secs += secs;
  save();
}

export function logSession(s) {
  data.sessions.unshift({ ...s, at: Date.now() });
  data.sessions = data.sessions.slice(0, 60);
  const d = (data.days[today()] ||= { secs: 0, sessions: 0 });
  d.sessions++;
  save();
}

export function markWorkout() {
  const d = (data.days[today()] ||= { secs: 0, sessions: 0 });
  d.workout = true;
  save();
}

export function streak() {
  let n = 0;
  const d = new Date();
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  // today counts if practiced; otherwise start from yesterday
  if (!data.days[fmt(d)]) d.setDate(d.getDate() - 1);
  while (data.days[fmt(d)] && (data.days[fmt(d)].secs > 30 || data.days[fmt(d)].sessions)) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export const allData = () => data;
export function totals() {
  const days = Object.values(data.days);
  return {
    secs: days.reduce((a, d) => a + (d.secs || 0), 0),
    sessions: days.reduce((a, d) => a + (d.sessions || 0), 0),
    todaySecs: data.days[today()]?.secs || 0,
    workoutToday: !!data.days[today()]?.workout,
  };
}
export function recentSessions() { return data.sessions; }

export function exportJSON() { return JSON.stringify(data, null, 1); }
export function importJSON(txt) {
  const obj = JSON.parse(txt);
  if (!obj || typeof obj !== 'object' || !obj.items) throw new Error('Not a CAGED Flow backup');
  data = { ...DEFAULT, ...obj, settings: { ...DEFAULT.settings, ...obj.settings } };
  save();
}
export function resetAll() {
  const s = data.settings;
  data = structuredClone(DEFAULT);
  data.settings = s;
  save();
}
