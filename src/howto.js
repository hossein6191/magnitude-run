// How-to-play illustrations: each hazard and pick-up is drawn with the game's
// own art (HAZARDS[type].draw) into a small canvas, so the guide always shows
// exactly what the player will meet.
import { HAZARDS } from './hazards.js';

// G: the ground line in the scene; box: the part of the scene shown [x0, y0, x1, y1];
// make: the entity in a pose that reads well as a still
const ICONS = {
  golem: { G: 110, box: [28, 34, 92, 118], make: (g) => HAZARDS.golem.make(60, g) },
  spire: { G: 120, box: [22, 4, 98, 128], make: (g) => HAZARDS.spire.make(60, g) },
  watcher: { G: 110, box: [28, 30, 92, 118], make: (g) => HAZARDS.watcher.make(60, g, g.groundY - 54) },
  watcherHigh: { G: 200, box: [16, 10, 104, 206], make: (g) => HAZARDS.watcher.make(60, g, g.groundY - 172) },
  beam: { G: 180, box: [10, 10, 110, 186], make: (g) => HAZARDS.beamer.make(26, g, 70, false) },
  beamLow: { G: 140, box: [10, 10, 110, 146], make: (g) => { const e = HAZARDS.beamer.make(26, g, 70, true); e.y = g.groundY - 110; return e; } },
  fang: { G: 110, box: [14, -4, 106, 116], make: (g) => HAZARDS.fang.make(60, g) },
  moth: { G: 110, box: [24, 14, 96, 116], make: (g) => { const e = HAZARDS.moth.make(0, g); e.x = 60; return e; } },
  probe: { G: 110, box: [28, 34, 92, 116], make: (g) => { const e = HAZARDS.probe.make(60, g); e.state = 'stuck'; e.y = g.groundY - 46; return e; } },
  burrower: { G: 120, box: [26, 20, 94, 126], make: (g) => { const e = HAZARDS.burrower.make(60, g); e.state = 'up'; e.h = e.hmax; return e; } },
  rock: { G: 110, box: [26, 60, 94, 116], make: (g) => { const e = HAZARDS.rock.make(60, g); e.state = 'rubble'; e.y = g.groundY - 16; return e; } },
  vent: { G: 110, box: [26, 52, 94, 116], make: (g) => HAZARDS.vent.make(60, g) },
  shard: { G: 90, box: [38, 36, 82, 80], make: (g) => HAZARDS.shard.make(60, g, g.groundY - 32) },
  'p-shield': { G: 110, box: [22, 20, 98, 92], power: 'shield' },
  'p-magnet': { G: 110, box: [22, 20, 98, 92], power: 'magnet' },
  'p-dash': { G: 110, box: [22, 20, 98, 92], power: 'dash' },
  'p-amp': { G: 110, box: [22, 20, 98, 92], power: 'amp' },
  'p-repair': { G: 110, box: [22, 20, 98, 92], power: 'repair' },
  gap: { G: 60, box: [18, 22, 102, 78], gap: true },
};

function fakeGame(groundY) {
  return {
    groundY, H: groundY + 10, W: 120, t: 1.3, ui: 1, speed: 400,
    rocky: { x: -400, y: groundY }, power: { magnet: 0, dash: 0, amp: 0 },
    onBurrowerRise() {}, onProbeLand() {}, onRockLand() {}, shatter() {},
  };
}

function drawGround(ctx, g, gapAt) {
  ctx.strokeStyle = 'rgba(243,231,236,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (gapAt) { ctx.moveTo(-50, g.groundY); ctx.lineTo(gapAt[0], g.groundY); ctx.moveTo(gapAt[1], g.groundY); ctx.lineTo(170, g.groundY); }
  else { ctx.moveTo(-50, g.groundY); ctx.lineTo(170, g.groundY); }
  ctx.stroke();
}

export function drawIcon(canvas, name) {
  const def = ICONS[name];
  if (!def) return false;
  const css = 64, dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = css * dpr; canvas.height = css * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const g = fakeGame(def.G);
  const [x0, y0, x1, y1] = def.box, px = css * dpr;
  const s = Math.min(px / (x1 - x0), px / (y1 - y0));
  ctx.setTransform(s, 0, 0, s, (px - (x1 - x0) * s) / 2 - x0 * s, (px - (y1 - y0) * s) / 2 - y0 * s);
  try {
    if (def.gap) {
      drawGround(ctx, g, [38, 82]);
      ctx.fillStyle = '#0d0a0c'; ctx.fillRect(38, g.groundY, 44, 10);
      ctx.strokeStyle = 'rgba(194,154,175,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(38, g.groundY); ctx.lineTo(46, g.groundY + 10); ctx.moveTo(82, g.groundY); ctx.lineTo(74, g.groundY + 10); ctx.stroke();
      return true;
    }
    if (def.power) {
      const e = HAZARDS.power.make(60, g, def.power);
      e.y = g.groundY - 62;
      HAZARDS.power.draw(e, ctx, g);
      return true;
    }
    drawGround(ctx, g);
    const e = def.make(g);
    HAZARDS[e.type].draw(e, ctx, g);
    return true;
  } catch (err) {
    return false;
  }
}

// Draw every [data-icon] canvas inside root once.
export function drawIcons(root) {
  for (const c of root.querySelectorAll('canvas[data-icon]')) {
    if (c.dataset.drawn) continue;
    if (drawIcon(c, c.dataset.icon)) c.dataset.drawn = '1';
    else c.style.display = 'none';
  }
}
