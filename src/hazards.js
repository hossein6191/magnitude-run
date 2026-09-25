// Hazards, collectibles and power-ups. Every entity is a plain object with
// a `type`; the registry below gives each type an update, a draw and a hit
// test against Rocky's box. `g` is the Game (groundY, rocky, t, speed, fx).

import { drawCrystal, drawWatcher, drawGlassGolem, PAL } from './rocky.js';

export const KILLER = {
  golem: 'a Glass Golem', spire: 'a Glass Spire', watcher: 'a Watcher', beamer: 'a Watcher beam',
  fang: 'the Fangs', moth: 'a Glass Moth', probe: 'a Probe', burrower: 'a Burrower', rock: 'a falling rock',
  gap: 'the gap', bomb: 'a Glass Bomb',
};
export const POWERS = {
  shield: { name: 'Shielded', text: 'one hit absorbed', dur: 0 },
  magnet: { name: 'Resonance', text: 'shards drawn in', dur: 10 },
  dash:   { name: 'Overclock', text: 'nothing can touch you', dur: 4.5 },
  amp:    { name: 'Amplifier', text: 'shards count double', dur: 12 },
  repair: { name: 'Repair', text: 'one crack healed', dur: 0 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// axis-aligned box vs Rocky's box
function boxHit(rb, x0, y0, x1, y1) {
  return rb.x1 > x0 && rb.x0 < x1 && rb.y1 > y0 && rb.y0 < y1;
}
function circleHit(rb, cx, cy, r) {
  const qx = clamp(cx, rb.x0, rb.x1), qy = clamp(cy, rb.y0, rb.y1);
  return Math.hypot(cx - qx, cy - qy) < r;
}
function glassPoly(ctx, pts, fill = 'rgba(252,252,252,0.09)', stroke = 'rgba(252,252,252,0.55)') {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke();
}
function warnMarker(ctx, x, y, t, k) {
  // ground telegraph: glowing cracks + a shrinking ring
  ctx.strokeStyle = `rgba(243,231,236,${0.25 + 0.5 * k})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - 14, y); ctx.lineTo(x - 6, y + 6); ctx.lineTo(x + 2, y + 2); ctx.lineTo(x + 10, y + 9); ctx.lineTo(x + 16, y + 1);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, 26 * (1 - k) + 6, (26 * (1 - k) + 6) * 0.35, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(194,154,175,${0.3 + 0.6 * k})`;
  ctx.stroke();
}

export const HAZARDS = {
  // ---- ground: jump ----
  golem: {
    name: 'Glass Golem', hint: 'JUMP', solid: true, stompable: 120, bonus: 2,
    make: (x, g) => ({ type: 'golem', x, y: g.groundY, w: 26, h: 64 }),
    box: (e) => [e.x - 13, e.y - 64, e.x + 13, e.y],
    hit: (e, rb) => boxHit(rb, e.x - 12, e.y - 62, e.x + 12, e.y),
    draw: (e, ctx) => drawGlassGolem(ctx, e.x, e.y),
  },
  spire: {
    name: 'Glass Spire', hint: 'JUMP · HOLD', solid: true, stompable: 110, bonus: 2,
    make: (x, g) => ({ type: 'spire', x, y: g.groundY, w: 22, h: 104 }),
    box: (e) => [e.x - 11, e.y - 104, e.x + 11, e.y],
    hit: (e, rb) => boxHit(rb, e.x - 9, e.y - 102, e.x + 9, e.y),
    draw: (e, ctx) => {
      ctx.save(); ctx.translate(e.x, e.y);
      glassPoly(ctx, [[-12, 0], [12, 0], [7, -60], [2, -104], [-5, -62]]);
      glassPoly(ctx, [[-12, 0], [-5, -62], [2, -104], [-2, -60]], 'rgba(130,90,109,0.25)', 'rgba(252,252,252,0.2)');
      ctx.fillStyle = 'rgba(243,231,236,0.7)'; ctx.fillRect(-3, -40, 6, 2);
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
    draw: (e, ctx, g) => { const cy = e.y + Math.sin(e.ph) * 6; drawWatcher(ctx, e.x, cy, e.r, g.rocky.x - e.x, g.rocky.y - 50 - cy); },
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
      const by = HAZARDS.beamer.beamY(e, g);
      const pulse = 0.75 + 0.25 * Math.sin(e.ph * 4);
      ctx.strokeStyle = `rgba(243,231,236,${0.18 * pulse})`; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(e.x, by); ctx.lineTo(e.x + e.len, by); ctx.stroke();
      ctx.strokeStyle = `rgba(243,231,236,${0.95 * pulse})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x, by); ctx.lineTo(e.x + e.len, by); ctx.stroke();
      ctx.strokeStyle = 'rgba(194,154,175,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(e.x, e.y + 18); ctx.lineTo(e.x, by); ctx.stroke(); ctx.setLineDash([]);
      drawWatcher(ctx, e.x, e.y, e.r, 0, 1);
    },
  },
  fang: {
    name: 'Fangs', hint: 'SLIDE', solid: true, stompable: 0, bonus: 0, ceiling: true,
    make: (x, g) => ({ type: 'fang', x, y: g.groundY - 57, w: 60 }),
    box: (e) => [e.x - 30, -10, e.x + 30, e.y],
    hit: (e, rb) => boxHit(rb, e.x - 26, -10, e.x + 26, e.y - 2),
    draw: (e, ctx) => {
      const top = -2;
      ctx.save();
      const teeth = [[-30, 0.55], [-14, 0.85], [0, 1], [14, 0.8], [30, 0.6]];
      for (const [dx, k] of teeth) {
        const tipY = top + (e.y - top) * k;
        ctx.beginPath(); ctx.moveTo(e.x + dx - 11, top); ctx.lineTo(e.x + dx + 11, top); ctx.lineTo(e.x + dx, tipY); ctx.closePath();
        ctx.fillStyle = '#2B2026'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(e.x + dx - 11, top); ctx.lineTo(e.x + dx, tipY); ctx.lineTo(e.x + dx - 3, top); ctx.closePath();
        ctx.fillStyle = '#3A2C33'; ctx.fill();
        ctx.fillStyle = 'rgba(243,231,236,0.75)'; ctx.fillRect(e.x + dx - 1, tipY - 6, 2, 5);
      }
      ctx.restore();
    },
  },
  moth: {
    name: 'Glass Moth', hint: 'SLIDE', solid: true, stompable: 60, bonus: 3, air: true,
    make: (x, g) => ({ type: 'moth', x: x + 160, y: g.groundY - 70, ph: 0, vx: 0 }),
    update: (e, g, dt) => { e.ph += dt * 9; e.x -= g.speed * 0.55 * dt; },
    cy: (e) => e.y + Math.sin(e.ph * 0.5) * 8,
    box: (e) => { const cy = e.y + Math.sin(e.ph * 0.5) * 8; return [e.x - 22, cy - 14, e.x + 22, cy + 14]; },
    hit: (e, rb) => { const cy = e.y + Math.sin(e.ph * 0.5) * 8; return boxHit(rb, e.x - 18, cy - 10, e.x + 18, cy + 10); },
    draw: (e, ctx) => {
      const cy = e.y + Math.sin(e.ph * 0.5) * 8, flap = Math.sin(e.ph) * 0.6;
      ctx.save(); ctx.translate(e.x, cy);
      glassPoly(ctx, [[-4, -8], [4, -8], [6, 8], [-6, 8]], 'rgba(130,90,109,0.5)');
      ctx.save(); ctx.scale(1, Math.cos(flap)); glassPoly(ctx, [[-4, -4], [-26, -16], [-30, 2], [-8, 8]]); glassPoly(ctx, [[4, -4], [26, -16], [30, 2], [8, 8]]); ctx.restore();
      ctx.fillStyle = 'rgba(243,231,236,0.9)'; ctx.fillRect(-3, -4, 6, 2);
      ctx.restore();
    },
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
      if (e.state === 'aim') {
        ctx.strokeStyle = 'rgba(243,231,236,0.35)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(e.x, e.y + 18); ctx.lineTo(e.x, g.groundY - 4); ctx.stroke(); ctx.setLineDash([]);
        const k = 0.5 + 0.5 * Math.sin(e.ph);
        ctx.strokeStyle = `rgba(194,154,175,${0.4 + 0.5 * k})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(e.x, g.groundY, 18 + 6 * k, 6 + 2 * k, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(e.x - 26, g.groundY); ctx.lineTo(e.x - 8, g.groundY); ctx.moveTo(e.x + 8, g.groundY); ctx.lineTo(e.x + 26, g.groundY); ctx.stroke();
      }
      if (e.state !== 'stuck') {
        ctx.save(); ctx.translate(e.x, e.y);
        if (e.state === 'dive') { ctx.strokeStyle = 'rgba(243,231,236,0.3)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, -14); ctx.stroke(); }
        glassPoly(ctx, [[0, 18], [-12, -4], [-6, -16], [6, -16], [12, -4]], 'rgba(252,252,252,0.12)');
        ctx.beginPath(); ctx.arc(0, -4, 6, 0, Math.PI * 2); ctx.fillStyle = PAL.mauve; ctx.fill();
        ctx.beginPath(); ctx.arc(0, -4, 2.6, 0, Math.PI * 2); ctx.fillStyle = PAL.ink; ctx.fill();
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(e.x, g.groundY);
        glassPoly(ctx, [[-10, 0], [10, 0], [6, -34], [0, -60], [-6, -34]], 'rgba(252,252,252,0.14)');
        ctx.beginPath(); ctx.arc(0, -30, 5, 0, Math.PI * 2); ctx.fillStyle = PAL.mauve; ctx.fill();
        const k = 1 - Math.min(1, e.stuckT / 1.1);
        ctx.strokeStyle = `rgba(243,231,236,${0.5 * k})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-20, 8); ctx.moveTo(14, 0); ctx.lineTo(20, 8); ctx.stroke();
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
      glassPoly(ctx, [[-11, 0], [11, 0], [7, -e.h * 0.5], [0, -e.h], [-7, -e.h * 0.5]], 'rgba(130,90,109,0.4)');
      ctx.strokeStyle = 'rgba(243,231,236,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -e.h); ctx.lineTo(-2, -e.h * 0.45); ctx.stroke();
      ctx.fillStyle = 'rgba(243,231,236,0.9)'; ctx.fillRect(-2, -e.h + 6, 4, 4);
      ctx.fillStyle = '#1A1417'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
  },
  // ---- from below: vents launch Rocky high (no damage) ----
  vent: {
    name: 'Vent', hint: 'RIDE', solid: false,
    make: (x, g) => ({ type: 'vent', x, y: g.groundY, ph: 0, fired: 0 }),
    update: (e, g, dt) => { e.ph += dt * 5; if (e.fired > 0) e.fired -= dt; },
    box: (e) => [e.x - 18, e.y - 10, e.x + 18, e.y],
    hit: () => false,
    draw: (e, ctx, g) => {
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.fillStyle = '#0F0C0E'; ctx.beginPath(); ctx.ellipse(0, 1, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
      const k = 0.5 + 0.5 * Math.sin(e.ph);
      ctx.strokeStyle = `rgba(194,154,175,${0.35 + 0.4 * k})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 1, 20, 5, 0, 0, Math.PI * 2); ctx.stroke();
      // bubbling / steam
      for (let i = 0; i < 4; i++) {
        const p = (g.t * 1.4 + i * 0.25) % 1, x = Math.sin(i * 2.1 + g.t) * 8;
        ctx.fillStyle = `rgba(243,231,236,${(1 - p) * (e.fired > 0 ? 0.55 : 0.22)})`;
        ctx.beginPath(); ctx.arc(x, -p * (e.fired > 0 ? 140 : 34), 2 + p * 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  },
  // ---- events: falling rocks ----
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
      if (e.state === 'warn') {
        const k = clamp(1 - (e.x - g.rocky.x - g.speed * 0.5 - 110) / 420, 0, 1);
        ctx.fillStyle = `rgba(22,18,21,${0.5 + 0.4 * k})`; ctx.beginPath(); ctx.ellipse(e.x, g.groundY, 16 + 10 * k, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(243,231,236,${0.25 + 0.5 * k})`; ctx.lineWidth = 1; ctx.stroke();
        return;
      }
      ctx.save();
      if (e.state === 'rubble') { ctx.translate(e.x, g.groundY); ctx.scale(1.25, 0.8); } else { ctx.translate(e.x, e.y); ctx.rotate(e.rot); }
      const pts = [[0, -18], [16, -8], [14, 12], [-6, 16], [-17, 4], [-12, -12]];
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.fillStyle = PAL.plum; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(16, -8); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = PAL.purple; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-12, -12); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = PAL.mid; ctx.fill();
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
    draw: (e, ctx, g) => drawCrystal(ctx, e.x, e.y + Math.sin(e.ph) * 4, 11, Math.sin(e.ph * 0.5) * 0.25, 0.7 + 0.3 * Math.sin(e.ph * 2)),
  },
  power: {
    name: 'Power-up', solid: false,
    make: (x, g, kind) => ({ type: 'power', x, y: g.groundY - 118, kind, ph: 0 }),
    update: (e, g, dt) => { e.ph += dt * 2; },
    box: (e) => [e.x - 16, e.y - 18, e.x + 16, e.y + 18],
    hit: () => false,
    draw: (e, ctx, g) => {
      const y = e.y + Math.sin(e.ph) * 5;
      ctx.save(); ctx.translate(e.x, y);
      const k = 0.6 + 0.4 * Math.sin(e.ph * 3);
      ctx.fillStyle = `rgba(243,231,236,${0.08 * k})`; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
      glassPoly(ctx, [[0, -18], [16, -9], [16, 9], [0, 18], [-16, 9], [-16, -9]], 'rgba(130,90,109,0.35)', `rgba(243,231,236,${0.5 + 0.4 * k})`);
      ctx.strokeStyle = PAL.glow; ctx.fillStyle = PAL.glow; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      if (e.kind === 'shield') { ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, -5); ctx.lineTo(7, 4); ctx.lineTo(0, 9); ctx.lineTo(-7, 4); ctx.lineTo(-8, -5); ctx.closePath(); ctx.stroke(); }
      else if (e.kind === 'magnet') { ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); }
      else if (e.kind === 'dash') { ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-1, 0); ctx.lineTo(-8, 7); ctx.moveTo(1, -7); ctx.lineTo(8, 0); ctx.lineTo(1, 7); ctx.stroke(); }
      else if (e.kind === 'amp') { ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('x2', 0, 1); }
      else if (e.kind === 'repair') { ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke(); }
      ctx.restore();
    },
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
    for (let i = 0; i < 6; i++) { out.push(H('rock', dx)); if (i % 2 === 1) out.push(H('shard', dx + 150, G - 40), H('shard', dx + 188, G - 40)); dx += 400 + rnd() * 220; }
    return { name: 'Rockfall', w: dx + 100, entities: out };
  }
  if (kind === 'swarm') {
    let dx = 0;
    // low ones are jumped (or stomped); a high one only ever follows a full landing
    const plan = [[0, 'L'], [380, 'L'], [900, 'H'], [1300, 'L'], [1680, 'L'], [2200, 'H'], [2600, 'L']];
    for (const [off, kind] of plan) out.push(H('watcher', off, kind === 'H' ? G - 172 : G - 54));
    dx = 3000;
    out.push(H('beamer', dx, 160));
    return { name: 'Watcher swarm', w: dx + 320, entities: out };
  }
  if (kind === 'storm') {
    let dx = 0;
    for (let i = 0; i < 5; i++) { out.push(H('probe', dx)); out.push(H('shard', dx + 180, G - 100)); dx += 400 + rnd() * 200; }
    if (g.speed >= 472) out.push(H('moth', dx + 120));
    return { name: 'Glass storm', w: dx + 260, entities: out };
  }
  let dx = 0;
  for (let i = 0; i < 6; i++) { out.push(H('burrower', dx)); dx += 380 + rnd() * 160; }
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
