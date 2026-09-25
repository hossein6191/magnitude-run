// The cave. Three parallax layers behind the trace: topographic contour lines
// (far), faceted rock spires (mid) and stalactites (near ceiling).

function mulberry32(a) {
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

function makeRocks(L, gy, rnd) {
  const arr = [];
  let x = 0;
  while (x < L - 200) {
    const w = 60 + rnd() * 140, h = 50 + rnd() * 170;
    const a = [[x, gy + 4], [x + w * 0.18, gy - h * 0.62], [x + w * 0.42, gy - h], [x + w * 0.68, gy - h * 0.55], [x + w, gy + 4]];
    const b = [[x, gy + 4], [x + w * 0.18, gy - h * 0.62], [x + w * 0.42, gy - h], [x + w * 0.42, gy + 4]];
    arr.push({ pts: a, fill: '#221A1F', b: bounds(a) });
    arr.push({ pts: b, fill: '#281E24', b: bounds(b) });
    x += w + rnd() * 120;
  }
  return arr;
}

function makeStalactites(L, rnd) {
  const arr = [];
  let x = 0;
  while (x < L - 120) {
    const w = 18 + rnd() * 44, h = 24 + rnd() * 80;
    const a = [[x, -2], [x + w, -2], [x + w * 0.55, h]];
    const b = [[x, -2], [x + w * 0.55, h], [x + w * 0.3, -2]];
    arr.push({ pts: a, fill: '#241B20', b: bounds(a) });
    arr.push({ pts: b, fill: '#2B2026', b: bounds(b) });
    x += w + rnd() * 140;
  }
  return arr;
}

function drawLoop(ctx, polys, L, off, W) {
  const base = -(off % L);
  for (const k of [base, base + L]) {
    for (const p of polys) {
      if (p.b[1] + k < 0 || p.b[0] + k > W) continue;
      ctx.beginPath();
      ctx.moveTo(p.pts[0][0] + k, p.pts[0][1]);
      for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0] + k, p.pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = p.fill;
      ctx.fill();
    }
  }
}

export class Background {
  constructor() { this.scroll = 0; this.tile = null; this.rocks = []; this.stal = []; this.L = 3600; }
  resize(W, H, groundY) {
    this.W = W; this.H = H; this.groundY = groundY;
    this.tile = makeContourTile(1600, H);
    this.rocks = makeRocks(this.L, groundY, mulberry32(11));
    this.stal = makeStalactites(this.L, mulberry32(23));
  }
  update(dt, speed) { this.scroll += speed * dt; }
  draw(ctx) {
    const { W, H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1B1418');
    g.addColorStop(1, '#161215');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const tw = this.tile.width;
    const ox = -((this.scroll * 0.12) % tw);
    for (let x = ox; x < W; x += tw) ctx.drawImage(this.tile, x, 0);
    drawLoop(ctx, this.rocks, this.L, this.scroll * 0.4, W);
    drawLoop(ctx, this.stal, this.L, this.scroll * 0.6, W);
  }
}
