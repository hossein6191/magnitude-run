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
const T = [0, -1], L = [-0.55, -0.4], R = [0.55, -0.4], BL = [-0.38, 0.9], BR = [0.38, 0.9], M = [-0.1, -0.25];
const FACETS = [
  [[T, L, M], hex('#A17A8F')],
  [[T, M, R], hex('#825A6D')],
  [[L, M, BL], hex('#6A475A')],
  [[M, R, BR, BL], hex('#523542')],
];
const GLOW = [[[-0.25, 0.15], [0.25, 0.15], [0.25, 0.27], [-0.25, 0.27]], hex('#F3E7EC')];

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
  const cx = size / 2, cy = size / 2 - size * 0.02, s = size * scale;
  const shapes = [...FACETS, GLOW].map(([poly, col]) => [poly.map(([x, y]) => [cx + x * s, cy + y * s]), col]);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
          let col = BG;
          for (const [poly, c] of shapes) if (inside(poly, fx, fy)) col = c;
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

for (const [name, size, scale] of [['icon-180.png', 180, 0.36], ['icon-192.png', 192, 0.36], ['icon-512.png', 512, 0.36], ['maskable-512.png', 512, 0.28]]) {
  writeFileSync(join(root, name), png(size, render(size, scale)));
  console.log('wrote', name);
}
