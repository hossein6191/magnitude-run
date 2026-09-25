// Rocky — procedural vector mascot for Magnitude Run.
// The figure is authored in a ~106-unit tall space with the origin at the feet
// centre and y growing downward. Every part is a flat facet in the Seismic
// palette with pearl seams, so it stays crisp at any scale and any DPR.

export const PAL = {
  light:  '#A17A8F',
  mauve:  '#825A6D',
  mid:    '#6A475A',
  purple: '#523542',
  plum:   '#3D2731',
  deep:   '#2A1C22',
  glow:   '#F3E7EC',
  pearl:  '#FCFCFC',
  ink:    '#161616',
};

const BASE = { ...PAL };
export const SKINS = {
  mauve:    { name: 'Mauve',    pal: { ...BASE } },
  obsidian: { name: 'Obsidian', pal: { light: '#77717C', mauve: '#514C58', mid: '#3D3943', purple: '#2C2A31', plum: '#1F1D22', deep: '#151417', glow: '#F3E7EC' } },
  rose:     { name: 'Rose Quartz', pal: { light: '#DDB0C6', mauve: '#C48FAA', mid: '#A5738E', purple: '#7F546C', plum: '#5D3C4E', deep: '#3D2731', glow: '#FFF1F6' } },
  glass:    { name: 'Glass',    pal: { light: 'rgba(252,252,252,0.38)', mauve: 'rgba(252,252,252,0.24)', mid: 'rgba(252,252,252,0.17)', purple: 'rgba(252,252,252,0.12)', plum: 'rgba(252,252,252,0.2)', deep: 'rgba(252,252,252,0.1)', glow: '#F3E7EC' } },
  enclave:  { name: 'Enclave',  pal: { light: '#C29AAF', mauve: '#825A6D', mid: '#523542', purple: '#2A1C22', plum: '#161616', deep: '#0E0B0D', glow: '#B8F0DC' } },
};
export function applySkin(id) {
  const sk = SKINS[id] || SKINS.mauve;
  Object.assign(PAL, BASE, sk.pal);
}

let FILL_OVERRIDE = null;

export function poly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = FILL_OVERRIDE || fill;
  ctx.fill();
}

function seam(ctx, pts, alpha = 0.35, w = 1) {
  if (FILL_OVERRIDE) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = `rgba(252,252,252,${alpha})`;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// Tapered segment from (x,y). Angle a: 0 = straight down, positive = forward (+x).
function segment(ctx, x, y, a, L, w0, w1, fill) {
  const dx = Math.sin(a), dy = Math.cos(a);
  const nx = dy, ny = -dx;
  const ex = x + dx * L, ey = y + dy * L;
  poly(ctx, [
    [x + nx * w0 / 2, y + ny * w0 / 2],
    [ex + nx * w1 / 2, ey + ny * w1 / 2],
    [ex - nx * w1 / 2, ey - ny * w1 / 2],
    [x - nx * w0 / 2, y - ny * w0 / 2],
  ], fill);
  return [ex, ey, dx, dy, nx, ny];
}

function drawLeg(ctx, hx, hy, leg, far) {
  const c1 = far ? PAL.mid : PAL.mauve;
  const c2 = far ? PAL.purple : PAL.mid;
  const c3 = far ? PAL.deep : PAL.plum;
  const [kx, ky] = segment(ctx, hx, hy, leg.hip, 11, 12, 10, c1);
  const [ax, ay, dx, dy] = segment(ctx, kx, ky, leg.hip - leg.knee, 10, 10, 9, c2);
  const fx = ax + dx, fy = ay + dy;
  poly(ctx, [[fx - 5, fy - 3], [fx + 9, fy - 3], [fx + 10, fy + 2], [fx - 6, fy + 2]], c3);
}

function drawArm(ctx, sx, sy, arm, far) {
  const c1 = far ? PAL.mid : PAL.mauve;
  const c2 = far ? PAL.purple : PAL.mid;
  const c3 = far ? PAL.deep : PAL.plum;
  const [ex, ey] = segment(ctx, sx, sy, arm.sh, 17, 9, 8, c1);
  const [hx, hy, dx, dy, nx, ny] = segment(ctx, ex, ey, arm.sh + arm.el, 15, 8, 7, c2);
  poly(ctx, [
    [hx + nx * 4.5, hy + ny * 4.5],
    [hx + nx * 4.5 + dx * 7, hy + ny * 4.5 + dy * 7],
    [hx - nx * 4.5 + dx * 7, hy - ny * 4.5 + dy * 7],
    [hx - nx * 4.5, hy - ny * 4.5],
  ], c3);
}

const CRACKS = [
  [[-9, -34], [-5, -27], [-10, -20], [-6, -12]],
  [[16, -8], [11, -3], [17, 2]],
  [[8, -38], [12, -31], [6, -26], [10, -18]],
];

// Torso in the hip frame: top at y=-40, bottom at 0.
function drawTorso(ctx, cracks, crackGlow) {
  poly(ctx, [[-24, -40], [0, -40], [0, 0], [-30, 0]], PAL.mauve);
  poly(ctx, [[0, -40], [24, -40], [30, 0], [0, 0]], PAL.mid);
  poly(ctx, [[-24, -40], [0, -40], [-12, -19]], PAL.light);
  poly(ctx, [[24, -40], [30, 0], [12, -19]], PAL.purple);
  poly(ctx, [[-30, 0], [30, 0], [28, 4], [-28, 4]], PAL.plum);
  seam(ctx, [[-5, -26], [-12, -19], [-16, -6]], 0.5, 1.2);
  seam(ctx, [[5, -26], [12, -19], [19, -30]], 0.5, 1.2);
  seam(ctx, [[0, -12], [-1, -4]], 0.4, 1);
  // encrypted core: the one thing a Watcher cannot see into
  ctx.fillStyle = FILL_OVERRIDE || 'rgba(243,231,236,0.28)';
  ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(8, -20); ctx.lineTo(0, -8); ctx.lineTo(-8, -20); ctx.closePath(); ctx.fill();
  poly(ctx, [[0, -29], [5, -20], [0, -11], [-5, -20]], PAL.glow);
  if (!FILL_OVERRIDE) {
    for (let i = 0; i < Math.min(3, cracks); i++) {
      const c = CRACKS[i];
      ctx.beginPath();
      ctx.moveTo(c[0][0], c[0][1]);
      for (let j = 1; j < c.length; j++) ctx.lineTo(c[j][0], c[j][1]);
      ctx.strokeStyle = `rgba(243,231,236,${0.35 + 0.65 * crackGlow})`;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'miter';
      ctx.stroke();
    }
  }
  poly(ctx, [[-5, -45], [5, -45], [4, -40], [-4, -40]], PAL.plum);
}

// Head in the head frame (centre at 0,0), 40 tall.
function drawHead(ctx, eye) {
  const T = [0, -20], L = [-20, -4], R = [20, -4], IL = [-8.4, 0], IR = [8.4, 0], BL = [-15, 20], BR = [15, 20];
  poly(ctx, [T, L, IL], PAL.light);
  poly(ctx, [T, IL, IR, R], PAL.mauve);
  poly(ctx, [L, IL, BL], PAL.mid);
  poly(ctx, [IL, IR, BR, BL], PAL.purple);
  poly(ctx, [IR, R, BR], PAL.plum);
  seam(ctx, [T, IL, BL], 0.3, 1);
  seam(ctx, [IL, IR, R], 0.3, 1);
  const w = eye.w, h = Math.max(0.6, eye.h);
  ctx.fillStyle = FILL_OVERRIDE || 'rgba(243,231,236,0.22)';
  ctx.fillRect(-w / 2 + eye.dx - 2, 7 - h / 2 - 2, w + 4, h + 4);
  ctx.fillStyle = FILL_OVERRIDE || PAL.glow;
  ctx.fillRect(-w / 2 + eye.dx, 7 - h / 2, w, h);
}

export function drawRocky(ctx, x, y, s, pose, opts = {}) {
  const { cracks = 0, flash = 0, crackGlow = 0.4, inv = 0 } = opts;
  const passes = flash > 0.02 ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    FILL_OVERRIDE = p === 1 ? PAL.glow : null;
    ctx.save();
    if (p === 1) ctx.globalAlpha = Math.min(1, flash);
    else if (inv > 0 && Math.floor(inv * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.translate(x, y + pose.bob * s);
    ctx.scale(s * pose.sx, s * pose.sy);
    const hipY = pose.hipY == null ? -22 : pose.hipY;
    drawLeg(ctx, -9, hipY, pose.legs[0], true);
    ctx.save();
    ctx.translate(0, hipY);
    ctx.rotate(pose.lean);
    drawArm(ctx, -22, -36, pose.arms[0], true);
    drawTorso(ctx, cracks, crackGlow);
    ctx.save(); ctx.translate(0, -64); drawHead(ctx, pose.eye); ctx.restore();
    drawArm(ctx, 22, -36, pose.arms[1], false);
    ctx.restore();
    drawLeg(ctx, 9, hipY, pose.legs[1], false);
    ctx.restore();
  }
  FILL_OVERRIDE = null;
}

// Faceted bubble for the Shield power-up.
export function drawShield(ctx, x, y, s, t, alpha = 1) {
  ctx.save();
  ctx.translate(x, y - 46 * s);
  ctx.rotate(t * 0.6);
  const r = 64 * s;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const rr = r * (0.94 + 0.06 * Math.sin(t * 3 + i)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath();
  ctx.fillStyle = `rgba(243,231,236,${0.07 * alpha})`; ctx.fill();
  ctx.strokeStyle = `rgba(243,231,236,${0.7 * alpha})`; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = `rgba(243,231,236,${0.25 * alpha})`; ctx.lineWidth = 1;
  ctx.beginPath(); for (let i = 0; i < 7; i += 2) { const a = (i / 7) * Math.PI * 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.stroke();
  ctx.restore();
}

// Crystal: used for Shard the sidekick, pickups and HUD icons.
export function drawCrystal(ctx, x, y, size, rot = 0, glow = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(size, size);
  const T = [0, -1], L = [-0.55, -0.4], R = [0.55, -0.4], BL = [-0.38, 0.9], BR = [0.38, 0.9], M = [-0.1, -0.25];
  poly(ctx, [T, L, M], PAL.light);
  poly(ctx, [T, M, R], PAL.mauve);
  poly(ctx, [L, M, BL], PAL.mid);
  poly(ctx, [M, R, BR, BL], PAL.purple);
  seam(ctx, [T, M, BL], 0.35, 0.06);
  seam(ctx, [M, R], 0.35, 0.06);
  if (glow > 0) { ctx.fillStyle = `rgba(243,231,236,${0.9 * glow})`; ctx.fillRect(-0.25, 0.15, 0.5, 0.12); }
  ctx.restore();
}

// Watcher: a floating glass eye. It sees everything except Rocky's core.
export function drawWatcher(ctx, x, y, r, lookX, lookY) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, 'rgba(252,252,252,0.30)');
  g.addColorStop(0.6, 'rgba(252,252,252,0.08)');
  g.addColorStop(1, 'rgba(252,252,252,0.18)');
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(252,252,252,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
  const d = Math.hypot(lookX, lookY) || 1;
  const ix = lookX / d * r * 0.32, iy = lookY / d * r * 0.32;
  ctx.beginPath(); ctx.arc(ix, iy, r * 0.42, 0, Math.PI * 2); ctx.fillStyle = PAL.mauve; ctx.fill();
  ctx.beginPath(); ctx.arc(ix, iy, r * 0.2, 0, Math.PI * 2); ctx.fillStyle = PAL.ink; ctx.fill();
  ctx.beginPath(); ctx.arc(ix - r * 0.1, iy - r * 0.12, r * 0.07, 0, Math.PI * 2); ctx.fillStyle = PAL.pearl; ctx.fill();
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.42, r * 0.18, r * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(252,252,252,0.55)'; ctx.fill();
  ctx.restore();
}

// Glass Golem: a transparent Rocky from the glass city. Everything inside shows.
export function drawGlassGolem(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  const F = 'rgba(252,252,252,0.09)', S = 'rgba(252,252,252,0.55)';
  const shapes = [
    [[-9, 0], [-2, 0], [-3, -18], [-10, -18]],
    [[2, 0], [9, 0], [10, -18], [3, -18]],
    [[-15, -18], [15, -18], [13, -46], [-13, -46]],
    [[0, -64], [-11, -52], [-7, -46], [7, -46], [11, -52]],
  ];
  for (const sh of shapes) {
    ctx.beginPath();
    sh.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = S; ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.fillStyle = 'rgba(130,90,109,0.7)'; ctx.fillRect(-3, -36, 6, 8);
  ctx.fillStyle = 'rgba(243,231,236,0.8)'; ctx.fillRect(-6, -54, 12, 2);
  ctx.restore();
}

function legRun(th) {
  return { hip: 0.8 * Math.sin(th), knee: 0.2 + 1.1 * Math.max(0, Math.sin(th + 1.3)) };
}

export const POSES = {
  idle: (t) => ({
    bob: Math.sin(t * 2.2) * 1.4, lean: 0.02, sx: 1, sy: 1, eye: { w: 22, h: 3, dx: 0 },
    legs: [{ hip: -0.06, knee: 0.12 }, { hip: 0.06, knee: 0.12 }],
    arms: [{ sh: -0.12, el: 0.3 }, { sh: 0.12, el: 0.3 }],
  }),
  run: (t, ph) => {
    const th = ph * Math.PI * 2;
    return {
      bob: -2.6 * Math.abs(Math.cos(th)), lean: 0.12, sx: 1, sy: 1, eye: { w: 22, h: 3, dx: 1.5 },
      legs: [legRun(th + Math.PI), legRun(th)],
      arms: [{ sh: 0.7 * Math.sin(th), el: 1.3 }, { sh: -0.7 * Math.sin(th), el: 1.3 }],
    };
  },
  jump: () => ({
    bob: 0, lean: 0.16, sx: 0.97, sy: 1.04, eye: { w: 22, h: 3.4, dx: 2 },
    legs: [{ hip: -0.55, knee: 0.7 }, { hip: 0.95, knee: 1.5 }],
    arms: [{ sh: -1.1, el: 0.7 }, { sh: 1.7, el: 0.9 }],
  }),
  fall: () => ({
    bob: 0, lean: 0.06, sx: 1, sy: 1, eye: { w: 22, h: 3.6, dx: 1 },
    legs: [{ hip: 0.25, knee: 0.5 }, { hip: 0.55, knee: 0.8 }],
    arms: [{ sh: -1.5, el: 0.4 }, { sh: 2.0, el: 0.5 }],
  }),
  stomp: () => ({
    bob: 0, lean: -0.06, sx: 1.02, sy: 0.96, eye: { w: 18, h: 1.6, dx: 0 },
    legs: [{ hip: 0.04, knee: 0.15 }, { hip: -0.04, knee: 0.15 }],
    arms: [{ sh: -0.55, el: 0.15 }, { sh: -0.55, el: 0.15 }],
  }),
  land: () => ({
    bob: 0, lean: 0.08, sx: 1.12, sy: 0.86, eye: { w: 22, h: 2.2, dx: 1 },
    legs: [{ hip: -0.35, knee: 0.9 }, { hip: 0.35, knee: 0.9 }],
    arms: [{ sh: -0.9, el: 0.6 }, { sh: 0.9, el: 0.6 }],
  }),
  slide: () => ({
    bob: 0, lean: -1.3, hipY: -9, sx: 1, sy: 1, eye: { w: 22, h: 2.4, dx: 0 },
    legs: [{ hip: 0.9, knee: 1.7 }, { hip: 1.45, knee: 0.15 }],
    arms: [{ sh: -2.3, el: 0.5 }, { sh: 1.2, el: 1.3 }],
  }),
  dash: (t, ph) => {
    const th = ph * Math.PI * 2;
    return {
      bob: -2 * Math.abs(Math.cos(th)), lean: 0.32, sx: 1, sy: 1, eye: { w: 24, h: 2, dx: 2 },
      legs: [legRun(th + Math.PI), legRun(th)],
      arms: [{ sh: -0.9, el: 1.6 }, { sh: -0.7, el: 1.6 }],
    };
  },
};
for (const k in POSES) { const f = POSES[k]; POSES[k] = (t, ph) => { const p = f(t, ph); if (p.hipY == null) p.hipY = -22; return p; }; }

function lerpPose(a, b, k) {
  for (const key in b) {
    const bv = b[key];
    if (typeof bv === 'number') a[key] += (bv - a[key]) * k;
    else if (Array.isArray(bv)) bv.forEach((o, i) => lerpPose(a[key][i], o, k));
    else lerpPose(a[key], bv, k);
  }
}

export class Rocky {
  constructor() { this.reset(); }
  reset() {
    this.x = 0; this.y = 0; this.vy = 0;
    this.grounded = true; this.stomping = false; this.landLock = 0;
    this.dead = false; this.cracks = 0; this.inv = 0; this.flash = 0; this.crackGlow = 0.4;
    this.sliding = false; this.slideT = 0; this.slideLock = 0; this.shield = false; this.airT = 0; this.jumped = false;
    this.diving = false; this.cut = false;
    this.state = 'idle'; this.phase = 0;
    this.blink = 0; this.blinkT = 2 + Math.random() * 3;
    this.cur = null;
  }
  setState(s) { this.state = s; }
  update(dt, speed, t) {
    this.phase = (this.phase + dt * speed / 140) % 1;
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2.5 + Math.random() * 3; }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt * 9);
    const target = POSES[this.state](t, this.phase);
    if (!this.cur) this.cur = JSON.parse(JSON.stringify(target));
    else lerpPose(this.cur, target, 1 - Math.exp(-dt * 16));
    this.inv = Math.max(0, this.inv - dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.crackGlow = Math.max(0.35, this.crackGlow - dt * 1.2);
    this.landLock = Math.max(0, this.landLock - dt);
  }
  draw(ctx, s, t = 0) {
    if (this.dead || !this.cur) return;
    const p = this.cur;
    const eye = { ...p.eye, h: p.eye.h * (1 - this.blink * 0.9) };
    drawRocky(ctx, this.x, this.y, s, { ...p, eye }, {
      cracks: this.cracks, flash: this.flash, crackGlow: this.crackGlow, inv: this.inv,
    });
    if (this.shield) drawShield(ctx, this.x, this.y, s, t);
  }
}

// Facet debris when Rocky shatters.
export function shatterPieces(x, y, s) {
  const cols = [PAL.light, PAL.mauve, PAL.mid, PAL.purple, PAL.plum, PAL.glow];
  const out = [];
  for (let i = 0; i < 28; i++) {
    const px = x + (Math.random() - 0.5) * 60 * s;
    const py = y - Math.random() * 106 * s;
    const a = Math.atan2(py - (y - 50 * s), px - x) + (Math.random() - 0.5) * 0.8;
    const sp = 180 + Math.random() * 360;
    out.push({
      kind: 'facet', x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 220,
      life: 1.1 + Math.random() * 0.6, t: 0, size: 5 + Math.random() * 9,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12, col: cols[i % cols.length],
    });
  }
  return out;
}
