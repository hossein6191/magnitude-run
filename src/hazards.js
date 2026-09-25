// Hazards, collectibles and power-ups. Every entity is a plain object with
// a `type`; the registry below gives each type an update, a draw and a hit
// test against Rocky's box. `g` is the Game (groundY, rocky, t, speed, fx).
// Art v3: glass hazards get facets, moving shine and pearl edges; the stone
// hazards share Rocky's cel outline. Hit boxes and timings are unchanged.

import { drawCrystal, drawWatcher, PAL } from './rocky.js';

export const KILLER = {
  golem: 'a Glass Golem', spire: 'a Glass Spire', watcher: 'a Watcher', beamer: 'a Watcher beam',
  fang: 'the Fangs', moth: 'a Glass Moth', probe: 'a Probe', burrower: 'a Burrower', rock: 'falling masonry',
  gap: 'the fault line', bomb: 'a Glass Bomb',
};
export const POWERS = {
  shield: { name: 'Shielded', text: 'one hit absorbed', dur: 0 },
  magnet: { name: 'Resonance', text: 'shards drawn in', dur: 10 },
  dash:   { name: 'Overclock', text: 'nothing can touch you', dur: 4.5 },
  amp:    { name: 'Amplifier', text: 'shards count double', dur: 12 },
  repair: { name: 'Repair', text: 'one crack healed', dur: 0 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PEARL = (a) => `rgba(252,252,252,${a})`;
const GLOW = (a) => `rgba(243,231,236,${a})`;
const MAUVE = (a) => `rgba(130,90,109,${a})`;
const ROSE = (a) => `rgba(194,154,175,${a})`;

function boxHit(rb, x0, y0, x1, y1) {
  return rb.x1 > x0 && rb.x0 < x1 && rb.y1 > y0 && rb.y0 < y1;
}
function circleHit(rb, cx, cy, r) {
  const qx = clamp(cx, rb.x0, rb.x1), qy = clamp(cy, rb.y0, rb.y1);
  return Math.hypot(cx - qx, cy - qy) < r;
}
function path(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
}
function glassPoly(ctx, pts, fill = PEARL(0.09), stroke = PEARL(0.55), lw = 1.2) {
  path(ctx, pts);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
// a diagonal shine band sweeping across a glass shape
function shine(ctx, pts, t, seed = 0, a = 0.22) {
  ctx.save();
  path(ctx, pts); ctx.clip();
  const x = ((t * 70 + seed * 37) % 160) - 80;
  ctx.fillStyle = PEARL(a);
  ctx.beginPath(); ctx.moveTo(x - 6, -140); ctx.lineTo(x + 6, -140); ctx.lineTo(x - 34, 40); ctx.lineTo(x - 46, 40); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function shadow(ctx, x, y, rx, a = 0.35) {
  ctx.fillStyle = `rgba(10,7,9,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y + 1, rx, rx * 0.22, 0, 0, Math.PI * 2); ctx.fill();
}
function sparkle(ctx, x, y, s, a) {
  if (a <= 0.02) return;
  ctx.fillStyle = PEARL(a);
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.22, y - s * 0.22); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.22, y + s * 0.22);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.22, y + s * 0.22); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.22, y - s * 0.22); ctx.closePath(); ctx.fill();
}
// stone with Rocky's cel outline
function stone(ctx, pts, fill, lit, litPts) {
  path(ctx, pts); ctx.fillStyle = fill; ctx.fill();
  if (litPts) { path(ctx, litPts); ctx.fillStyle = lit; ctx.fill(); }
  path(ctx, pts); ctx.strokeStyle = '#1A100C'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
}
function warnMarker(ctx, x, y, t, k) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 40);
  g.addColorStop(0, ROSE(0.35 * k)); g.addColorStop(1, ROSE(0));
  ctx.fillStyle = g; ctx.fillRect(x - 40, y - 12, 80, 24);
  ctx.strokeStyle = GLOW(0.3 + 0.6 * k); ctx.lineWidth = 1.2 + k;
  ctx.beginPath();
  const spread = 8 + 14 * k;
  ctx.moveTo(x - spread, y); ctx.lineTo(x - spread * 0.45, y + 5); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x + spread * 0.5, y + 7); ctx.lineTo(x + spread, y + 1);
  ctx.moveTo(x - 2, y + 1); ctx.lineTo(x - 5, y + 9);
  ctx.stroke();
  const r = 26 * (1 - k) + 7;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.32, 0, 0, Math.PI * 2);
  ctx.strokeStyle = ROSE(0.3 + 0.6 * k); ctx.lineWidth = 1.2; ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const p = (t * 2 + i / 3) % 1;
    ctx.fillStyle = GLOW((1 - p) * 0.5 * k);
    ctx.fillRect(x - 10 + i * 9, y - p * 18 * k, 2, 2);
  }
}

// Glass Golem: a transparent Rocky from the glass city. Everything inside shows.
function drawGolem(ctx, e, g) {
  const t = g.t, x = e.x, y = e.y, look = clamp((g.rocky.x - x) / 300, -1, 1);
  shadow(ctx, x, y, 18);
  ctx.save(); ctx.translate(x, y);
  ctx.scale(1, 1 + Math.sin(t * 3 + x * 0.05) * 0.012);
  const F = PEARL(0.08), S = PEARL(0.6);
  glassPoly(ctx, [[-13, 0], [-2, 0], [-2, -5], [-12, -6]], F, S);
  glassPoly(ctx, [[2, 0], [14, 0], [13, -6], [2, -5]], F, S);
  glassPoly(ctx, [[-10, -5], [-3, -5], [-3, -20], [-10, -20]], F, S);
  glassPoly(ctx, [[3, -5], [10, -5], [10, -20], [3, -20]], F, S);
  const torso = [[-15, -19], [15, -19], [17, -32], [13, -46], [-13, -46], [-17, -32]];
  glassPoly(ctx, torso, PEARL(0.1), S);
  glassPoly(ctx, [[-13, -46], [13, -46], [8, -40], [-8, -40]], PEARL(0.12), null);
  ctx.fillStyle = MAUVE(0.75); ctx.fillRect(-4, -36, 8, 8);
  ctx.strokeStyle = GLOW(0.6); ctx.lineWidth = 0.8; ctx.strokeRect(-4, -36, 8, 8);
  ctx.strokeStyle = PEARL(0.2); ctx.beginPath(); ctx.moveTo(-4, -32); ctx.lineTo(-12, -28); ctx.moveTo(4, -32); ctx.lineTo(12, -26); ctx.stroke();
  glassPoly(ctx, [[-22, -44], [-15, -48], [-13, -38], [-19, -34]], F, S);
  glassPoly(ctx, [[22, -44], [15, -48], [13, -38], [19, -34]], F, S);
  const head = [[-9, -46], [-11, -54], [-6, -62], [6, -62], [11, -54], [9, -46]];
  glassPoly(ctx, head, PEARL(0.1), S);
  shine(ctx, torso, t, x * 0.01);
  shine(ctx, head, t + 0.3, x * 0.01);
  const vx = look * 3;
  ctx.fillStyle = GLOW(0.25); ctx.fillRect(-8 + vx, -57, 16, 5);
  ctx.fillStyle = GLOW(0.95); ctx.fillRect(-6 + vx, -56, 12, 2.4);
  ctx.restore();
}

// Watcher beam emitter + receiver
function drawBeam(ctx, e, g, by) {
  const pulse = 0.75 + 0.25 * Math.sin(e.ph * 4), x0 = e.x, x1 = e.x + e.len;
  const gr = ctx.createLinearGradient(0, by - 10, 0, by + 10);
  gr.addColorStop(0, GLOW(0)); gr.addColorStop(0.5, GLOW(0.22 * pulse)); gr.addColorStop(1, GLOW(0));
  ctx.fillStyle = gr; ctx.fillRect(x0, by - 10, e.len, 20);
  ctx.strokeStyle = GLOW(0.95 * pulse); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x1, by); ctx.stroke();
  ctx.strokeStyle = PEARL(0.9); ctx.lineWidth = 1; ctx.setLineDash([6, 18]); ctx.lineDashOffset = -e.ph * 40;
  ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x1, by); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  ctx.strokeStyle = ROSE(0.4); ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(x0, e.y + 18); ctx.lineTo(x0, by); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(x1, by); ctx.rotate(e.ph);
  glassPoly(ctx, [[0, -7], [7, 0], [0, 7], [-7, 0]], PEARL(0.12), PEARL(0.7));
  ctx.restore();
  sparkle(ctx, x1, by, 8 * pulse, 0.8);
  sparkle(ctx, x0, by, 6 * pulse, 0.7);
}

// Fangs: a steel gantry of the glass city with glass teeth hanging from it
function drawFangs(ctx, e, g) {
  const top = -2, x = e.x;
  ctx.fillStyle = '#231A1F'; ctx.fillRect(x - 44, top, 88, 14);
  ctx.save(); ctx.beginPath(); ctx.rect(x - 44, top + 8, 88, 6); ctx.clip();
  for (let sx = x - 60; sx < x + 50; sx += 14) { ctx.fillStyle = ROSE(0.55); ctx.beginPath(); ctx.moveTo(sx, top + 14); ctx.lineTo(sx + 7, top + 14); ctx.lineTo(sx + 13, top + 8); ctx.lineTo(sx + 6, top + 8); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = PEARL(0.18); ctx.lineWidth = 1; ctx.strokeRect(x - 44 + 0.5, top + 0.5, 87, 13);
  const teeth = [[-30, 0.55], [-14, 0.85], [0, 1], [14, 0.8], [30, 0.6]];
  teeth.forEach(([dx, k], i) => {
    const tipY = top + 14 + (e.y - top - 14) * k, cx = x + dx;
    const pts = [[cx - 10, top + 14], [cx + 10, top + 14], [cx + 2, tipY - 6], [cx, tipY], [cx - 2, tipY - 6]];
    glassPoly(ctx, pts, MAUVE(0.35), PEARL(0.55));
    glassPoly(ctx, [[cx - 10, top + 14], [cx - 2, top + 14], [cx, tipY]], PEARL(0.12), null);
    shine(ctx, pts, g.t, i);
    sparkle(ctx, cx, tipY - 2, 3.5, 0.5 + 0.5 * Math.sin(g.t * 5 + i * 1.7));
  });
}

function drawMoth(ctx, e, g) {
  const cy = e.y + Math.sin(e.ph * 0.5) * 8, flap = Math.sin(e.ph) * 0.65;
  for (let i = 1; i <= 4; i++) {
    ctx.fillStyle = GLOW(0.18 - i * 0.035);
    ctx.beginPath(); ctx.arc(e.x + i * 10, cy + Math.sin(e.ph * 0.5 - i * 0.4) * 6, 2.2 - i * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.translate(e.x, cy);
  ctx.save(); ctx.scale(1, Math.cos(flap));
  const fl = [[-4, -4], [-28, -18], [-33, -2], [-10, 6]], fr = [[4, -4], [28, -18], [33, -2], [10, 6]];
  const hl = [[-5, 3], [-22, 6], [-18, 16], [-6, 9]], hr = [[5, 3], [22, 6], [18, 16], [6, 9]];
  for (const w of [hl, hr]) glassPoly(ctx, w, PEARL(0.07), PEARL(0.4));
  for (const w of [fl, fr]) { glassPoly(ctx, w, PEARL(0.1), PEARL(0.65)); shine(ctx, w, g.t * 1.5, e.x * 0.01, 0.18); }
  ctx.strokeStyle = PEARL(0.3); ctx.lineWidth = 0.8; ctx.beginPath();
  ctx.moveTo(-4, -2); ctx.lineTo(-26, -12); ctx.moveTo(-6, 0); ctx.lineTo(-28, -2); ctx.moveTo(4, -2); ctx.lineTo(26, -12); ctx.moveTo(6, 0); ctx.lineTo(28, -2);
  ctx.stroke();
  ctx.restore();
  glassPoly(ctx, [[-3, -9], [3, -9], [5, 2], [0, 10], [-5, 2]], MAUVE(0.6), GLOW(0.8));
  ctx.strokeStyle = GLOW(0.6); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-2, -9); ctx.lineTo(-6, -15); ctx.moveTo(2, -9); ctx.lineTo(6, -15); ctx.stroke();
  ctx.fillStyle = GLOW(0.95); ctx.fillRect(-3, -6, 6, 2);
  ctx.restore();
}

function drawProbeBody(ctx, e, g, diving) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (diving) {
    const gr = ctx.createLinearGradient(0, -60, 0, -12);
    gr.addColorStop(0, GLOW(0)); gr.addColorStop(1, GLOW(0.5));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-5, -12); ctx.lineTo(5, -12); ctx.lineTo(2, -60); ctx.lineTo(-2, -60); ctx.closePath(); ctx.fill();
  } else ctx.rotate(Math.sin(e.ph * 0.7) * 0.15);
  glassPoly(ctx, [[-12, -8], [-20, -14], [-14, 0]], PEARL(0.08), PEARL(0.45));
  glassPoly(ctx, [[12, -8], [20, -14], [14, 0]], PEARL(0.08), PEARL(0.45));
  const body = [[0, 20], [-12, -4], [-7, -16], [7, -16], [12, -4]];
  glassPoly(ctx, body, PEARL(0.12), PEARL(0.7));
  shine(ctx, body, g.t, e.x * 0.02);
  ctx.beginPath(); ctx.arc(0, -4, 6.5, 0, Math.PI * 2); ctx.fillStyle = PAL.mauve; ctx.fill();
  ctx.strokeStyle = GLOW(0.8); ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -3, 2.8, 0, Math.PI * 2); ctx.fillStyle = PAL.ink; ctx.fill();
  ctx.fillStyle = PEARL(0.9); ctx.fillRect(-2.5, -8, 1.6, 1.6);
  ctx.restore();
}

function drawPower(ctx, e, g) {
  const y = e.y + Math.sin(e.ph) * 5, k = 0.6 + 0.4 * Math.sin(e.ph * 3);
  ctx.save(); ctx.translate(e.x, y);
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 34);
  gr.addColorStop(0, GLOW(0.2 * k)); gr.addColorStop(1, GLOW(0));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.rotate(e.ph * 0.6);
  ctx.strokeStyle = ROSE(0.6); ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  const hex = [[0, -18], [16, -9], [16, 9], [0, 18], [-16, 9], [-16, -9]];
  glassPoly(ctx, hex, MAUVE(0.45), GLOW(0.55 + 0.4 * k), 1.4);
  glassPoly(ctx, [[0, -18], [16, -9], [0, 0], [-16, -9]], PEARL(0.1), null);
  shine(ctx, hex, g.t, e.x * 0.01, 0.25);
  ctx.strokeStyle = PAL.glow; ctx.fillStyle = PAL.glow; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (e.kind === 'shield') { ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, -5); ctx.lineTo(7, 4); ctx.lineTo(0, 9); ctx.lineTo(-7, 4); ctx.lineTo(-8, -5); ctx.closePath(); ctx.stroke(); }
  else if (e.kind === 'magnet') { ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); }
  else if (e.kind === 'dash') { ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-1, 0); ctx.lineTo(-8, 7); ctx.moveTo(1, -7); ctx.lineTo(8, 0); ctx.lineTo(1, 7); ctx.stroke(); }
  else if (e.kind === 'amp') { ctx.font = '600 12px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('x2', 0, 1); ctx.textBaseline = 'alphabetic'; }
  else if (e.kind === 'repair') { ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke(); }
  ctx.lineCap = 'butt';
  const P = POWERS[e.kind];
  if (P) {
    ctx.font = '600 9px "Instrument Sans", sans-serif'; ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.8px';
    ctx.fillStyle = 'rgba(10,7,9,0.55)'; ctx.fillText(P.name.toUpperCase(), 0.5, 35.5);
    ctx.fillStyle = GLOW(0.9); ctx.fillText(P.name.toUpperCase(), 0, 35);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  ctx.restore();
}

export const HAZARDS = {
  // ---- ground: jump ----
  golem: {
    name: 'Glass Golem', hint: 'JUMP', solid: true, stompable: 120, bonus: 2,
    make: (x, g) => ({ type: 'golem', x, y: g.groundY, w: 26, h: 64 }),
    box: (e) => [e.x - 13, e.y - 64, e.x + 13, e.y],
    hit: (e, rb) => boxHit(rb, e.x - 12, e.y - 62, e.x + 12, e.y),
    draw: (e, ctx, g) => drawGolem(ctx, e, g),
  },
  spire: {
    name: 'Glass Spire', hint: 'JUMP · HOLD', solid: true, stompable: 110, bonus: 2,
    make: (x, g) => ({ type: 'spire', x, y: g.groundY, w: 22, h: 104 }),
    box: (e) => [e.x - 11, e.y - 104, e.x + 11, e.y],
    hit: (e, rb) => boxHit(rb, e.x - 9, e.y - 102, e.x + 9, e.y),
    draw: (e, ctx, g) => {
      shadow(ctx, e.x, e.y, 20);
      ctx.save(); ctx.translate(e.x, e.y);
      const gr = ctx.createRadialGradient(0, -40, 0, 0, -40, 60);
      gr.addColorStop(0, ROSE(0.18)); gr.addColorStop(1, ROSE(0));
      ctx.fillStyle = gr; ctx.fillRect(-60, -110, 120, 110);
      glassPoly(ctx, [[-16, 0], [-8, 0], [-12, -34], [-19, -26]], MAUVE(0.25), PEARL(0.4));
      glassPoly(ctx, [[8, 0], [17, 0], [20, -22], [13, -30]], MAUVE(0.25), PEARL(0.4));
      const main = [[-12, 0], [12, 0], [7, -60], [2, -104], [-5, -62]];
      glassPoly(ctx, main, PEARL(0.1), PEARL(0.65));
      glassPoly(ctx, [[-12, 0], [-5, -62], [2, -104], [-2, -60]], MAUVE(0.32), PEARL(0.2));
      shine(ctx, main, g.t, e.x * 0.01);
      ctx.fillStyle = GLOW(0.8); ctx.fillRect(-3, -40, 6, 2);
      sparkle(ctx, 2, -102, 6, 0.4 + 0.5 * Math.sin(g.t * 3 + e.x));
      ctx.restore();
    },
  },
  // ---- air: watchers ----
  watcher: {
    name: 'Watcher', hint: (e, g) => (e.y < g.groundY - 120 ? 'RUN UNDER' : 'JUMP'), solid: true, stompable: 175, bonus: 3, air: true,
    make: (x, g, y) => ({ type: 'watcher', x, y, r: 20, ph: 0 }),
    update: (e, g, dt) => { e.ph += dt * 2.2; },
    cy: (e) => e.y + Math.sin(e.ph) * 6,
    box: (e) => { const cy = e.y + Math.sin(e.ph) * 6; return [e.x - 20, cy - 20, e.x + 20, cy + 20]; },
    hit: (e, rb) => circleHit(rb, e.x, e.y + Math.sin(e.ph) * 6, 17),
    draw: (e, ctx, g) => {
      const cy = e.y + Math.sin(e.ph) * 6;
      if (e.y > g.groundY - 120) shadow(ctx, e.x, g.groundY, 14, 0.25);
      drawWatcher(ctx, e.x, cy, e.r, g.rocky.x - e.x, g.rocky.y - 50 - cy, e.ph);
    },
  },
  // ---- ceiling: slide ----
  beamer: {
    name: 'Watcher beam', hint: (e) => (e.low ? 'JUMP' : 'SLIDE'), solid: true, stompable: 0, bonus: 0, air: true,
    // chest-high beam = slide under; a low (shin) beam = jump it
    make: (x, g, len = 150, low = false) => ({ type: 'beamer', x, y: low ? g.groundY - 150 : g.groundY - 150, len, ph: 0, r: 18, low }),
    update: (e, g, dt) => { e.ph += dt * 3; },
    beamY: (e, g) => (e.low ? g.groundY - 22 : g.groundY - 60),
    box: (e, g) => [e.x - 18, e.y - 18, e.x + e.len, HAZARDS.beamer.beamY(e, g) + 4],
    hit: (e, rb, g) => {
      const by = HAZARDS.beamer.beamY(e, g);
      return circleHit(rb, e.x, e.y, 16) || boxHit(rb, e.x, by - 4, e.x + e.len, by + 4);
    },
    draw: (e, ctx, g) => {
      drawBeam(ctx, e, g, HAZARDS.beamer.beamY(e, g));
      drawWatcher(ctx, e.x, e.y, e.r, 0, 1, e.ph);
    },
  },
  fang: {
    name: 'Fangs', hint: 'SLIDE', solid: true, stompable: 0, bonus: 0, ceiling: true,
    make: (x, g) => ({ type: 'fang', x, y: g.groundY - 57, w: 60 }),
    box: (e) => [e.x - 30, -10, e.x + 30, e.y],
    hit: (e, rb) => boxHit(rb, e.x - 26, -10, e.x + 26, e.y - 2),
    draw: (e, ctx, g) => drawFangs(ctx, e, g),
  },
  moth: {
    name: 'Glass Moth', hint: 'SLIDE', solid: true, stompable: 60, bonus: 3, air: true,
    make: (x, g) => ({ type: 'moth', x: x + 160, y: g.groundY - 70, ph: 0, vx: 0 }),
    update: (e, g, dt) => { e.ph += dt * 9; e.x -= g.speed * 0.55 * dt; },
    cy: (e) => e.y + Math.sin(e.ph * 0.5) * 8,
    box: (e) => { const cy = e.y + Math.sin(e.ph * 0.5) * 8; return [e.x - 22, cy - 14, e.x + 22, cy + 14]; },
    hit: (e, rb) => { const cy = e.y + Math.sin(e.ph * 0.5) * 8; return boxHit(rb, e.x - 18, cy - 10, e.x + 18, cy + 10); },
    draw: (e, ctx, g) => drawMoth(ctx, e, g),
  },
  // ---- from above: the Probe aims, dives, sticks ----
  probe: {
    name: 'Probe', hint: 'JUMP', solid: true, stompable: 120, bonus: 3, air: true,
    make: (x, g) => ({ type: 'probe', x, y: 42, tx: x, state: 'aim', vy: 0, stuckT: 0, ph: 0 }),
    update: (e, g, dt) => {
      e.ph += dt * 6;
      if (e.state === 'aim') {
        const lead = g.speed * 0.42 + 90;
        if (e.x - g.rocky.x < lead) { e.state = 'dive'; e.vy = 1500; }
      } else if (e.state === 'dive') {
        e.vy += 3000 * dt; e.y += e.vy * dt;
        if (e.y >= g.groundY - 46) { e.y = g.groundY - 46; e.state = 'stuck'; g.onProbeLand(e); }
      } else if (e.state === 'stuck') {
        e.stuckT += dt;
        if (e.stuckT > 1.1) { e.state = 'gone'; g.shatter(e, 0, true); }
      }
    },
    box: (e, g) => (e.state === 'stuck' ? [e.x - 10, g.groundY - 60, e.x + 10, g.groundY] : [e.x - 16, e.y - 16, e.x + 16, e.y + 16]),
    hit: (e, rb, g) => {
      if (e.state === 'aim') return false;
      if (e.state === 'stuck') return boxHit(rb, e.x - 8, g.groundY - 58, e.x + 8, g.groundY);
      return circleHit(rb, e.x, e.y, 14);
    },
    draw: (e, ctx, g) => {
      const G = g.groundY;
      if (e.state === 'aim') {
        const gr = ctx.createLinearGradient(0, e.y + 18, 0, G);
        gr.addColorStop(0, GLOW(0.05)); gr.addColorStop(1, ROSE(0.16));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(e.x - 3, e.y + 18); ctx.lineTo(e.x + 3, e.y + 18); ctx.lineTo(e.x + 22, G); ctx.lineTo(e.x - 22, G); ctx.closePath(); ctx.fill();
        const k = 0.5 + 0.5 * Math.sin(e.ph);
        ctx.save(); ctx.translate(e.x, G); ctx.scale(1, 0.32); ctx.rotate(e.ph * 0.5);
        ctx.strokeStyle = ROSE(0.45 + 0.5 * k); ctx.lineWidth = 2.5;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, 22 + 5 * k, i * Math.PI / 2 + 0.25, i * Math.PI / 2 + 1.3); ctx.stroke(); }
        ctx.restore();
        ctx.strokeStyle = GLOW(0.7); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(e.x - 8, G); ctx.lineTo(e.x + 8, G); ctx.moveTo(e.x, G - 3); ctx.lineTo(e.x, G + 3); ctx.stroke();
      }
      if (e.state !== 'stuck') drawProbeBody(ctx, e, g, e.state === 'dive');
      else {
        ctx.save(); ctx.translate(e.x, G);
        const k = 1 - Math.min(1, e.stuckT / 1.1);
        ctx.strokeStyle = GLOW(0.6 * k); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-16, 5); ctx.lineTo(-24, 3); ctx.moveTo(6, 0); ctx.lineTo(15, 6); ctx.lineTo(22, 4); ctx.stroke();
        const sp = [[-10, 0], [10, 0], [6, -34], [0, -60], [-6, -34]];
        glassPoly(ctx, sp, PEARL(0.14), PEARL(0.7));
        glassPoly(ctx, [[-10, 0], [-6, -34], [0, -60], [-1, -30]], MAUVE(0.3), null);
        shine(ctx, sp, g.t * 2, e.x * 0.01);
        const blink = Math.sin(e.stuckT * (8 + e.stuckT * 18)) > 0;
        ctx.beginPath(); ctx.arc(0, -30, 5, 0, Math.PI * 2); ctx.fillStyle = blink ? PAL.glow : PAL.mauve; ctx.fill();
        ctx.restore();
      }
    },
  },
  // ---- from below: the Burrower cracks the ground, then spikes up ----
  burrower: {
    name: 'Burrower', hint: 'JUMP', solid: true, stompable: 90, bonus: 3,
    make: (x, g) => ({ type: 'burrower', x, y: g.groundY, state: 'warn', h: 0, hmax: 88, t: 0, ph: 0 }),
    update: (e, g, dt) => {
      e.ph += dt * 8;
      if (e.state === 'warn') {
        if (e.x - g.rocky.x < g.speed * 0.34 + 70) { e.state = 'rise'; e.t = 0; g.onBurrowerRise(e); }
      } else if (e.state === 'rise') {
        e.t += dt; e.h = e.hmax * Math.min(1, e.t / 0.13);
        if (e.t >= 0.13) { e.state = 'up'; e.t = 0; }
      } else if (e.state === 'up') {
        e.t += dt; e.h = e.hmax + Math.sin(e.ph) * 2;
        if (e.t > 0.62) { e.state = 'down'; e.t = 0; }
      } else if (e.state === 'down') {
        e.t += dt; e.h = e.hmax * Math.max(0, 1 - e.t / 0.22);
        if (e.t >= 0.22) e.state = 'gone';
      }
    },
    box: (e) => [e.x - 9, e.y - e.h, e.x + 9, e.y],
    hit: (e, rb) => e.h > 8 && boxHit(rb, e.x - 8, e.y - e.h + 2, e.x + 8, e.y),
    draw: (e, ctx, g) => {
      if (e.state === 'warn') { const k = clamp(1 - (e.x - g.rocky.x - g.speed * 0.34 - 70) / 380, 0, 1); warnMarker(ctx, e.x, e.y, g.t, k); return; }
      if (e.h <= 0.5) return;
      ctx.save(); ctx.translate(e.x, e.y);
      const h = e.h;
      glassPoly(ctx, [[-16, 0], [-8, 0], [-12, -h * 0.4], [-17, -h * 0.3]], MAUVE(0.3), PEARL(0.4));
      glassPoly(ctx, [[8, 0], [16, 0], [18, -h * 0.28], [12, -h * 0.36]], MAUVE(0.3), PEARL(0.4));
      const sp = [[-11, 0], [11, 0], [7, -h * 0.5], [0, -h], [-7, -h * 0.5]];
      glassPoly(ctx, sp, MAUVE(0.45), PEARL(0.7));
      glassPoly(ctx, [[-11, 0], [-7, -h * 0.5], [0, -h], [-2, -h * 0.45]], PEARL(0.12), null);
      shine(ctx, sp, g.t * 1.5, e.x * 0.01);
      ctx.fillStyle = GLOW(0.95); ctx.fillRect(-2, -h + 8, 4, 4);
      ctx.fillStyle = '#120D10'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ROSE(0.6); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    },
  },
  // ---- from below: steam grates launch Rocky high (no damage) ----
  vent: {
    name: 'Vent', hint: 'RIDE', solid: false,
    make: (x, g) => ({ type: 'vent', x, y: g.groundY, ph: 0, fired: 0 }),
    update: (e, g, dt) => { e.ph += dt * 5; if (e.fired > 0) e.fired -= dt; },
    box: (e) => [e.x - 18, e.y - 10, e.x + 18, e.y],
    hit: () => false,
    draw: (e, ctx, g) => {
      ctx.save(); ctx.translate(e.x, e.y);
      const k = 0.5 + 0.5 * Math.sin(e.ph), on = e.fired > 0;
      const gr = ctx.createLinearGradient(0, -(on ? 180 : 60), 0, 0);
      gr.addColorStop(0, ROSE(0)); gr.addColorStop(1, ROSE(on ? 0.35 : 0.12 + 0.08 * k));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(30, -(on ? 180 : 60)); ctx.lineTo(-30, -(on ? 180 : 60)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0F0C0E'; ctx.beginPath(); ctx.ellipse(0, 1, 21, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ROSE(0.45 + 0.4 * k); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.strokeStyle = PEARL(0.25); ctx.lineWidth = 1; ctx.beginPath();
      for (let i = -14; i <= 14; i += 7) { ctx.moveTo(i, -2.5); ctx.lineTo(i, 4); }
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const p = (g.t * (on ? 2 : 1.2) + i / 6) % 1, x = Math.sin(i * 2.1 + g.t * 2) * (6 + p * 10);
        ctx.fillStyle = GLOW((1 - p) * (on ? 0.5 : 0.2));
        ctx.beginPath(); ctx.arc(x, -p * (on ? 160 : 40), 3 + p * (on ? 10 : 5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  },
  // ---- events: masonry falls from the shaking buildings ----
  rock: {
    name: 'Rock', hint: 'JUMP', solid: true, stompable: 100, bonus: 1,
    make: (x, g) => ({ type: 'rock', x, y: -40, state: 'warn', vy: 0, rubbleT: 0, rot: 0 }),
    update: (e, g, dt) => {
      if (e.state === 'warn') {
        if (e.x - g.rocky.x < g.speed * 0.5 + 110) { e.state = 'fall'; e.vy = 700; }
      } else if (e.state === 'fall') {
        e.vy += 2600 * dt; e.y += e.vy * dt; e.rot += dt * 4;
        if (e.y >= g.groundY - 16) { e.y = g.groundY - 16; e.state = 'rubble'; g.onRockLand(e); }
      } else if (e.state === 'rubble') {
        e.rubbleT += dt;
        if (e.rubbleT > 1.6) { e.state = 'gone'; g.shatter(e, 0, true); }
      }
    },
    box: (e, g) => (e.state === 'rubble' ? [e.x - 18, g.groundY - 34, e.x + 18, g.groundY] : [e.x - 18, e.y - 18, e.x + 18, e.y + 18]),
    hit: (e, rb, g) => {
      if (e.state === 'warn') return false;
      if (e.state === 'rubble') return boxHit(rb, e.x - 15, g.groundY - 30, e.x + 15, g.groundY);
      return circleHit(rb, e.x, e.y, 15);
    },
    draw: (e, ctx, g) => {
      const G = g.groundY;
      if (e.state === 'warn' || e.state === 'fall') {
        const k = e.state === 'fall' ? 1 : clamp(1 - (e.x - g.rocky.x - g.speed * 0.5 - 110) / 420, 0, 1);
        shadow(ctx, e.x, G, 12 + 12 * k, 0.3 + 0.35 * k);
        ctx.strokeStyle = GLOW(0.2 + 0.5 * k); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(e.x, G, 12 + 12 * k, 4 + 2 * k, 0, 0, Math.PI * 2); ctx.stroke();
        if (e.state === 'warn') {
          for (let i = 0; i < 3; i++) { const p = (g.t * 1.6 + i / 3) % 1; ctx.fillStyle = `rgba(160,120,130,${0.5 * k * (1 - p)})`; ctx.fillRect(e.x - 8 + i * 8, p * 120, 2, 3); }
          return;
        }
      }
      ctx.save();
      if (e.state === 'rubble') { ctx.translate(e.x, G); ctx.scale(1.2, 0.8); ctx.translate(0, -16); } else { ctx.translate(e.x, e.y); ctx.rotate(e.rot); }
      stone(ctx, [[-17, -10], [12, -14], [18, -6], [16, 12], [-8, 16], [-18, 6]], '#5E3D28', '#9C6B45', [[-17, -10], [12, -14], [18, -6], [-4, -4]]);
      path(ctx, [[18, -6], [16, 12], [-2, 4], [-4, -4]]); ctx.fillStyle = '#452A1C'; ctx.fill();
      ctx.strokeStyle = 'rgba(26,16,12,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-12, 10); ctx.moveTo(4, -12); ctx.lineTo(3, 12); ctx.stroke();
      ctx.restore();
    },
  },
  // ---- collectibles ----
  shard: {
    name: 'Shard', solid: false,
    make: (x, g, y) => ({ type: 'shard', x, y, ph: 0, vx: 0, vy: 0 }),
    update: (e, g, dt) => {
      e.ph += dt * 3;
      if (g.power.magnet > 0) {
        const r = g.rocky, dx = r.x - e.x, dy = (r.y - 46) - e.y, d = Math.hypot(dx, dy);
        if (d < 190) { const k = (1 - d / 190) * 1400 * dt; e.x += (dx / d) * k; e.y += (dy / d) * k; }
      }
    },
    box: (e) => [e.x - 12, e.y - 12, e.x + 12, e.y + 12],
    hit: () => false,
    draw: (e, ctx, g) => {
      const y = e.y + Math.sin(e.ph) * 4;
      drawCrystal(ctx, e.x, y, 11, Math.sin(e.ph * 0.5) * 0.25, 0.7 + 0.3 * Math.sin(e.ph * 2));
      const tw = Math.max(0, Math.sin(e.ph * 1.3 + e.x * 0.05));
      sparkle(ctx, e.x + 6, y - 8, 5 * tw, 0.9 * tw);
    },
  },
  power: {
    name: 'Power-up', solid: false,
    make: (x, g, kind) => ({ type: 'power', x, y: g.groundY - 118, kind, ph: 0 }),
    update: (e, g, dt) => { e.ph += dt * 2; },
    box: (e) => [e.x - 16, e.y - 18, e.x + 16, e.y + 18],
    hit: () => false,
    draw: (e, ctx, g) => drawPower(ctx, e, g),
  },
};

export function hazardName(type) { return (HAZARDS[type] && HAZARDS[type].name) || type; }
export function hintFor(e, g) { const h = HAZARDS[e.type] && HAZARDS[e.type].hint; return typeof h === 'function' ? h(e, g) : h; }

// ---------- patterns ----------
// Each pattern returns entities (and gaps) for a start x. `z` is the minimum
// zone; weights bias what shows up as the run gets longer.
export function buildPatterns(g, rnd) {
  const G = g.groundY, sp = g.speed, x = g.W + 80;
  const gapW = Math.round(110 + sp * 0.13 + rnd() * 40);
  const wideGap = Math.round(170 + sp * 0.2);
  const H = (type, dx, ...rest) => HAZARDS[type].make(x + dx, g, ...rest);
  const arc = (dx, n, yLow, yHigh, step = 40) => { const out = []; for (let i = 0; i < n; i++) out.push(H('shard', dx + i * step, yLow + (yHigh - yLow) * Math.sin((Math.PI * i) / (n - 1)))); return out; };
  const line = (dx, n, y, step = 38) => { const out = []; for (let i = 0; i < n; i++) out.push(H('shard', dx + i * step, y)); return out; };
  const gap = (dx, w) => ({ type: 'gap', x: x + dx, w });
  return [
    // zone 0: learn jump, shards
    { w: 30, z: 0, wt: 3, f: () => [H('golem', 0)] },
    { w: 200, z: 0, wt: 3, f: () => arc(0, 5, G - 40, G - 135) },
    { w: 150, z: 0, wt: 2, f: () => line(0, 4, G - 40) },
    { w: 60, z: 1, wt: 3, f: () => [H('fang', 0), ...line(-130, 3, G - 30)] },
    // zone 1: slide, watchers, gaps, burrowers
    { w: 30, z: 1, wt: 2, f: () => [H('watcher', 0, G - 54)] },
    { w: 30, z: 1, wt: 2, f: () => [H('watcher', 0, G - 172), ...line(-40, 3, G - 40)] },
    { w: gapW, z: 1, wt: 3, f: () => [gap(0, gapW)] },
    { w: 150, z: 2, wt: 2, f: () => [H('beamer', 0, 150)] },
    { w: 150, z: 2, wt: 1, f: () => [H('beamer', 0, 130, true)] },
    { w: 30, z: 1, wt: 3, f: () => [H('burrower', 0)] },
    { w: 220, z: 1, wt: 2, f: () => [H('golem', 90), ...arc(0, 5, G - 70, G - 150)] },
    { w: 140, z: 1, wt: 2, f: () => [H('watcher', 0, G - 72), H('watcher', 65, G - 125), H('watcher', 130, G - 72)] },
    { w: 260, z: 1, wt: 2, f: () => [H('vent', 0), ...arc(40, 6, G - 150, G - 240, 42)] },
    // zone 2: combos
    { w: 100, z: 2, wt: 2, f: () => [H('golem', 0), H('golem', 70)] },
    { w: 40, z: 2, wt: 2, f: () => [H('spire', 0), ...arc(-80, 5, G - 60, G - 170)] },
    { w: 60, z: 2, wt: sp >= 472 ? 2 : 0, f: () => [H('moth', 0)] },
    { w: gapW + 40, z: 2, wt: 2, f: () => [gap(0, gapW), ...arc(-20, 5, G - 60, G - 140)] },
    { w: 240, z: 2, wt: 2, f: () => [H('fang', 0), H('golem', 210)] },
    { w: 200, z: 2, wt: 2, f: () => [H('probe', 0), ...line(60, 3, G - 40)] },
    { w: 330, z: 2, wt: 2, f: () => [H('burrower', 0), H('burrower', 310)] },
    { w: 300, z: 2, wt: 1, f: () => [H('beamer', 0, 120), H('fang', 220)] },
    // zone 3+: the full mix
    { w: 230, z: 3, wt: 2, f: () => [H('watcher', 0, G - 54), H('golem', 160)] },
    { w: 320 + gapW, z: 3, wt: 2, f: () => [H('golem', 0), gap(90, gapW), H('watcher', 90 + gapW + 70, G - 172)] },
    { w: wideGap, z: 3, wt: 2, f: () => [gap(0, wideGap), ...arc(-30, 6, G - 70, G - 175, 44)] },
    { w: 560, z: 3, wt: 2, f: () => [H('fang', 0), H('burrower', 270), H('fang', 540)] },
    { w: 380, z: 3, wt: 1, f: () => [H('probe', 0), H('probe', 360), ...line(90, 3, G - 40)] },
    { w: 340, z: 3, wt: sp >= 472 ? 1 : 0, f: () => [H('moth', 0), H('spire', 200)] },
    { w: 640, z: 4, wt: 2, f: () => [H('beamer', 0, 140), H('burrower', 320), H('watcher', 620, G - 54)] },
    { w: 380, z: 4, wt: 1, f: () => [H('vent', 0), H('spire', 90), ...arc(40, 7, G - 160, G - 250, 40)] },
    { w: gapW + 560, z: 5, wt: 1, f: () => [gap(0, gapW), H('fang', gapW + 190), H('probe', gapW + 520)] },
  ];
}

// Aftershock events: a scripted burst that replaces normal spawning for a few seconds.
export function buildEvent(kind, g, rnd) {
  const G = g.groundY, x = g.W + 80;
  const H = (type, dx, ...rest) => HAZARDS[type].make(x + dx, g, ...rest);
  const out = [];
  if (kind === 'rockfall') {
    let dx = 0;
    for (let i = 0; i < 4; i++) { out.push(H('rock', dx)); if (i % 2 === 1) out.push(H('shard', dx + 150, G - 40), H('shard', dx + 188, G - 40)); dx += 400 + rnd() * 220; }
    return { name: 'Falling masonry', w: dx + 100, entities: out };
  }
  if (kind === 'swarm') {
    let dx = 0;
    // low ones are jumped (or stomped); a high one only ever follows a full landing
    const plan = [[0, 'L'], [380, 'L'], [900, 'H'], [1300, 'L'], [1680, 'L']];
    for (const [off, kind] of plan) out.push(H('watcher', off, kind === 'H' ? G - 172 : G - 54));
    dx = 2200;
    out.push(H('beamer', dx, 160));
    return { name: 'Watcher swarm', w: dx + 320, entities: out };
  }
  if (kind === 'storm') {
    let dx = 0;
    for (let i = 0; i < 4; i++) { out.push(H('probe', dx)); out.push(H('shard', dx + 180, G - 100)); dx += 400 + rnd() * 200; }
    if (g.speed >= 472) out.push(H('moth', dx + 120));
    return { name: 'Glass storm', w: dx + 260, entities: out };
  }
  let dx = 0;
  for (let i = 0; i < 4; i++) { out.push(H('burrower', dx)); dx += 380 + rnd() * 160; }
  out.push(H('vent', dx + 120)); for (let i = 0; i < 6; i++) out.push(H('shard', dx + 170 + i * 40, G - 170 - Math.sin((Math.PI * i) / 5) * 70));
  return { name: 'Tremor', w: dx + 420, entities: out };
}

export function pickWeighted(list, rnd) {
  list = list.filter((p) => p.wt > 0);
  const total = list.reduce((s, p) => s + p.wt, 0);
  let r = rnd() * total;
  for (const p of list) { r -= p.wt; if (r <= 0) return p; }
  return list[list.length - 1];
}
