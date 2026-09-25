// Renders the crystal mark to PNG icons without any image library:
// polygon scanline fill with 4x4 supersampling, then a hand-rolled PNG encoder.
//   node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#161616');
// Geometry mirrors icon.svg (512 viewBox): four facets, pearl seams, the eye-slit.
const P = (x, y) => [(x - 256) / 256, (y - 256) / 256];
const T = P(256, 75.5), L = P(151.5, 189.5), R = P(360.5, 189.5), M = P(237, 218), BL = P(183.8, 436.5), BR = P(328.2, 436.5);
const FACETS = [
  [[T, L, M], hex('#A17A8F')],
  [[T, M, R], hex('#825A6D')],
  [[L, M, BL], hex('#6A475A')],
  [[M, R, BR, BL], hex('#523542')],
];
// seams as thin quads (stroke width 5 at 512), drawn at 35% over the facets
const seam = (a, b, w = 5 / 256) => { const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, nx = (-dy / n) * w / 2, ny = (dx / n) * w / 2; return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]; };
const SEAMS = [[seam(T, M), [243, 231, 236, 0.35]], [seam(M, BL), [243, 231, 236, 0.35]], [seam(M, R), [243, 231, 236, 0.35]]];
const GLOW = [[P(208.5, 294), P(303.5, 294), P(303.5, 316.8), P(208.5, 316.8)], [243, 231, 236, 0.9]];

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function render(size, scale) {
  const px = new Uint8Array(size * size * 3);
  const cx = size / 2, cy = size / 2, s = size * scale;
  const shapes = [...FACETS, ...SEAMS, GLOW].map(([poly, col]) => [poly.map(([x, y]) => [cx + x * s, cy + y * s]), col]);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
          let col = BG;
          for (const [poly, c] of shapes) if (inside(poly, fx, fy)) { const a = c.length > 3 ? c[3] : 1; col = [col[0] + (c[0] - col[0]) * a, col[1] + (c[1] - col[1]) * a, col[2] + (c[2] - col[2]) * a]; }
          r += col[0]; g += col[1]; b += col[2];
        }
      }
      const i = (y * size + x) * 3;
      px[i] = r / (SS * SS); px[i + 1] = g / (SS * SS); px[i + 2] = b / (SS * SS);
    }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; Buffer.from(px.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const [name, size, scale] of [['icon-180.png', 180, 1], ['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['maskable-512.png', 512, 0.78]]) {
  writeFileSync(join(root, name), png(size, render(size, scale)));
  console.log('wrote', name);
}
