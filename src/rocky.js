// Rocky v2 — drop-in replacement for src/rocky.js (same exports, same call sites).
// Redesign after the Seismic community golem: warm faceted stone, dark cel
// outline, two white dot eyes, a mauve Seismic crystal set in the chest,
// boulder shoulders, heavy fists and block feet. Authored ~96 units tall,
// origin at the feet centre, y down, facing right.
// Motion: spring squash/stretch on take-off and landing, lagging head,
// breathing idle with look-arounds, heavier run bob, footstep dust, landing
// pebbles, pulsing chest gem.

export const PAL = {
  light: '#A17A8F', mauve: '#825A6D', mid: '#6A475A', purple: '#523542',
  plum: '#3D2731', deep: '#2A1C22', glow: '#F3E7EC', pearl: '#FCFCFC', ink: '#161616',
};

const STONE = {
  light: '#BE8A5B', mauve: '#9C6B45', mid: '#7E5436', purple: '#5F3D28', plum: '#452A1C', deep: '#261610',
  glow: '#FCFCFC', gem: '#825A6D', gemHi: '#C29AAF', gemGlow: '243,201,218',
};
export const SKINS = {
  mauve:    { name: 'Stone', pal: { ...STONE } },
  obsidian: { name: 'Obsidian', pal: { light: '#77717C', mauve: '#514C58', mid: '#3D3943', purple: '#2C2A31', plum: '#1F1D22', deep: '#0C0B0D', glow: '#F3E7EC', gem: '#825A6D', gemHi: '#C29AAF', gemGlow: '243,201,218' } },
  rose:     { name: 'Rose Quartz', pal: { light: '#E4BACD', mauve: '#C893AD', mid: '#A8758F', purple: '#86566F', plum: '#643F53', deep: '#3D2731', glow: '#FFFFFF', gem: '#523542', gemHi: '#825A6D', gemGlow: '255,241,246' } },
  glass:    { name: 'Glass', pal: { light: 'rgba(252,252,252,0.42)', mauve: 'rgba(252,252,252,0.24)', mid: 'rgba(252,252,252,0.16)', purple: 'rgba(252,252,252,0.1)', plum: 'rgba(252,252,252,0.2)', deep: 'rgba(252,252,252,0.7)', glow: '#F3E7EC', gem: '#825A6D', gemHi: '#C29AAF', gemGlow: '243,201,218' } },
  enclave:  { name: 'Enclave', pal: { light: '#C29AAF', mauve: '#825A6D', mid: '#6A475A', purple: '#523542', plum: '#3D2731', deep: '#120D10', glow: '#B8F0DC', gem: '#1D1519', gemHi: '#3D2731', gemGlow: '184,240,220' } },
};
export const R = { ...STONE };
export function applySkin(id) {
  const sk = SKINS[id] || SKINS.mauve;
  Object.assign(R, STONE, sk.pal);
}

let FLASH = null;
const OUT = 1.7;

function path(ctx, pts, close = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}
export function poly(ctx, pts, fill) {
  path(ctx, pts);
  ctx.fillStyle = FLASH || fill;
  ctx.fill();
}
function outline(ctx, pts, w = OUT) {
  if (FLASH) return;
  path(ctx, pts);
  ctx.strokeStyle = R.deep; ctx.lineWidth = w; ctx.lineJoin = 'round';
  ctx.stroke();
}
function seam(ctx, pts, a = 0.5, w = 0.9) {
  if (FLASH) return;
  ctx.save();
  ctx.globalAlpha *= a;
  path(ctx, pts, false);
  ctx.strokeStyle = R.deep; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}
function part(ctx, outer, base, facets, seams) {
  poly(ctx, outer, base);
  for (const f of facets) poly(ctx, f[0], f[1]);
  if (seams) for (const s of seams) seam(ctx, s);
  outline(ctx, outer);
}

// Beveled stone block from (x,y) along angle a (0 = down, + = forward).
function limb(ctx, x, y, a, L, w0, w1, main, shade, hi) {
  const dx = Math.sin(a), dy = Math.cos(a), nx = dy, ny = -dx;
  const P = (u, v) => [x + dx * u + nx * v, y + dy * u + ny * v];
  const b = Math.min(3, L * 0.25), h0 = w0 / 2, h1 = w1 / 2;
  const outer = [P(0, -h0 + b), P(b, -h0), P(L - b, -h1), P(L, -h1 + b), P(L, h1 - b), P(L - b, h1), P(b, h0), P(0, h0 - b)];
  const back = [P(b, -h0), P(L - b, -h1), P(L, -h1 + b), P(L, -h1 * 0.15), P(0, -h0 * 0.15), P(0, -h0 + b)];
  const chip = [P(b + 0.5, h0 - 1.4), P(L * 0.6, h1 - 1.4), P(L * 0.35, h0 * 0.3)];
  part(ctx, outer, main, [[back, shade], [chip, hi]]);
  return [x + dx * L, y + dy * L, dx, dy, nx, ny];
}

function cols(far) {
  return far ? [R.mid, R.purple, R.mauve, R.plum] : [R.mauve, R.mid, R.light, R.purple];
}

function drawLeg(ctx, hx, hy, leg, far) {
  const c = cols(far);
  const [kx, ky] = limb(ctx, hx, hy, leg.hip, 11, 15, 14, c[0], c[1], c[2]);
  const sa = leg.hip - leg.knee;
  const [ax, ay] = limb(ctx, kx, ky, sa, 10, 14, 15, c[0], c[1], c[2]);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(-sa * 0.4);
  const outer = [[-8, -3], [-5, -6], [7, -6], [12, -3], [14, 1], [13, 5], [-9, 5], [-10, 1]];
  part(ctx, outer, c[0], [
    [[[-5, -6], [7, -6], [12, -3], [4, -2], [-6, -3]], c[2]],
    [[[-10, 1], [14, 1], [13, 5], [-9, 5]], c[3]],
  ], [[[6, -4], [8, 1]]]);
  ctx.restore();
}

function drawArm(ctx, sx, sy, arm, far) {
  const c = cols(far);
  const [ex, ey] = limb(ctx, sx, sy, arm.sh, 13, 11, 12, c[0], c[1], c[2]);
  const [hx, hy, dx, dy, nx, ny] = limb(ctx, ex, ey, arm.sh + arm.el, 12, 13, 15, c[0], c[1], c[2]);
  const P = (u, v) => [hx + dx * u + nx * v, hy + dy * u + ny * v];
  const outer = [P(-1, -7), P(3, -8.5), P(11, -8), P(14, -4), P(14, 4), P(11, 8), P(3, 8.5), P(-1, 7)];
  part(ctx, outer, c[0], [
    [[P(3, -8.5), P(11, -8), P(14, -4), P(14, -1), P(-1, -1), P(-1, -7)], c[1]],
    [[P(0, 6), P(3, 8), P(9, 7.5), P(5, 3)], c[2]],
  ], [[P(9, -6), P(9.5, 6)]]);
}

function pauldron(ctx, x, y, rot, far) {
  const c = cols(far);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const outer = [[-11, -2], [-8, -10], [1, -13], [10, -9], [13, -1], [10, 7], [0, 10], [-9, 6]];
  part(ctx, outer, c[0], [
    [[[-8, -10], [1, -13], [10, -9], [5, -4], [-5, -5]], c[2]],
    [[[13, -1], [10, 7], [0, 10], [-9, 6], [1, 3]], c[1]],
  ], [[[-11, -2], [-5, -5], [5, -4], [13, -1]]]);
  ctx.restore();
}

function drawPelvis(ctx) {
  const outer = [[-17, -10], [15, -11], [20, -4], [17, 4], [-14, 5], [-19, -2]];
  part(ctx, outer, R.purple, [[[[-17, -10], [15, -11], [18, -6], [-17, -5]], R.mid]]);
}

const CRACKS = [
  [[-12, -40], [-8, -33], [-13, -25], [-9, -16]],
  [[19, -15], [14, -11], [20, -7]],
  [[14, -45], [18, -38], [12, -32], [15, -28]],
];

function drawTorso(ctx, cracks, crackGlow, glow) {
  const outer = [[-22, -12], [-26, -26], [-22, -42], [-10, -49], [12, -49], [24, -42], [28, -26], [22, -12], [8, -7], [-12, -7]];
  part(ctx, outer, R.mauve, [
    [[[-22, -42], [-10, -49], [12, -49], [24, -42], [10, -38], [-12, -38]], R.light],
    [[[-22, -12], [-26, -26], [-22, -42], [-12, -38], [-14, -12], [-12, -7]], R.purple],
    [[[24, -42], [28, -26], [22, -12], [14, -14], [16, -36], [10, -38]], R.mid],
    [[[-14, -12], [14, -14], [22, -12], [8, -7], [-12, -7]], R.plum],
  ], [
    [[-12, -38], [-14, -12]], [[10, -38], [16, -36], [14, -14]],
    [[-5, -44], [-1, -41], [-3, -38]], [[20, -30], [24, -27]],
  ]);
  if (!FLASH) {
    path(ctx, [[-12, -7], [-22, -12], [-26, -26], [-22, -42], [-10, -49]], false);
    ctx.strokeStyle = 'rgba(214,170,190,0.55)'; ctx.lineWidth = 0.9; ctx.stroke();
  }
  // chest crystal: the encrypted core
  if (!FLASH) {
    const a = Math.max(0, Math.min(1, glow));
    const g = ctx.createRadialGradient(2, -26, 1, 2, -26, 17);
    g.addColorStop(0, `rgba(${R.gemGlow},${0.5 * a})`);
    g.addColorStop(1, `rgba(${R.gemGlow},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(2, -26, 17, 0, Math.PI * 2); ctx.fill();
  }
  // the Seismic logomark, set in a dark socket
  const GS = 9.5, gx = 2, gy = -26;
  const hull = [[0, -1.12], [0.62, -0.86], [0.8, 0.26], [0.5, 1.12], [-0.3, 1.12], [-0.8, 0.22], [-0.64, -0.1], [-0.12, -1.05]].map(([u, v]) => [gx + u * GS, gy + v * GS]);
  poly(ctx, hull, R.deep);
  for (const [pts, c] of MARK) poly(ctx, pts.map(([u, v]) => [gx + u * GS, gy + v * GS]), c);
  if (!FLASH) {
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.35 * Math.min(1, glow);
    for (const [pts] of MARK) { path(ctx, pts.map(([u, v]) => [gx + u * GS, gy + v * GS])); ctx.fillStyle = `rgb(${R.gemGlow})`; ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * glow})`;
    ctx.fillRect(gx + 0.5, gy - 7.5, 1.6, 1.6);
    for (let i = 0; i < Math.min(3, cracks); i++) {
      const c = CRACKS[i];
      path(ctx, c, false);
      ctx.strokeStyle = R.deep; ctx.lineWidth = 2.6; ctx.lineJoin = 'miter'; ctx.stroke();
      ctx.strokeStyle = `rgba(${R.gemGlow},${0.45 + 0.55 * crackGlow})`; ctx.lineWidth = 1.3; ctx.stroke();
    }
  }
}

// Head frame: neck at (0,0), dome up to y=-26. eye = { w: size, h: openness 0..1.3, dx: look }
function drawHead(ctx, eye) {
  const outer = [[-13, 0], [-15, -10], [-11, -21], [-2, -26], [10, -25], [16, -17], [17, -6], [14, 1], [-10, 2]];
  part(ctx, outer, R.mauve, [
    [[[-11, -21], [-2, -26], [10, -25], [12, -20], [-1, -19]], R.light],
    [[[-13, 0], [-15, -10], [-11, -21], [-1, -19], [-4, -9], [-5, 1.5], [-10, 2]], R.mid],
    [[[12, -20], [16, -17], [17, -6], [14, 1], [11, 1], [12, -10]], R.mid],
    [[[-5, 1.5], [-4, -3], [12, -3], [14, 1]], R.purple],
  ], [[[-1, -19], [-4, -9], [-5, 1.5]], [[12, -20], [12, -10], [11, 1]], [[-7, -23], [-1, -19]]]);
  poly(ctx, [[-4, -15.5], [13, -16.5], [12.5, -14], [-3.5, -13.4]], R.purple);
  if (!FLASH) {
    path(ctx, [[-10, 2], [-13, 0], [-15, -10], [-11, -21], [-2, -26]], false);
    ctx.strokeStyle = 'rgba(214,170,190,0.5)'; ctx.lineWidth = 0.9; ctx.stroke();
  }
  const dx = eye.dx * 0.9, h = Math.max(0.12, eye.h), w = eye.w;
  const E = [[1.5 + dx, -11, 2.3 * w], [8.6 + dx, -11.4, 2.0 * w]];
  for (const [ex, ey, r] of E) {
    if (!FLASH) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.ellipse(ex, ey, r + 2, (r + 2) * Math.max(0.4, h), 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(ex, ey, r, r * h, 0, 0, Math.PI * 2);
    ctx.fillStyle = FLASH || R.glow; ctx.fill();
    if (!FLASH) { ctx.strokeStyle = R.deep; ctx.lineWidth = 0.9; ctx.stroke(); }
  }
}

export function drawRocky(ctx, x, y, s, pose, opts = {}) {
  const { cracks = 0, flash = 0, crackGlow = 0.4, inv = 0, glow = 0.6 } = opts;
  const passes = flash > 0.02 ? 2 : 1;
  const hipY = pose.hipY == null ? -26 : pose.hipY;
  for (let p = 0; p < passes; p++) {
    FLASH = p === 1 ? R.glow : null;
    ctx.save();
    if (p === 1) ctx.globalAlpha = Math.min(1, flash);
    else if (inv > 0 && Math.floor(inv * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.translate(x, y + (pose.bob || 0) * s);
    ctx.scale(s * pose.sx, s * pose.sy);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    drawLeg(ctx, -8, hipY, pose.legs[0], true);
    ctx.save();
    ctx.translate(0, hipY); ctx.rotate(pose.lean);
    drawArm(ctx, -17, -40, pose.arms[0], true);
    pauldron(ctx, -17, -41, pose.arms[0].sh * 0.2, true);
    drawPelvis(ctx);
    drawTorso(ctx, cracks, crackGlow, glow);
    poly(ctx, [[-9, -46], [11, -46], [9, -50], [-7, -50]], R.plum);
    ctx.save(); ctx.translate(3, -48); ctx.rotate(pose.hr || 0); drawHead(ctx, pose.eye); ctx.restore();
    ctx.restore();
    drawLeg(ctx, 8, hipY, pose.legs[1], false);
    ctx.save();
    ctx.translate(0, hipY); ctx.rotate(pose.lean);
    drawArm(ctx, 20, -40, pose.arms[1], false);
    pauldron(ctx, 20, -41, pose.arms[1].sh * 0.2, false);
    ctx.restore();
    ctx.restore();
  }
  FLASH = null;
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

// Crystal = the Seismic logomark (five facets, white gaps). Shard, pickups, HUD.
const MARK = [
  [[[-0.045, -0.941], [-0.559, 0], [-0.05, -0.65]], '#93667B'],
  [[[0, -1], [0.509, -0.768], [0.45, -0.032], [-0.027, -0.655]], '#A07A8C'],
  [[[0.532, -0.627], [0.677, 0.227], [0.473, -0.023]], '#BA99A8'],
  [[[-0.05, -0.609], [0.432, -0.009], [-0.205, 0.955], [-0.673, 0.214]], '#8F5E74'],
  [[[0.445, 0.027], [0.677, 0.286], [0.418, 1], [-0.182, 1]], '#A68192'],
];
export function drawCrystal(ctx, x, y, size, rot = 0, glow = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  if (glow > 0 && size > 5) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.6);
    g.addColorStop(0, `rgba(243,231,236,${0.22 * glow})`);
    g.addColorStop(1, 'rgba(243,231,236,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, size * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.scale(size, size);
  for (const [pts, c] of MARK) poly(ctx, pts, c);
  ctx.restore();
}

// Watcher: a camera drone of glass. It sees everything except Rocky's core.
export function drawWatcher(ctx, x, y, r, lookX, lookY, ph = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.save(); ctx.rotate(Math.sin(ph * 0.8) * 0.12);
  ctx.fillStyle = 'rgba(252,252,252,0.1)'; ctx.strokeStyle = 'rgba(252,252,252,0.5)'; ctx.lineWidth = 1;
  for (const sgn of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sgn * r * 0.85, -r * 0.2); ctx.lineTo(sgn * r * 1.55, -r * 0.55); ctx.lineTo(sgn * r * 1.45, r * 0.05); ctx.lineTo(sgn * r * 0.9, r * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, -r * 1.45); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -r * 1.5, 2, 0, Math.PI * 2); ctx.fillStyle = Math.sin(ph * 3) > 0 ? '#F3E7EC' : '#825A6D'; ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, 'rgba(252,252,252,0.30)');
  g.addColorStop(0.6, 'rgba(252,252,252,0.08)');
  g.addColorStop(1, 'rgba(252,252,252,0.2)');
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(252,252,252,0.6)'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.strokeStyle = 'rgba(252,252,252,0.22)'; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + ph * 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78); ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); ctx.stroke(); }
  const d = Math.hypot(lookX, lookY) || 1;
  const ix = lookX / d * r * 0.3, iy = lookY / d * r * 0.3;
  ctx.beginPath(); ctx.arc(ix, iy, r * 0.46, 0, Math.PI * 2); ctx.fillStyle = PAL.mauve; ctx.fill();
  ctx.strokeStyle = 'rgba(243,231,236,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); ctx.translate(ix, iy); ctx.rotate(ph * 0.6);
  ctx.strokeStyle = 'rgba(22,22,22,0.55)';
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2); ctx.lineTo(Math.cos(a + 0.9) * r * 0.44, Math.sin(a + 0.9) * r * 0.44); ctx.stroke(); }
  ctx.restore();
  const pr = r * (0.18 + 0.04 * Math.sin(ph * 2));
  ctx.beginPath(); ctx.arc(ix, iy, pr, 0, Math.PI * 2); ctx.fillStyle = PAL.ink; ctx.fill();
  ctx.beginPath(); ctx.arc(ix - r * 0.1, iy - r * 0.12, r * 0.07, 0, Math.PI * 2); ctx.fillStyle = PAL.pearl; ctx.fill();
  ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.45, r * 0.2, r * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(252,252,252,0.6)'; ctx.fill();
  ctx.restore();
}

// Glass Golem: a transparent Rocky from the glass city.
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

// ---------------- poses ----------------
const leg = (hip, knee) => ({ hip, knee });
const arm = (sh, el) => ({ sh, el });
function legRun(th) { return leg(0.85 * Math.sin(th), 0.2 + 1.15 * Math.max(0, Math.sin(th + 1.3))); }

export const POSES = {
  idle: (t) => {
    const b = Math.sin(t * 2.2);
    return {
      bob: b * 1.0, lean: 0.03, hipY: -26, sx: 1 + b * 0.01, sy: 1 - b * 0.01, hr: Math.sin(t * 0.7) * 0.04,
      eye: { w: 1, h: 1, dx: 0 },
      legs: [leg(-0.08, 0.1), leg(0.08, 0.1)],
      arms: [arm(-0.08 + b * 0.03, 0.18), arm(0.1 - b * 0.03, 0.2)],
    };
  },
  run: (t, ph) => {
    const th = ph * Math.PI * 2, c = 1 - Math.abs(Math.cos(th));
    return {
      bob: -3.4 * Math.abs(Math.cos(th)), lean: 0.14 + 0.03 * Math.sin(th * 2), hipY: -26,
      sx: 1 + 0.02 * c, sy: 1 - 0.035 * c, hr: -0.06 + 0.05 * Math.sin(th * 2 + 0.7),
      eye: { w: 1, h: 0.85, dx: 1.2 },
      legs: [legRun(th + Math.PI), legRun(th)],
      arms: [arm(0.75 * Math.sin(th), 0.9 + 0.35 * Math.max(0, Math.sin(th))), arm(-0.75 * Math.sin(th), 0.9 + 0.35 * Math.max(0, -Math.sin(th)))],
    };
  },
  jump: () => ({
    bob: 0, lean: 0.16, hipY: -26, sx: 0.96, sy: 1.05, hr: -0.1, eye: { w: 1, h: 1.1, dx: 1.5 },
    legs: [leg(-0.55, 0.8), leg(0.95, 1.6)],
    arms: [arm(-1.0, 0.6), arm(1.9, 0.7)],
  }),
  fall: () => ({
    bob: 0, lean: 0.04, hipY: -26, sx: 1, sy: 1, hr: 0.08, eye: { w: 1.15, h: 1.25, dx: 1 },
    legs: [leg(0.2, 0.5), leg(0.5, 0.8)],
    arms: [arm(-1.6, 0.5), arm(2.1, 0.4)],
  }),
  stomp: () => ({
    bob: 0, lean: -0.04, hipY: -26, sx: 1.03, sy: 0.95, hr: 0.14, eye: { w: 0.9, h: 0.3, dx: 0.5 },
    legs: [leg(0.05, 0.2), leg(-0.05, 0.2)],
    arms: [arm(2.75, 0.25), arm(2.9, 0.35)],
  }),
  land: () => ({
    bob: 0, lean: 0.2, hipY: -26, sx: 1.1, sy: 0.88, hr: 0.12, eye: { w: 1, h: 0.55, dx: 1 },
    legs: [leg(-0.4, 0.95), leg(0.4, 0.95)],
    arms: [arm(-0.45, 0.55), arm(0.65, 0.9)],
  }),
  slide: () => ({
    bob: 0, lean: -1.25, hipY: -10, sx: 1, sy: 1, hr: 0.5, eye: { w: 1, h: 0.9, dx: 2 },
    legs: [leg(0.9, 1.7), leg(1.5, 0.1)],
    arms: [arm(-2.2, 0.5), arm(1.1, 1.2)],
  }),
  dash: (t, ph) => {
    const th = ph * Math.PI * 2;
    return {
      bob: -2.2 * Math.abs(Math.cos(th)), lean: 0.32, hipY: -26, sx: 1, sy: 1, hr: -0.12, eye: { w: 1, h: 0.55, dx: 2.5 },
      legs: [legRun(th + Math.PI), legRun(th)],
      arms: [arm(-1.0, 1.2), arm(-0.8, 1.3)],
    };
  },
};

function lerpPose(a, b, k) {
  for (const key in b) {
    const bv = b[key];
    if (typeof bv === 'number') a[key] += (bv - a[key]) * k;
    else if (Array.isArray(bv)) bv.forEach((o, i) => lerpPose(a[key][i], o, k));
    else lerpPose(a[key], bv, k);
  }
}
const GROUND_STATES = { idle: 1, run: 1, dash: 1, land: 1, slide: 1 };

export class Rocky {
  constructor() { this.reset(); }
  reset() {
    this.x = 0; this.y = 0; this.vy = 0;
    this.grounded = true; this.stomping = false; this.landLock = 0;
    this.dead = false; this.cracks = 0; this.inv = 0; this.flash = 0; this.crackGlow = 0.4;
    this.sliding = false; this.slideT = 0; this.slideLock = 0; this.shield = false; this.airT = 0; this.jumped = false;
    this.diving = false; this.cut = false;
    this.state = 'idle'; this.phase = 0; this.t = 0; this.speed = 0;
    this.blink = 0; this.blinkT = 2 + Math.random() * 3;
    this.look = 0; this.lookTarget = 0; this.lookT = 3;
    this.sq = 0; this.sqv = 0; this.hr = 0; this.hrv = 0; this.gemBoost = 0;
    this.fx = [];
    this.cur = null;
  }
  setState(s) {
    if (s === this.state) return;
    const p = this.state;
    if (s === 'land') {
      const big = p === 'stomp';
      this.sqv += big ? 3.4 : 2.2; this.hrv += big ? 3 : 1.6;
      this.gemBoost = big ? 1 : 0.35;
      this.pebbles(big ? 9 : 4, big ? 1 : 0.55);
    }
    if (s === 'jump' && GROUND_STATES[p]) { this.sqv -= 2.4; this.pebbles(3, 0.4); }
    if (s === 'stomp') { this.sqv -= 1.6; this.gemBoost = 0.6; }
    if (s === 'slide') this.puff(this.x + 14, 5, 1.2);
    this.state = s;
  }
  puff(x, n, k = 1) {
    for (let i = 0; i < n; i++) {
      this.fx.push({ kind: 'puff', x: x + (Math.random() - 0.5) * 10, y: this.y - 2, vx: -20 - Math.random() * 50 * k, vy: -10 - Math.random() * 30 * k, life: 0.45 + Math.random() * 0.3, t: 0, r: (3 + Math.random() * 4) * k });
    }
  }
  pebbles(n, k) {
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.fx.push({ kind: 'peb', x: this.x + dir * (6 + Math.random() * 12), y: this.y - 3, gy: this.y, vx: dir * (40 + Math.random() * 140) * k, vy: -(80 + Math.random() * 220) * k, life: 0.7 + Math.random() * 0.4, t: 0, r: 1.5 + Math.random() * 2.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
    }
    this.puff(this.x, Math.ceil(n * 0.8), k);
  }
  update(dt, speed, t) {
    this.t = t; this.speed = speed;
    if (this.grounded !== false || this.gy == null) this.gy = this.y;
    const last = this.phase;
    this.phase = (this.phase + dt * speed / 140) % 1;
    if ((this.state === 'run' || this.state === 'dash') && this.grounded !== false) {
      const ph = this.phase;
      const cross = (a) => (ph >= last ? last < a && ph >= a : a > last || a <= ph);
      if (cross(0.25) || cross(0.75)) { this.puff(this.x + 6, 2, 0.7); this.sqv += 0.35; }
    }
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2.2 + Math.random() * 3; }
    if (this.blink > 0) this.blink = Math.max(0, this.blink - dt * 8);
    if (this.state === 'idle') {
      this.lookT -= dt;
      if (this.lookT <= 0) { this.lookTarget = Math.random() < 0.35 ? 0 : -1.6 + Math.random() * 3.6; this.lookT = 1.6 + Math.random() * 2.8; }
    } else this.lookTarget = 0;
    this.look += (this.lookTarget - this.look) * (1 - Math.exp(-dt * 10));
    const target = POSES[this.state](t, this.phase);
    if (!this.cur) { this.cur = JSON.parse(JSON.stringify(target)); this.hr = target.hr; }
    else lerpPose(this.cur, target, 1 - Math.exp(-dt * 15));
    // springs: squash/stretch and a lagging head
    this.sqv += (-240 * this.sq - 15 * this.sqv) * dt; this.sq += this.sqv * dt;
    this.sq = Math.max(-0.22, Math.min(0.26, this.sq));
    this.hrv += (-200 * (this.hr - this.cur.hr) - 13 * this.hrv) * dt; this.hr += this.hrv * dt;
    this.gemBoost = Math.max(0, this.gemBoost - dt * 1.6);
    this.inv = Math.max(0, this.inv - dt);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.crackGlow = Math.max(0.35, this.crackGlow - dt * 1.2);
    this.landLock = Math.max(0, this.landLock - dt);
    for (const p of this.fx) {
      p.t += dt; p.x += (p.vx - speed) * dt; p.y += p.vy * dt;
      if (p.kind === 'peb') {
        p.vy += 1200 * dt; p.rot += p.vr * dt;
        if (p.y > p.gy) { p.y = p.gy; p.vy *= -0.35; p.vx *= 0.6; }
      } else { p.vy *= 1 - dt * 2; p.vx *= 1 - dt * 3; }
    }
    this.fx = this.fx.filter((p) => p.t < p.life);
  }
  draw(ctx, s, t = 0) {
    if (this.dead || !this.cur) return;
    const gy = this.gy == null ? this.y : this.gy, lift = Math.max(0, gy - this.y), sc = 1 / (1 + lift / 110);
    ctx.fillStyle = `rgba(8,5,7,${0.42 * sc})`;
    ctx.beginPath(); ctx.ellipse(this.x + (this.state === 'slide' ? 10 : 2), gy + 1, 27 * s * sc, 5.5 * s * sc, 0, 0, Math.PI * 2); ctx.fill();
    if (this.state === 'stomp' && this.vy > 250) {
      for (let i = 2; i >= 1; i--) {
        ctx.save(); ctx.globalAlpha = 0.14 / i;
        drawRocky(ctx, this.x, this.y - this.vy * 0.022 * i, s, { ...this.cur, eye: { ...this.cur.eye } }, { glow: 0.3 });
        ctx.restore();
      }
    }
    for (const p of this.fx) {
      if (p.kind !== 'puff') continue;
      const k = 1 - p.t / p.life;
      ctx.fillStyle = `rgba(160,120,120,${0.28 * k})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.fill();
    }
    const p = this.cur;
    const eye = { w: p.eye.w, h: p.eye.h * (1 - this.blink * 0.9), dx: p.eye.dx + this.look };
    const sx = p.sx * (1 + this.sq), sy = p.sy * (1 - this.sq);
    const jit = this.flash > 0.3 ? (Math.random() - 0.5) * 2 : 0;
    const glow = 0.5 + 0.18 * Math.sin(this.t * 2.4) + this.gemBoost * 0.6;
    drawRocky(ctx, this.x + jit, this.y, s, { ...p, sx, sy, hr: this.hr, eye }, {
      cracks: this.cracks, flash: this.flash, crackGlow: this.crackGlow, inv: this.inv, glow,
    });
    for (const q of this.fx) {
      if (q.kind !== 'peb') continue;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      ctx.globalAlpha = Math.min(1, (1 - q.t / q.life) * 2);
      ctx.beginPath(); ctx.moveTo(-q.r, -q.r * 0.6); ctx.lineTo(q.r * 0.8, -q.r); ctx.lineTo(q.r, q.r * 0.5); ctx.lineTo(-q.r * 0.6, q.r); ctx.closePath();
      ctx.fillStyle = R.mid; ctx.fill(); ctx.strokeStyle = R.deep; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.restore();
    }
    if (this.shield) drawShield(ctx, this.x, this.y, s, t);
  }
}

// Facet debris when Rocky shatters: stone chunks plus the chest crystal.
export function shatterPieces(x, y, s) {
  const cols = [R.light, R.mauve, R.mid, R.purple, R.plum, R.mauve, R.gemHi, R.gem];
  const out = [];
  for (let i = 0; i < 30; i++) {
    const px = x + (Math.random() - 0.5) * 60 * s;
    const py = y - Math.random() * 96 * s;
    const a = Math.atan2(py - (y - 50 * s), px - x) + (Math.random() - 0.5) * 0.8;
    const sp = 180 + Math.random() * 360;
    out.push({
      kind: 'facet', x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 220,
      life: 1.1 + Math.random() * 0.6, t: 0, size: 5 + Math.random() * 10,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12, col: cols[i % cols.length],
    });
  }
  return out;
}
