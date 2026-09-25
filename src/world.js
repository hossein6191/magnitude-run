// The cave, in four biomes that arrive with the zones:
//   0 Bedrock       rock spires and stalactites
//   1 Crystal Vein  translucent crystal clusters grow from the walls
//   2 Glass City    the transparent city of the Watchers, towers and lit windows
//   3 The Enclave   geometric, dark, pearl circuit lines: the secure hardware
// Biomes crossfade over ~1.5 s. All layers are polygon lists on a loop.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeContourTile(w, h, alpha = 0.045, seed = 7) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.strokeStyle = `rgba(243,231,236,${alpha})`;
  g.lineWidth = 1;
  for (let k = 0; k < 9; k++) {
    const cx = w * (0.25 + rnd() * 0.5), cy = h * (0.05 + rnd() * 0.8);
    const rings = 3 + Math.floor(rnd() * 4), base = 9 + rnd() * 10;
    const seeds = [];
    for (let i = 0; i < 12; i++) seeds.push(0.7 + rnd() * 0.6);
    for (let r = 1; r <= rings; r++) {
      g.beginPath();
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const f = (i / N) * 12, i0 = Math.floor(f) % 12, i1 = (i0 + 1) % 12, u = f - Math.floor(f);
        const rad = base * r * (seeds[i0] * (1 - u) + seeds[i1] * u);
        const x = cx + Math.cos(a) * rad * 1.6, y = cy + Math.sin(a) * rad;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.stroke();
    }
  }
  return c;
}

function bounds(pts) {
  let x0 = Infinity, x1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; }
  return [x0, x1];
}
const P = (pts, fill, stroke) => ({ pts, fill, stroke, b: bounds(pts) });

function rocks(L, gy, rnd, fillA = '#221A1F', fillB = '#281E24') {
  const arr = [];
  let x = 0;
  while (x < L - 200) {
    const w = 60 + rnd() * 140, h = 50 + rnd() * 170;
    arr.push(P([[x, gy + 4], [x + w * 0.18, gy - h * 0.62], [x + w * 0.42, gy - h], [x + w * 0.68, gy - h * 0.55], [x + w, gy + 4]], fillA));
    arr.push(P([[x, gy + 4], [x + w * 0.18, gy - h * 0.62], [x + w * 0.42, gy - h], [x + w * 0.42, gy + 4]], fillB));
    x += w + rnd() * 120;
  }
  return arr;
}
function stalactites(L, rnd, density = 1) {
  const arr = [];
  let x = 0;
  while (x < L - 120) {
    const w = 18 + rnd() * 44, h = 24 + rnd() * 80;
    arr.push(P([[x, -2], [x + w, -2], [x + w * 0.55, h]], '#241B20'));
    arr.push(P([[x, -2], [x + w * 0.55, h], [x + w * 0.3, -2]], '#2B2026'));
    x += w + (rnd() * 140) / density + 40;
  }
  return arr;
}
function crystals(L, gy, rnd) {
  const arr = [];
  let x = 40;
  while (x < L - 200) {
    const n = 2 + Math.floor(rnd() * 3), base = x;
    for (let i = 0; i < n; i++) {
      const cx = base + i * 26 + rnd() * 10, h = 40 + rnd() * 110, w = 14 + rnd() * 14, tilt = (rnd() - 0.5) * 30;
      arr.push(P([[cx - w, gy + 6], [cx + w, gy + 6], [cx + w * 0.5 + tilt, gy - h * 0.75], [cx + tilt, gy - h], [cx - w * 0.5 + tilt, gy - h * 0.7]], 'rgba(130,90,109,0.22)', 'rgba(243,231,236,0.18)'));
    }
    if (rnd() < 0.5) { const cx = base + 20, h = 30 + rnd() * 70; arr.push(P([[cx - 12, -2], [cx + 12, -2], [cx + 2, h]], 'rgba(130,90,109,0.2)', 'rgba(243,231,236,0.16)')); }
    x += 160 + rnd() * 260;
  }
  return arr;
}
function towers(L, gy, rnd) {
  const arr = [];
  let x = 0;
  while (x < L - 160) {
    const w = 34 + rnd() * 60, h = 120 + rnd() * 260, top = gy - h;
    arr.push(P([[x, gy + 4], [x + w, gy + 4], [x + w, top], [x, top]], 'rgba(252,252,252,0.035)', 'rgba(252,252,252,0.22)'));
    if (rnd() < 0.6) arr.push(P([[x + w * 0.2, top], [x + w * 0.8, top], [x + w * 0.5, top - 20 - rnd() * 40]], 'rgba(252,252,252,0.03)', 'rgba(252,252,252,0.2)'));
    for (let wy = top + 14; wy < gy - 12; wy += 22) {
      for (let wx = x + 8; wx < x + w - 8; wx += 16) {
        if (rnd() < 0.35) arr.push(P([[wx, wy], [wx + 6, wy], [wx + 6, wy + 8], [wx, wy + 8]], 'rgba(243,231,236,0.16)'));
      }
    }
    x += w + 18 + rnd() * 80;
  }
  return arr;
}
function enclave(L, gy, rnd) {
  const arr = [];
  let x = 0;
  while (x < L - 200) {
    const cx = x + 60, cy = 60 + rnd() * (gy - 140), r = 40 + rnd() * 70;
    const hex = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; hex.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    arr.push(P(hex, 'rgba(243,231,236,0.02)', 'rgba(243,231,236,0.14)'));
    const inner = hex.map(([hx, hy]) => [cx + (hx - cx) * 0.55, cy + (hy - cy) * 0.55]);
    arr.push(P(inner, 'rgba(130,90,109,0.08)', 'rgba(243,231,236,0.1)'));
    // circuit trace to the ground
    const tx = cx + (rnd() - 0.5) * 60;
    arr.push(P([[cx, cy + r], [cx, cy + r + 30], [tx, cy + r + 30], [tx, gy + 4], [tx + 1.5, gy + 4], [tx + 1.5, cy + r + 31.5], [cx + 1.5, cy + r + 31.5], [cx + 1.5, cy + r]], 'rgba(243,231,236,0.12)'));
    x += 140 + rnd() * 220;
  }
  return arr;
}

function drawLoop(ctx, polys, L, off, W, alpha) {
  const base = -(off % L);
  ctx.globalAlpha = alpha;
  for (const k of [base, base + L]) {
    for (const p of polys) {
      if (p.b[1] + k < 0 || p.b[0] + k > W) continue;
      ctx.beginPath();
      ctx.moveTo(p.pts[0][0] + k, p.pts[0][1]);
      for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0] + k, p.pts[i][1]);
      ctx.closePath();
      if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
      if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }
  ctx.globalAlpha = 1;
}

export const BIOMES = [
  { name: 'Bedrock', top: '#1B1418', bottom: '#161215', ground: '#1A1417' },
  { name: 'Crystal Vein', top: '#1E1620', bottom: '#171218', ground: '#1C1519' },
  { name: 'Glass City', top: '#171519', bottom: '#131114', ground: '#171316' },
  { name: 'The Enclave', top: '#121013', bottom: '#0E0C0F', ground: '#121014' },
];
export function biomeForZone(zone) { return Math.min(BIOMES.length - 1, Math.floor(zone / 2)); }

export class Background {
  constructor() { this.scroll = 0; this.tile = null; this.L = 3600; this.layers = []; this.biome = 0; this.prev = -1; this.fade = 1; }
  resize(W, H, groundY) {
    this.W = W; this.H = H; this.groundY = groundY;
    this.tile = makeContourTile(1600, H);
    const gy = groundY, L = this.L;
    this.layers = [
      [{ polys: rocks(L, gy, mulberry32(11)), speed: 0.4 }, { polys: stalactites(L, mulberry32(23)), speed: 0.6 }],
      [{ polys: rocks(L, gy, mulberry32(31), '#241A21', '#2B1F27'), speed: 0.4 }, { polys: crystals(L, gy, mulberry32(37)), speed: 0.55 }, { polys: stalactites(L, mulberry32(41), 0.5), speed: 0.6 }],
      [{ polys: towers(L, gy, mulberry32(53)), speed: 0.35 }, { polys: stalactites(L, mulberry32(59), 0.3), speed: 0.6 }],
      [{ polys: enclave(L, gy, mulberry32(67)), speed: 0.3 }, { polys: rocks(L, gy, mulberry32(71), '#171216', '#1C161A'), speed: 0.45 }],
    ];
  }
  setBiome(i) {
    if (i === this.biome) return;
    this.prev = this.biome; this.biome = i; this.fade = 0;
  }
  update(dt, speed) {
    this.scroll += speed * dt;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / 1.5);
  }
  mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  groundColor() {
    const b = BIOMES[this.biome];
    if (this.fade >= 1 || this.prev < 0) return b.ground;
    return this.mix(BIOMES[this.prev].ground, b.ground, this.fade);
  }
  draw(ctx) {
    const { W, H } = this;
    const b = BIOMES[this.biome], p = this.prev >= 0 && this.fade < 1 ? BIOMES[this.prev] : b;
    const k = p === b ? 1 : this.fade;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, this.mix(p.top, b.top, k));
    g.addColorStop(1, this.mix(p.bottom, b.bottom, k));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const tw = this.tile.width;
    const ox = -((this.scroll * 0.12) % tw);
    for (let x = ox; x < W; x += tw) ctx.drawImage(this.tile, x, 0);
    if (p !== b) for (const layer of this.layers[this.prev]) drawLoop(ctx, layer.polys, this.L, this.scroll * layer.speed, W, 1 - this.fade);
    for (const layer of this.layers[this.biome]) drawLoop(ctx, layer.polys, this.L, this.scroll * layer.speed, W, p === b ? 1 : this.fade);
  }
}
