// World v3 — the financial city Rocky runs through. Drop-in for the old cave
// world (same exports), plus three optional hooks game.js calls:
//   bg.info = { m }      live magnitude, shown on tickers and billboards
//   bg.quake = 0..1      aftershock strength: buildings sway, windows flicker, dust falls
//   bg.pulse(x)          a stomp at screen x sends a wave of light through the windows
//   bg.drawFront(ctx, gaps)  street detail in the ground band (gaps stay clear)
// Biomes: Bank District, The Exchange, Glass City, The Enclave.

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

function makeGrain(n = 160) {
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 60;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function makeHalo(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},0.9)`);
  gr.addColorStop(0.35, `rgba(${rgb},0.3)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}

const MARK = [
  [[[-0.045, -0.941], [-0.559, 0], [-0.05, -0.65]], '#93667B'],
  [[[0, -1], [0.509, -0.768], [0.45, -0.032], [-0.027, -0.655]], '#A07A8C'],
  [[[0.532, -0.627], [0.677, 0.227], [0.473, -0.023]], '#BA99A8'],
  [[[-0.05, -0.609], [0.432, -0.009], [-0.205, 0.955], [-0.673, 0.214]], '#8F5E74'],
  [[[0.445, 0.027], [0.677, 0.286], [0.418, 1], [-0.182, 1]], '#A68192'],
];

function bounds(pts) {
  let x0 = Infinity, x1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; }
  return [x0, x1];
}
const P = (pts, fill, stroke, lw = 1) => ({ pts, fill, stroke, lw, b: bounds(pts) });
const RECT = (x, y, w, h, fill, stroke) => P([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, stroke);
const WIN = (x, y, w, h, fill) => ({ ...RECT(x, y, w, h, fill), win: 1 });
const LINE = (pts, stroke, lw = 1) => ({ pts, stroke, lw, open: true, b: bounds(pts) });
const HALO = (x, y, r, a, warm) => ({ halo: [x, y, r, a], warm, b: [x - r, x + r] });
const WARM = (a) => `rgba(226,178,128,${a})`;
const PEARL = (a) => `rgba(243,231,236,${a})`;

function windows(arr, x0, x1, y0, y1, cw, ch, gx, gy, pWarm, pCool, warmA = 0.55, rnd) {
  for (let y = y0; y + ch < y1; y += ch + gy) {
    for (let x = x0; x + cw < x1; x += cw + gx) {
      const q = rnd();
      if (q < pWarm) arr.push(WIN(x, y, cw, ch, WARM(warmA * (0.6 + rnd() * 0.4))));
      else if (q < pWarm + pCool) arr.push(WIN(x, y, cw, ch, PEARL(0.12 + rnd() * 0.1)));
      else if (q < pWarm + pCool + 0.2) arr.push(WIN(x, y, cw, ch, 'rgba(10,7,9,0.25)'));
    }
  }
}

// far skyline: domes, clock towers, needles
function skyline(L, gy, rnd, col, side, winA) {
  const arr = [];
  let x = 0;
  while (x < L - 90) {
    const w = 30 + rnd() * 66, h = 80 + rnd() * 200, top = gy - h;
    arr.push(RECT(x, top, w, h + 4, col));
    arr.push(RECT(x + w * 0.72, top, w * 0.28, h + 4, side));
    const r = rnd(), cx = x + w / 2;
    if (r < 0.14) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; pts.push([cx + Math.cos(a) * w * 0.38, top + Math.sin(a) * w * 0.38]); }
      arr.push(P(pts, col));
      arr.push(RECT(cx - 1.5, top - w * 0.38 - 16, 3, 16, col));
    } else if (r < 0.26) {
      arr.push(RECT(x + w * 0.25, top - 46, w * 0.5, 46, col));
      arr.push(P([[x + w * 0.2, top - 46], [x + w * 0.8, top - 46], [cx, top - 76]], col));
      arr.push(HALO(cx, top - 26, 16, 0.5, true));
      arr.push({ clock: [cx, top - 26, Math.min(8, w * 0.18)], b: [cx - 8, cx + 8] });
    } else if (r < 0.36) {
      arr.push(P([[x + w * 0.2, top], [x + w * 0.8, top], [cx, top - 60 - rnd() * 50]], col));
    }
    windows(arr, x + 5, x + w * 0.7, top + 10, gy - 8, 2.5, 3.5, 4.5, 5.5, 0.06, 0.04, winA, rnd);
    x += w + rnd() * 8;
  }
  return arr;
}

// brick and stone blocks with cornices, water towers and fire escapes
function blocks(L, gy, rnd) {
  const arr = [];
  let x = 0;
  while (x < L - 160) {
    const w = 70 + rnd() * 90, h = 120 + rnd() * 170, top = gy - h;
    arr.push(RECT(x, top, w, h + 4, '#2B1E26'));
    arr.push(RECT(x + w * 0.8, top, w * 0.2, h + 4, '#231820'));
    arr.push(RECT(x - 3, top - 5, w + 6, 6, '#35262F', PEARL(0.08)));
    for (let y = top + 40; y < gy - 20; y += 44) arr.push(LINE([[x, y], [x + w * 0.8, y]], 'rgba(10,7,9,0.35)', 2));
    windows(arr, x + 8, x + w * 0.78, top + 14, gy - 16, 7, 10, 6, 9, 0.16, 0.06, 0.5, rnd);
    if (rnd() < 0.45) {
      const tx = x + w * (0.2 + rnd() * 0.4), tw = 18;
      arr.push(LINE([[tx + 2, top], [tx + 4, top - 14]], '#35262F', 2));
      arr.push(LINE([[tx + tw - 2, top], [tx + tw - 4, top - 14]], '#35262F', 2));
      arr.push(RECT(tx, top - 34, tw, 20, '#35262F', PEARL(0.08)));
      arr.push(P([[tx - 2, top - 34], [tx + tw + 2, top - 34], [tx + tw / 2, top - 44]], '#35262F'));
    }
    if (rnd() < 0.5) {
      const fx = x + w * 0.1, pts = [];
      for (let y = top + 30, i = 0; y < gy - 30; y += 22, i++) pts.push([fx + (i % 2 ? 26 : 0), y]);
      arr.push(LINE(pts, 'rgba(10,7,9,0.5)', 1.5));
    }
    x += w + 8 + rnd() * 50;
  }
  return arr;
}

// neoclassical banks: steps, columns, entablature with a name, pediment with the Seismic mark
const BANK_NAMES = ['BANK', 'TRUST & CO', 'RESERVE', 'SAVINGS', 'CUSTODY', 'SETTLEMENT', 'LEDGER'];
function bank(arr, x, w, h, gy, rnd, name, cols = 6) {
  const stone = '#3A2A33', light = '#46333E', dark = '#261B21';
  const stepH = 5;
  for (let i = 0; i < 3; i++) arr.push(RECT(x - 12 + i * 5, gy - stepH * (i + 1), w + 24 - i * 10, stepH + 1, i % 2 ? light : stone, PEARL(0.06)));
  const baseY = gy - stepH * 3, colH = h * 0.55, colTop = baseY - colH;
  arr.push(RECT(x, colTop, w, colH, dark));
  const doorW = w * 0.16, doorX = x + w / 2 - doorW / 2;
  arr.push(WIN(doorX, baseY - colH * 0.62, doorW, colH * 0.62, WARM(0.35)));
  arr.push(HALO(x + w / 2, baseY - colH * 0.3, colH * 0.6, 0.35, true));
  const cw = w * 0.075, gap = (w - cw * cols) / (cols - 1);
  for (let i = 0; i < cols; i++) {
    const cx = x + i * (cw + gap);
    arr.push(RECT(cx - 2, baseY - 4, cw + 4, 4, light));
    arr.push(RECT(cx, colTop + 5, cw, colH - 9, stone));
    arr.push(LINE([[cx + cw * 0.35, colTop + 6], [cx + cw * 0.35, baseY - 5]], 'rgba(10,7,9,0.35)'));
    arr.push(LINE([[cx + cw * 0.7, colTop + 6], [cx + cw * 0.7, baseY - 5]], 'rgba(10,7,9,0.35)'));
    arr.push(LINE([[cx + 1, colTop + 6], [cx + 1, baseY - 5]], PEARL(0.12)));
    arr.push(RECT(cx - 3, colTop, cw + 6, 5, light));
  }
  const eTop = colTop - 24;
  arr.push(RECT(x - 8, eTop, w + 16, 24, stone, PEARL(0.1)));
  arr.push(RECT(x - 8, eTop + 18, w + 16, 3, dark));
  arr.push({ text: name, x: x + w / 2, y: eTop + 13, size: 11, color: PEARL(0.72), b: [x, x + w] });
  const pH = Math.min(46, w * 0.2);
  arr.push(P([[x - 12, eTop], [x + w + 12, eTop], [x + w / 2, eTop - pH]], light, PEARL(0.12)));
  arr.push(P([[x + 6, eTop - 3], [x + w - 6, eTop - 3], [x + w / 2, eTop - pH + 7]], dark));
  arr.push({ mark: [x + w / 2, eTop - pH * 0.36, pH * 0.26], b: [x + w / 2 - 10, x + w / 2 + 10] });
}
function bankStreet(L, gy, rnd) {
  const arr = [];
  let x = 60, i = 0;
  while (x < L - 360) {
    const w = 200 + rnd() * 110, h = 150 + rnd() * 50;
    bank(arr, x, w, h, gy, rnd, BANK_NAMES[i++ % BANK_NAMES.length], 5 + Math.floor(rnd() * 3));
    x += w + 40;
    lamp(arr, x - 12, gy);
    x += 160 + rnd() * 320;
    lamp(arr, x - 60, gy);
  }
  return arr;
}
function lamp(arr, x, gy) {
  arr.push(RECT(x - 1.5, gy - 92, 3, 92, '#2E2229'));
  arr.push(LINE([[x, gy - 92], [x + 14, gy - 98]], '#2E2229', 2.5));
  arr.push(HALO(x + 16, gy - 94, 34, 0.55, true));
  arr.push(RECT(x + 11, gy - 97, 10, 4, WARM(0.9)));
}

// The Exchange: towers wrapped in LED tickers, chart billboards, the exchange hall
function exchangeTowers(L, gy, rnd) {
  const arr = [];
  let x = 0;
  while (x < L - 200) {
    const w = 90 + rnd() * 90, h = 190 + rnd() * 160, top = gy - h;
    arr.push(RECT(x, top, w, h + 4, '#281C23'));
    arr.push(RECT(x + w * 0.78, top, w * 0.22, h + 4, '#20161C'));
    windows(arr, x + 6, x + w * 0.76, top + 10, gy - 10, 4, 6, 4, 6, 0.08, 0.14, 0.45, rnd);
    const ty = top + 30 + rnd() * (h * 0.4);
    if (rnd() < 0.6) arr.push({ ticker: [x - 2, ty, w + 4, 16, rnd() * 400], b: [x - 2, x + w + 2] });
    if (rnd() < 0.5) arr.push(RECT(x + w * 0.45, top - 30, 2, 30, '#281C23'), HALO(x + w * 0.45 + 1, top - 30, 8, 0.9));
    x += w + 30 + rnd() * 90;
  }
  return arr;
}
function exchangeStreet(L, gy, rnd) {
  const arr = [];
  let x = 40;
  while (x < L - 420) {
    if (rnd() < 0.5) {
      const w = 300 + rnd() * 60;
      bank(arr, x, w, 190, gy, rnd, 'SEISMIC EXCHANGE', 8);
      x += w + 80;
    } else {
      const w = 150 + rnd() * 50, h = 90, y = gy - 150 - rnd() * 40;
      arr.push(RECT(x + w / 2 - 3, y + h, 6, gy - y - h, '#2E2229'));
      arr.push({ chart: [x, y, w, h, rnd() * 100], b: [x, x + w] });
      x += w + 60;
    }
    lamp(arr, x - 30, gy);
    x += 100 + rnd() * 240;
  }
  return arr;
}

// Glass City: the Watchers' glass towers, searchlights and rooftop eyes
function glassTowers(L, gy, rnd) {
  const arr = [];
  let x = 0;
  while (x < L - 160) {
    const w = 40 + rnd() * 60, h = 140 + rnd() * 240, top = gy - h, sk = 10 + rnd() * 14;
    arr.push(P([[x, gy + 4], [x + w, gy + 4], [x + w, top + sk], [x + w * 0.4, top], [x, top + sk * 0.4]], 'rgba(82,53,66,0.4)', 'rgba(252,252,252,0.26)'));
    arr.push(P([[x + w * 0.62, gy + 4], [x + w, gy + 4], [x + w, top + sk], [x + w * 0.62, top + sk * 0.6]], 'rgba(22,16,20,0.35)'));
    const s0 = x + w * (0.12 + rnd() * 0.2);
    arr.push(RECT(s0, top + sk * 0.5, 7, h, 'rgba(252,252,252,0.05)'));
    for (let wy = top + 22; wy < gy - 14; wy += 18) {
      for (let wx = x + 7; wx < x + w * 0.58 - 6; wx += 12) {
        const q = rnd();
        if (q < 0.22) arr.push(WIN(wx, wy, 6, 8, PEARL(0.18)));
        else if (q < 0.27) arr.push(WIN(wx, wy, 6, 8, WARM(0.35)));
      }
    }
    arr.push(LINE([[x + w * 0.62, top + sk * 0.6], [x + w * 0.62, gy + 4]], 'rgba(252,252,252,0.14)'));
    const r = rnd();
    if (r < 0.3) arr.push({ beam: [x + w * 0.4, top, rnd() * 6], b: [x - 300, x + w + 300] });
    else if (r < 0.55) arr.push({ eye: [x + w * 0.4, top - 9, 7], b: [x, x + w] });
    x += w + 24 + rnd() * 90;
  }
  return arr;
}

// The Enclave: the vault. Hex grid, a turning vault door, circuit pulses, monoliths
function hexGrid(L, gy, rnd) {
  const arr = [], r = 26, dx = r * Math.sqrt(3), dy = r * 1.5;
  for (let row = 0; row * dy < gy - 30; row++) {
    for (let col = 0; col * dx < L - dx; col++) {
      if (rnd() > 0.3) continue;
      const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy + 20, hex = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; hex.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      arr.push(P(hex, `rgba(130,90,109,${rnd() < 0.15 ? 0.07 : 0.015})`, PEARL(0.07)));
    }
  }
  for (let x = 400; x < L - 400; x += 1200 + rnd() * 400) arr.push({ vault: [x, gy - 190, 120], b: [x - 130, x + 130] });
  return arr;
}
function monoliths(L, gy, rnd) {
  const arr = [];
  let x = 0;
  while (x < L - 200) {
    const w = 30 + rnd() * 50, h = 90 + rnd() * 200, top = gy - h;
    arr.push(P([[x, gy + 4], [x, top + 10], [x + 10, top], [x + w, top], [x + w, gy + 4]], '#141015', PEARL(0.14)));
    arr.push(RECT(x + w * 0.66, top, w * 0.34, h + 4, '#0E0B0E'));
    const sy = top + 20 + rnd() * (h * 0.4);
    arr.push(WIN(x + w * 0.3, sy, 2, 34, PEARL(0.4)));
    x += w + 80 + rnd() * 200;
  }
  return arr;
}
function circuits(L, gy, rnd) {
  const traces = [];
  let x = 20;
  while (x < L - 200) {
    const y0 = 60 + rnd() * (gy - 180), pts = [[x, y0]];
    let cx = x, cy = y0;
    while (cy < gy) {
      if (rnd() < 0.5) { cx += 30 + rnd() * 70; pts.push([cx, cy]); }
      cy = Math.min(gy + 4, cy + 30 + rnd() * 60); pts.push([cx, cy]);
    }
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    traces.push({ pts, len, off: rnd() * 400, spd: 60 + rnd() * 70, b: bounds(pts) });
    x += 90 + rnd() * 180;
  }
  return traces;
}

export const BIOMES = [
  { name: 'Bank District', top: '#4A3040', mid: '#2C1F27', bottom: '#171215', ground: '#1A1417', band: '193,150,170', haze: '130,90,109' },
  { name: 'The Exchange',  top: '#3A2533', mid: '#241820', bottom: '#151013', ground: '#191316', band: '161,122,143', haze: '130,90,109' },
  { name: 'Glass City',    top: '#56384A', mid: '#33232C', bottom: '#181316', ground: '#181316', band: '193,150,170', haze: '130,90,109' },
  { name: 'The Enclave',   top: '#1A1519', mid: '#120F12', bottom: '#0B090B', ground: '#121014', band: '82,53,66', haze: '61,39,49' },
];
export function biomeForZone(zone) { return Math.min(BIOMES.length - 1, Math.floor(zone / 2)); }

export class Background {
  constructor() {
    this.scroll = 0; this.t = 0; this.tile = null; this.L = 3600; this.layers = []; this.biome = 0; this.prev = -1; this.fade = 1;
    this.grainFrame = 0; this.info = { m: 1 }; this.quake = 0; this.pulses = []; this.debris = [];
  }
  resize(W, H, groundY) {
    this.W = W; this.H = H; this.groundY = groundY;
    this.tile = makeContourTile(1600, H, 0.03);
    this.grain = this.grain || makeGrain();
    this.haloCool = this.haloCool || makeHalo('210,160,185');
    this.haloWarm = this.haloWarm || makeHalo('235,180,120');
    this.grainPat = null;
    const gy = groundY, L = this.L, m = mulberry32;
    this.layers = [
      [
        { polys: skyline(L, gy - 50, m(3), '#3E2A36', '#36242F', 0.5), speed: 0.06 },
        { polys: blocks(L, gy, m(5)), speed: 0.18 },
        { polys: bankStreet(L, gy, m(11)), speed: 0.36 },
      ],
      [
        { polys: skyline(L, gy - 40, m(7), '#33222D', '#2C1D27', 0.45), speed: 0.06 },
        { polys: exchangeTowers(L, gy, m(13)), speed: 0.2 },
        { polys: exchangeStreet(L, gy, m(17)), speed: 0.38 },
      ],
      [
        { polys: skyline(L, gy - 40, m(43), '#3E2A36', '#36242F', 0.55), speed: 0.06 },
        { polys: skyline(L, gy, m(47), '#2A1C24', '#22171E', 0.8), speed: 0.16 },
        { polys: glassTowers(L, gy, m(53)), speed: 0.36 },
      ],
      [
        { polys: hexGrid(L, gy, m(61)), speed: 0.12 },
        { traces: circuits(L, gy, m(67)), speed: 0.28 },
        { polys: monoliths(L, gy, m(71)), speed: 0.45 },
      ],
    ];
    const rnd = m(97);
    this.motes = [];
    for (let i = 0; i < 46; i++) {
      const big = i < 8;
      this.motes.push({ x: rnd() * (W + 60), y: 20 + rnd() * (gy - 30), r: big ? 5 + rnd() * 9 : 0.6 + rnd() * 1.8, p: big ? 0.08 + rnd() * 0.1 : 0.15 + rnd() * 0.45, a: big ? 0.035 + rnd() * 0.04 : 0.12 + rnd() * 0.3, ph: rnd() * 6.28, vy: (rnd() - 0.5) * 6 });
    }
    const r2 = m(131);
    this.street = [];
    for (let x = 0; x < L; x += 180 + r2() * 420) this.street.push({ x, kind: r2() < 0.5 ? 'hole' : 'grate' });
  }
  setBiome(i) {
    if (i === this.biome) return;
    this.prev = this.biome; this.biome = i; this.fade = 0;
  }
  pulse(x) { this.pulses.push({ x, s0: this.scroll, t: 0 }); }
  update(dt, speed) {
    this.scroll += speed * dt;
    this.t += dt;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / 1.5);
    for (const p of this.pulses) p.t += dt * 0.9;
    this.pulses = this.pulses.filter((p) => p.t < 1);
    if (this.quake > 0.25 && Math.random() < this.quake * 0.6) {
      this.debris.push({ x: Math.random() * this.W, y: 60 + Math.random() * 160, vx: -speed * 0.36, vy: 0, t: 0, r: 0.8 + Math.random() * 1.8 });
    }
    for (const d of this.debris) { d.t += dt; d.vy += 600 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
    this.debris = this.debris.filter((d) => d.y < this.groundY && d.t < 2);
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

  drawLayer(ctx, layer, li, alpha) {
    const { W, L, t } = this, off = this.scroll * layer.speed, base = -(off % L);
    const q = this.quake;
    ctx.save();
    if (q > 0.02) ctx.translate(Math.sin(t * 41 + li * 1.7) * q * (1.5 + li * 1.6), Math.sin(t * 57 + li) * q * li * 0.8);
    ctx.globalAlpha = alpha;
    const pulses = this.pulses.map((p) => ({ x: p.x - (this.scroll - p.s0) * layer.speed, r: p.t * 760, k: 1 - p.t }));
    for (const k of [base, base + L]) {
      if (layer.traces) { this.drawTraces(ctx, layer.traces, k, alpha); continue; }
      for (const p of layer.polys) {
        if (p.b[1] + k < -40 || p.b[0] + k > W + 40) continue;
        if (p.pts) {
          ctx.beginPath();
          ctx.moveTo(p.pts[0][0] + k, p.pts[0][1]);
          for (let i = 1; i < p.pts.length; i++) ctx.lineTo(p.pts[i][0] + k, p.pts[i][1]);
          if (!p.open) ctx.closePath();
          if (p.fill) {
            if (p.win && q > 0.2 && Math.sin(t * 50 + p.b[0]) > 0.6) ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = p.fill; ctx.fill();
            ctx.globalAlpha = alpha;
            if (p.win && pulses.length) {
              let boost = 0;
              for (const pu of pulses) boost = Math.max(boost, Math.max(0, 1 - Math.abs(Math.abs(p.b[0] + k - pu.x) - pu.r) / 70) * pu.k);
              if (boost > 0.02) { ctx.fillStyle = PEARL(0.75 * boost); ctx.fill(); }
            }
          }
          if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.lw; ctx.stroke(); }
        } else this.drawSpecial(ctx, p, k, alpha);
      }
    }
    ctx.restore();
  }
  drawSpecial(ctx, p, k, alpha) {
    const t = this.t;
    if (p.halo) {
      const [hx, hy, r, a] = p.halo;
      ctx.globalAlpha = alpha * a * (0.85 + 0.15 * Math.sin(t * 1.3 + hx * 0.01));
      ctx.drawImage(p.warm ? this.haloWarm : this.haloCool, hx + k - r, hy - r, r * 2, r * 2);
      ctx.globalAlpha = alpha;
    } else if (p.text) {
      ctx.fillStyle = p.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${p.size}px "Instrument Sans", sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillText(p.text, p.x + k, p.y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.textBaseline = 'alphabetic';
    } else if (p.mark) {
      const [mx, my, s] = p.mark;
      for (const [pts, c] of MARK) {
        ctx.beginPath(); pts.forEach(([u, v], i) => (i ? ctx.lineTo(mx + k + u * s, my + v * s) : ctx.moveTo(mx + k + u * s, my + v * s)));
        ctx.closePath(); ctx.fillStyle = c; ctx.fill();
      }
    } else if (p.clock) {
      const [cx, cy, r] = p.clock;
      ctx.beginPath(); ctx.arc(cx + k, cy, r, 0, Math.PI * 2); ctx.fillStyle = WARM(0.7); ctx.fill();
      ctx.strokeStyle = 'rgba(40,26,32,0.9)'; ctx.lineWidth = 1.2;
      const a1 = t * 0.5, a2 = t * 0.04;
      ctx.beginPath(); ctx.moveTo(cx + k, cy); ctx.lineTo(cx + k + Math.sin(a1) * r * 0.8, cy - Math.cos(a1) * r * 0.8);
      ctx.moveTo(cx + k, cy); ctx.lineTo(cx + k + Math.sin(a2) * r * 0.5, cy - Math.cos(a2) * r * 0.5); ctx.stroke();
    } else if (p.ticker) {
      const [x, y, w, h, off] = p.ticker;
      ctx.fillStyle = '#120D10'; ctx.fillRect(x + k, y, w, h);
      ctx.strokeStyle = PEARL(0.14); ctx.lineWidth = 1; ctx.strokeRect(x + k + 0.5, y + 0.5, w - 1, h - 1);
      ctx.save(); ctx.beginPath(); ctx.rect(x + k + 1, y + 1, w - 2, h - 2); ctx.clip();
      const m = (this.info && this.info.m) || 1;
      const msg = `ROCKY  M ${m.toFixed(2)} ▲    SEIS ▲ 4.3%    USDW 1.000    PRIVACY ▲ 100%    WATCHERS ▼ 12%    ENCRYPTED ●    `;
      ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const tw = ctx.measureText(msg).width;
      let sx = x + k - ((t * 45 + off) % tw);
      ctx.fillStyle = 'rgba(243,201,218,0.55)';
      for (; sx < x + k + w; sx += tw) ctx.fillText(msg, sx, y + h / 2 + 0.5);
      ctx.restore(); ctx.textBaseline = 'alphabetic';
    } else if (p.chart) {
      const [x, y, w, h, seed] = p.chart;
      ctx.save(); ctx.globalAlpha = alpha * 0.62;
      ctx.fillStyle = '#120D10'; ctx.fillRect(x + k, y, w, h);
      ctx.strokeStyle = PEARL(0.2); ctx.lineWidth = 1; ctx.strokeRect(x + k + 0.5, y + 0.5, w - 1, h - 1);
      ctx.strokeStyle = PEARL(0.06); ctx.beginPath();
      for (let gy = y + h * 0.25; gy < y + h; gy += h * 0.25) { ctx.moveTo(x + k + 6, gy); ctx.lineTo(x + k + w - 6, gy); }
      ctx.stroke();
      const n = 14, bw = (w - 16) / n;
      for (let i = 0; i < n; i++) {
        const u = i + Math.floor(t * 1.2 + seed);
        const o = Math.sin(u * 1.7 + seed) * 0.5 + Math.sin(u * 0.37) * 0.3, c = o + Math.sin(u * 2.3 + 1) * 0.25 + 0.04 * i;
        const up = c > o, yo = y + h * (0.55 - o * 0.3), yc = y + h * (0.55 - c * 0.3);
        const bx = x + k + 8 + i * bw;
        ctx.strokeStyle = up ? 'rgba(243,201,218,0.8)' : 'rgba(161,122,143,0.7)';
        ctx.beginPath(); ctx.moveTo(bx + bw / 2, Math.min(yo, yc) - 4); ctx.lineTo(bx + bw / 2, Math.max(yo, yc) + 4); ctx.stroke();
        ctx.fillStyle = up ? 'rgba(243,201,218,0.8)' : 'rgba(130,90,109,0.9)';
        ctx.fillRect(bx + 1.5, Math.min(yo, yc), bw - 3, Math.max(2, Math.abs(yc - yo)));
      }
      ctx.fillStyle = PEARL(0.7); ctx.font = '500 9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText('SEIS / USDW', x + k + 8, y + 12);
      ctx.restore();
    } else if (p.beam) {
      const [bx, by, seed] = p.beam;
      const a = -Math.PI / 2 + Math.sin(t * 0.45 + seed) * 0.6, len = 520;
      ctx.save(); ctx.translate(bx + k, by); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, PEARL(0.16 * alpha)); g.addColorStop(1, PEARL(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(len, -46); ctx.lineTo(len, 46); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (p.eye) {
      const [ex, ey, r] = p.eye, x = ex + k, lx = this.W * 0.28 - x, ly = this.groundY - 60 - ey, d = Math.hypot(lx, ly) || 1;
      ctx.beginPath(); ctx.arc(x, ey, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(252,252,252,0.14)'; ctx.fill();
      ctx.strokeStyle = 'rgba(252,252,252,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + lx / d * r * 0.35, ey + ly / d * r * 0.35, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#825A6D'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + lx / d * r * 0.4, ey + ly / d * r * 0.4, r * 0.2, 0, Math.PI * 2); ctx.fillStyle = '#161616'; ctx.fill();
    } else if (p.vault) {
      const [vx, vy, r] = p.vault, x = vx + k;
      ctx.beginPath(); ctx.arc(x, vy, r, 0, Math.PI * 2); ctx.fillStyle = '#161216'; ctx.fill();
      ctx.strokeStyle = PEARL(0.16); ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, vy, r * 0.82, 0, Math.PI * 2); ctx.strokeStyle = PEARL(0.08); ctx.lineWidth = 1; ctx.stroke();
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ctx.fillStyle = PEARL(0.16); ctx.fillRect(x + Math.cos(a) * r * 0.91 - 2, vy + Math.sin(a) * r * 0.91 - 2, 4, 4); }
      ctx.save(); ctx.translate(x, vy); ctx.rotate(t * 0.15 + this.quake * Math.sin(t * 30) * 0.2);
      ctx.strokeStyle = PEARL(0.22); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2); ctx.fillStyle = '#825A6D'; ctx.fill();
      ctx.restore(); ctx.lineCap = 'butt';
    }
  }
  drawTraces(ctx, traces, k, alpha) {
    const t = this.t, W = this.W;
    for (const tr of traces) {
      if (tr.b[1] + k < 0 || tr.b[0] + k > W) continue;
      ctx.beginPath();
      tr.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] + k, p[1]) : ctx.moveTo(p[0] + k, p[1])));
      ctx.strokeStyle = PEARL(0.13); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = PEARL(0.3); ctx.fillRect(tr.pts[0][0] + k - 3, tr.pts[0][1] - 3, 6, 6);
      let d = (t * tr.spd * (1 + this.quake * 3) + tr.off) % (tr.len + 120);
      if (d > tr.len) continue;
      for (let i = 1; i < tr.pts.length; i++) {
        const a = tr.pts[i - 1], b = tr.pts[i], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d <= sl) {
          const u = d / sl, px = a[0] + (b[0] - a[0]) * u + k, py = a[1] + (b[1] - a[1]) * u;
          const g = ctx.createRadialGradient(px, py, 0, px, py, 10);
          g.addColorStop(0, PEARL(0.9 * alpha)); g.addColorStop(1, PEARL(0));
          ctx.fillStyle = g; ctx.fillRect(px - 10, py - 10, 20, 20);
          break;
        }
        d -= sl;
      }
    }
  }
  draw(ctx) {
    const { W, H, t } = this, G = this.groundY;
    const b = BIOMES[this.biome], p = this.prev >= 0 && this.fade < 1 ? BIOMES[this.prev] : b;
    const k = p === b ? 1 : this.fade;
    const cur = k >= 0.5 ? b : p;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, this.mix(p.top, b.top, k));
    g.addColorStop(0.55, this.mix(p.mid, b.mid, k));
    g.addColorStop(1, this.mix(p.bottom, b.bottom, k));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const [cx, cy, rot, sc, a] of [[W * 0.62 + Math.sin(t * 0.07) * W * 0.12, H * 0.28, -0.2, 0.2, 0.26], [W * 0.2 + Math.cos(t * 0.05) * W * 0.1, H * 0.6, -0.12, 0.12, 0.14]]) {
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, sc);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.75);
      rg.addColorStop(0, `rgba(${cur.band},${a})`);
      rg.addColorStop(1, `rgba(${cur.band},0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(-W, -W, W * 2, W * 2);
      ctx.restore();
    }
    const tw = this.tile.width;
    const ox = -((this.scroll * 0.05) % tw);
    for (let x = ox; x < W; x += tw) ctx.drawImage(this.tile, x, 0);
    if (p !== b) this.layers[this.prev].forEach((layer, i) => this.drawLayer(ctx, layer, i, 1 - this.fade));
    this.layers[this.biome].forEach((layer, i) => this.drawLayer(ctx, layer, i, p === b ? 1 : this.fade));
    const hz = ctx.createLinearGradient(0, G - 110, 0, G + 2);
    hz.addColorStop(0, `rgba(${cur.haze},0)`);
    hz.addColorStop(1, `rgba(${cur.haze},0.3)`);
    ctx.fillStyle = hz; ctx.fillRect(0, G - 110, W, 112);
    const span = W + 60;
    for (const m of this.motes) {
      const x = ((((m.x - this.scroll * m.p) % span) + span) % span) - 30;
      const y = m.y + Math.sin(t * 0.6 + m.ph) * 8 + m.vy * Math.sin(t * 0.2 + m.ph);
      ctx.fillStyle = PEARL(m.a * (0.65 + 0.35 * Math.sin(t * 1.4 + m.ph)));
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(160,120,130,0.6)';
    for (const d of this.debris) ctx.fillRect(d.x, d.y, d.r, d.r);
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.45, H * 0.35, W * 0.5, H * 0.45, W * 0.75);
    vg.addColorStop(0, 'rgba(10,7,9,0)');
    vg.addColorStop(1, 'rgba(10,7,9,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (!this.grainPat) this.grainPat = ctx.createPattern(this.grain, 'repeat');
    this.grainFrame = (this.grainFrame + 1) % 3;
    if (this.grainFrame === 0) { this.gx = Math.random() * 160; this.gy = Math.random() * 160; }
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.translate(-(this.gx || 0), -(this.gy || 0));
    ctx.fillStyle = this.grainPat;
    ctx.fillRect(0, 0, W + 160, H + 160);
    ctx.restore();
  }
  // street detail in the ground band; fault-line gaps are left untouched
  drawFront(ctx, gaps = []) {
    const { W, H, L } = this, G = this.groundY, s = this.scroll;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, G + 2, W, H - G);
    for (const gp of gaps) ctx.rect(gp.x - 2, G, gp.w + 4, H - G);
    ctx.clip('evenodd');
    const enclave = this.biome === 3;
    ctx.fillStyle = 'rgba(252,252,252,0.035)'; ctx.fillRect(0, G + 2, W, 22);
    ctx.fillStyle = 'rgba(10,7,9,0.35)'; ctx.fillRect(0, G + 24, W, 3);
    ctx.strokeStyle = PEARL(0.06); ctx.lineWidth = 1; ctx.beginPath();
    for (let x = -(s % 64); x < W; x += 64) { ctx.moveTo(x, G + 3); ctx.lineTo(x - 6, G + 24); }
    ctx.stroke();
    if (enclave) {
      ctx.strokeStyle = PEARL(0.08); ctx.beginPath();
      for (let x = -((s * 1.1) % 140); x < W; x += 140) { ctx.moveTo(x, G + 40); ctx.lineTo(x + 60, G + 40); ctx.lineTo(x + 80, G + 60); ctx.lineTo(x + 140, G + 60); }
      ctx.stroke();
    } else {
      ctx.fillStyle = PEARL(0.08);
      for (let x = -((s * 1.1) % 90); x < W; x += 90) ctx.fillRect(x, G + 72, 44, 3);
    }
    const base = -((s * 1.05) % L);
    for (const kk of [base, base + L]) {
      for (const it of this.street) {
        const x = it.x + kk;
        if (x < -40 || x > W + 40) continue;
        ctx.beginPath(); ctx.ellipse(x, G + 48, 18, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,7,9,0.45)'; ctx.fill();
        ctx.strokeStyle = PEARL(0.08); ctx.stroke();
        if (it.kind === 'grate') { ctx.beginPath(); for (let i = -12; i <= 12; i += 6) { ctx.moveTo(x + i, G + 45); ctx.lineTo(x + i, G + 51); } ctx.stroke(); }
      }
    }
    if (this.biome === 1 || this.biome === 2) {
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 9; i++) {
        const x = ((i * 173 - s * 0.36) % (W + 80) + W + 80) % (W + 80) - 40;
        const gr = ctx.createLinearGradient(0, G + 30, 0, H);
        gr.addColorStop(0, i % 3 ? PEARL(0.08) : WARM(0.12)); gr.addColorStop(1, PEARL(0));
        ctx.fillStyle = gr; ctx.fillRect(x, G + 30, 4 + (i % 3) * 3, H - G - 30);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
