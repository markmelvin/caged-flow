// SVG fretboard renderer. Horizontal (desktop / landscape) or vertical (phone portrait).
import { STRING_LABELS } from './theory.js';

const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE = [12, 24];

export class Fretboard {
  constructor(el, opts = {}) {
    this.el = el;
    this.opts = opts; // { getSettings: () => settings, onTap(s,f) }
    this.state = { notes: [], windows: [], bands: [] };
    el.classList.add('fretboard');
    el.addEventListener('pointerdown', (e) => {
      const hit = e.target.closest('[data-s]');
      if (!hit || !this.opts.onTap) return;
      e.preventDefault();
      this.opts.onTap(+hit.dataset.s, +hit.dataset.f, e);
    });
    this._ro = new ResizeObserver(() => {
      const o = this.orientation();
      if (o !== this._lastOrientation) this.render();
    });
    this._ro.observe(el);
  }

  settings() {
    return this.opts.getSettings ? this.opts.getSettings() : { frets: 15, orientation: 'auto', leftHanded: false };
  }

  orientation() {
    const st = this.settings();
    if (st.orientation === 'h' || st.orientation === 'v') return st.orientation;
    const w = this.el.clientWidth || window.innerWidth;
    return w < 640 && window.innerHeight > window.innerWidth ? 'v' : 'h';
  }

  // notes: [{s,f,label,cls,fill}], windows: [{win,color}], bands: [{lo,hi,color,label}]
  draw(state) {
    this.state = { notes: [], windows: [], bands: [], ...state };
    this.render();
  }

  render() {
    const st = this.settings();
    const frets = this.state.frets ?? st.frets;
    const o = this.orientation();
    this._lastOrientation = o;
    this.el.dataset.orient = o;
    this.el.innerHTML = o === 'h' ? this.svgH(frets, st.leftHanded) : this.svgV(frets, st.leftHanded);
  }

  // ---- horizontal ------------------------------------------------------
  svgH(frets, lefty) {
    const bandRows = assignRows(this.state.bands);
    const nRows = bandRows.length ? Math.max(...bandRows) + 1 : 0;
    const padL = 26, padR = 12, padT = 10 + nRows * 18, padB = 24;
    const openW = 36, cellW = 54, gap = 31;
    const boardH = gap * 5;
    const W = padL + openW + frets * cellW + padR;
    const H = padT + boardH + padB + 12;
    const X = (x) => (lefty ? W - x : x);
    const xLine = (n) => padL + openW + n * cellW; // n=0 is the nut
    const xNote = (f) => (f === 0 ? padL + openW / 2 : xLine(f - 1) + cellW / 2);
    const yStr = (s) => padT + 6 + (5 - s) * gap;
    const top = padT + 6, bot = top + boardH;
    const p = [];
    p.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Guitar fretboard">`);
    // bands (shape footprints along the top)
    this.state.bands.forEach((b, i) => {
      const x1 = X(b.lo === 0 ? padL + 2 : xLine(b.lo - 1) + 2), x2 = X(xLine(b.hi) - 2);
      const y = 6 + bandRows[i] * 18;
      p.push(`<rect x="${Math.min(x1, x2)}" y="${y}" width="${Math.abs(x2 - x1)}" height="14" rx="7" fill="${b.color}" opacity="${b.dim ? 0.35 : 0.9}"/>`);
      p.push(`<text x="${(x1 + x2) / 2}" y="${y + 10.5}" class="band-label">${b.label}</text>`);
    });
    // wood
    p.push(`<rect x="${X(lefty ? xLine(frets) : xLine(0))}" y="${top - 8}" width="${frets * cellW}" height="${boardH + 16}" rx="3" class="wood"/>`);
    // shape windows
    for (const w of this.state.windows) {
      for (let s = 0; s < 6; s++) {
        if (!w.win[s]) continue;
        const [a, b] = w.win[s];
        const x1 = a === 0 ? padL + 4 : xLine(a - 1) + 2;
        const x2 = xLine(b) - 2;
        const xa = X(x1), xb = X(x2);
        p.push(`<rect x="${Math.min(xa, xb)}" y="${yStr(s) - gap / 2 + 2}" width="${Math.abs(xb - xa)}" height="${gap - 4}" rx="6" fill="${w.color}" opacity="${w.opacity ?? 0.16}"/>`);
      }
    }
    // inlays
    for (let f = 1; f <= frets; f++) {
      const cx = X(xLine(f - 1) + cellW / 2);
      if (INLAYS.includes(f)) p.push(`<circle cx="${cx}" cy="${(top + bot) / 2}" r="5" class="inlay"/>`);
      if (DOUBLE.includes(f)) {
        p.push(`<circle cx="${cx}" cy="${top + gap * 1.5}" r="5" class="inlay"/><circle cx="${cx}" cy="${top + gap * 3.5}" r="5" class="inlay"/>`);
      }
      p.push(`<text x="${cx}" y="${bot + 22}" class="fret-num${INLAYS.includes(f) || DOUBLE.includes(f) ? ' strong' : ''}">${f}</text>`);
    }
    // frets + nut
    for (let n = 0; n <= frets; n++) {
      const x = X(xLine(n));
      p.push(`<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${bot + 8}" class="${n === 0 ? 'nut' : 'fret'}"/>`);
    }
    // strings
    for (let s = 0; s < 6; s++) {
      const y = yStr(s);
      p.push(`<line x1="${X(padL + 4)}" y1="${y}" x2="${X(xLine(frets))}" y2="${y}" class="string" stroke-width="${2.6 - s * 0.32}"/>`);
      p.push(`<text x="${X(padL - 12)}" y="${y + 4}" class="str-label">${STRING_LABELS[s]}</text>`);
    }
    // hit targets
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= frets; f++) {
        const x1 = f === 0 ? padL : xLine(f - 1);
        const w = f === 0 ? openW : cellW;
        const xa = lefty ? W - x1 - w : x1;
        p.push(`<rect class="hit" data-s="${s}" data-f="${f}" x="${xa}" y="${yStr(s) - gap / 2}" width="${w}" height="${gap}"/>`);
      }
    }
    // notes
    const r = 12.5;
    for (const n of this.state.notes) {
      if (n.f > frets) continue;
      p.push(noteSvg(X(xNote(n.f)), yStr(n.s), r, n));
    }
    p.push('</svg>');
    return p.join('');
  }

  // ---- vertical --------------------------------------------------------
  svgV(frets, lefty) {
    const bandRows = assignRows(this.state.bands);
    const nRows = bandRows.length ? Math.max(...bandRows) + 1 : 0;
    const padL = 26, padT = 24, padB = 10, padR = 10 + nRows * 18;
    const openH = 34, cellH = 44, gap = 44;
    const boardW = gap * 5;
    const W = padL + 12 + boardW + 12 + padR;
    const H = padT + openH + frets * cellH + padB;
    const left = padL + 12;
    const X = (x) => (lefty ? W - x : x);
    const yLine = (n) => padT + openH + n * cellH;
    const yNote = (f) => (f === 0 ? padT + openH / 2 : yLine(f - 1) + cellH / 2);
    const xStr = (s) => left + s * gap;
    const p = [];
    p.push(`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Guitar fretboard">`);
    this.state.bands.forEach((b, i) => {
      const y1 = b.lo === 0 ? padT + 2 : yLine(b.lo - 1) + 2, y2 = yLine(b.hi) - 2;
      const x = X(left + boardW + 18 + bandRows[i] * 18) - (lefty ? 14 : 0);
      p.push(`<rect x="${x}" y="${y1}" width="14" height="${y2 - y1}" rx="7" fill="${b.color}" opacity="${b.dim ? 0.35 : 0.9}"/>`);
      const cy = (y1 + y2) / 2;
      p.push(`<text x="${x + 7}" y="${cy + 3.5}" class="band-label" transform="rotate(90 ${x + 7} ${cy})">${b.label}</text>`);
    });
    p.push(`<rect x="${X(lefty ? left + boardW + 10 : left - 10)}" y="${yLine(0)}" width="${boardW + 20}" height="${frets * cellH}" rx="3" class="wood"/>`);
    for (const w of this.state.windows) {
      for (let s = 0; s < 6; s++) {
        if (!w.win[s]) continue;
        const [a, b] = w.win[s];
        const y1 = a === 0 ? padT + 4 : yLine(a - 1) + 2;
        const y2 = yLine(b) - 2;
        const xc = X(xStr(s));
        p.push(`<rect x="${xc - gap / 2 + 3}" y="${y1}" width="${gap - 6}" height="${y2 - y1}" rx="8" fill="${w.color}" opacity="${w.opacity ?? 0.16}"/>`);
      }
    }
    for (let f = 1; f <= frets; f++) {
      const cy = yLine(f - 1) + cellH / 2;
      const midX = (X(xStr(0)) + X(xStr(5))) / 2;
      if (INLAYS.includes(f)) p.push(`<circle cx="${midX}" cy="${cy}" r="5" class="inlay"/>`);
      if (DOUBLE.includes(f)) p.push(`<circle cx="${X(xStr(1) + gap / 2)}" cy="${cy}" r="5" class="inlay"/><circle cx="${X(xStr(3) + gap / 2)}" cy="${cy}" r="5" class="inlay"/>`);
      p.push(`<text x="${lefty ? W - 12 : 12}" y="${cy + 4}" class="fret-num${INLAYS.includes(f) || DOUBLE.includes(f) ? ' strong' : ''}">${f}</text>`);
    }
    for (let n = 0; n <= frets; n++) {
      const y = yLine(n);
      p.push(`<line x1="${X(left - 10)}" y1="${y}" x2="${X(left + boardW + 10)}" y2="${y}" class="${n === 0 ? 'nut' : 'fret'}"/>`);
    }
    for (let s = 0; s < 6; s++) {
      const x = X(xStr(s));
      p.push(`<line x1="${x}" y1="${padT + 4}" x2="${x}" y2="${yLine(frets)}" class="string" stroke-width="${2.6 - s * 0.32}"/>`);
      p.push(`<text x="${x}" y="${14}" class="str-label">${STRING_LABELS[s]}</text>`);
    }
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= frets; f++) {
        const y1 = f === 0 ? padT : yLine(f - 1);
        const h = f === 0 ? openH : cellH;
        p.push(`<rect class="hit" data-s="${s}" data-f="${f}" x="${X(xStr(s)) - gap / 2}" y="${y1}" width="${gap}" height="${h}"/>`);
      }
    }
    const r = 15;
    for (const n of this.state.notes) {
      if (n.f > frets) continue;
      p.push(noteSvg(X(xStr(n.s)), yNote(n.f), r, n));
    }
    p.push('</svg>');
    return p.join('');
  }
}

function noteSvg(cx, cy, r, n) {
  const label = n.label ?? '';
  const fs = label.length >= 3 ? 8.5 : label.length === 2 ? 10.5 : 12;
  const style = n.fill ? ` style="fill:${n.fill}"` : '';
  const stroke = n.stroke ? ` style="stroke:${n.stroke}"` : '';
  const small = n.small || (' ' + (n.cls || '') + ' ').includes(' small ');
  const rr = small ? r * 0.72 : r;
  return `<g class="n ${n.cls || ''}" pointer-events="none"><circle cx="${cx}" cy="${cy}" r="${rr}"${style || stroke}/>` +
    (label ? `<text x="${cx}" y="${cy + fs * 0.36}" font-size="${small ? fs * 0.85 : fs}">${label}</text>` : '') + '</g>';
}

// Greedy row assignment so overlapping bands stack.
function assignRows(bands) {
  const rows = new Array(bands.length);
  const ends = [];
  const order = bands.map((b, i) => i).sort((a, b) => bands[a].lo - bands[b].lo);
  for (const i of order) {
    let r = 0;
    while (ends[r] !== undefined && ends[r] >= bands[i].lo) r++;
    ends[r] = bands[i].hi;
    rows[i] = r;
  }
  return rows;
}
