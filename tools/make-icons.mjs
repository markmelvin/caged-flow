// Generates PNG app icons (no dependencies). Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function render(size, maskable) {
  const px = new Uint8Array(size * size * 4);
  const S = size / 512;
  const set = (x, y, [r, g, b], a = 1) => {
    const i = (y * size + x) * 4;
    px[i] = px[i] * (1 - a) + r * a; px[i + 1] = px[i + 1] * (1 - a) + g * a; px[i + 2] = px[i + 2] * (1 - a) + b * a;
    px[i + 3] = Math.max(px[i + 3], a * 255);
  };
  // supersampled coverage helper
  const cover = (fn, x, y) => { let c = 0; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (fn((x + (i + 0.5) / 4) / S, (y + (j + 0.5) / 4) / S)) c++; return c / 16; };
  const rrect = (x0, y0, w, h, r) => (x, y) => {
    if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
    const cx = Math.min(Math.max(x, x0 + r), x0 + w - r), cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const circ = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const shapes = [
    [maskable ? rrect(0, 0, 512, 512, 0) : rrect(0, 0, 512, 512, 112), '#14161c'],
    [rrect(64, 120, 384, 272, 18), '#3a2618'],
    ...[152, 194, 236, 278, 320, 362].map((y) => [rrect(64, y - 3, 384, 6, 0), '#b8ab93']),
    ...[160, 256, 352].map((x) => [rrect(x - 3.5, 120, 7, 272, 0), '#b8bcc6']),
    [circ(112, 194, 30), '#ef5b5b'], [circ(208, 278, 30), '#f5a623'], [circ(304, 152, 30), '#4cc38a'],
    [circ(304, 320, 30), '#4aa3ff'], [circ(400, 236, 30), '#b07cff'],
  ];
  // maskable: shrink artwork into the safe zone
  const k = maskable ? 0.8 : 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    shapes.forEach(([fn, col], idx) => {
      const f = idx === 0 ? fn : (xx, yy) => fn((xx - 256) / k + 256, (yy - 256) / k + 256);
      const a = cover(f, x, y);
      if (a > 0) set(x, y, hex(col), a);
    });
  }
  return png(size, px);
}

function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1); }
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = new URL('../icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192, false));
writeFileSync(new URL('icon-512.png', out), render(512, false));
writeFileSync(new URL('maskable-512.png', out), render(512, true));
console.log('icons written');
