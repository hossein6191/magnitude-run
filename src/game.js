// Magnitude Run — core loop. Logical canvas is 540 tall; width follows the
// viewport (640..1280). Rocky stays at a fixed x and the world scrolls past.

import { Rocky, drawCrystal, drawWatcher, drawGlassGolem, shatterPieces, PAL } from './rocky.js';
import { Background } from './world.js';
import { Sfx } from './audio.js';
import { magnitudeFor, tierFor } from './score.js';

const LOGICAL_H = 540;
const PX_PER_M = 8;
const ZONE_M = 600;
const ROCKY_S = 0.9;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Game {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.sfx = new Sfx();
    this.bg = new Background();
    this.rocky = new Rocky();
    this.state = 'title';
    this.t = 0;
    this.last = performance.now();
    this.holding = false;
    this.holdT = 0;
    this.resize();
    this.reset();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame((ts) => this.loop(ts));
  }

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.H = LOGICAL_H;
    this.W = Math.round(Math.max(640, Math.min(1280, (vw / vh) * LOGICAL_H)));
    this.scale = Math.min(vw / this.W, vh / this.H);
    this.canvas.width = Math.round(this.W * this.scale * dpr);
    this.canvas.height = Math.round(this.H * this.scale * dpr);
    this.canvas.style.width = Math.round(this.W * this.scale) + 'px';
    this.canvas.style.height = Math.round(this.H * this.scale) + 'px';
    this.dpr = dpr;
    this.groundY = Math.round(this.H * 0.78);
    this.bg.resize(this.W, this.H, this.groundY);
    if (this.rocky) {
      this.rocky.x = Math.round(this.W * (this.state === 'title' ? 0.72 : 0.28));
      if (this.rocky.grounded) this.rocky.y = this.groundY;
    }
  }

  reset() {
    this.distPx = 0; this.distM = 0; this.shards = 0; this.zone = 0;
    this.entities = []; this.gaps = []; this.particles = []; this.rings = []; this.popups = [];
    this.trace = []; this.runTrace = []; this.nextTraceAt = 0; this.traceStep = 6;
    this.spawnCursor = this.W + 320;
    this.banner = null; this.shake = 0; this.vib = 0; this.deadT = 0; this.hitstop = 0;
    this.speed = 330;
    const r = this.rocky;
    r.reset();
    r.x = Math.round(this.W * (this.state === 'title' ? 0.72 : 0.28));
    r.y = this.groundY;
    for (let x = -10; x < r.x; x += 6) this.trace.push({ x, y: this.groundY });
  }

  start() {
    this.state = 'playing';
    this.reset();
    this.rocky.setState('run');
    this.sfx.ensure();
  }

  // ---- input ----
  press() {
    if (this.state === 'title') { this.hooks.onStartRequest(); return; }
    if (this.state !== 'playing') return;
    const r = this.rocky;
    if (r.dead) return;
    this.holding = true;
    if (r.grounded) {
      if (r.landLock > 0) return;
      r.vy = -720; this.holdT = 0; r.grounded = false;
      this.sfx.jump();
    } else if (!r.stomping) {
      r.stomping = true;
      r.vy = Math.max(r.vy, 900);
      this.sfx.stompStart();
    }
  }
  release() { this.holding = false; }
  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.holding = false; }
    else if (this.state === 'paused') { this.state = 'playing'; this.last = performance.now(); }
  }

  // ---- entity factories ----
  golem(x) { return { type: 'golem', x, y: this.groundY, alive: true }; }
  watcher(x, y) { return { type: 'watcher', x, y, r: 20, ph: rnd(0, 6.28), alive: true }; }
  shard(x, y) { return { type: 'shard', x, y, ph: rnd(0, 6.28), alive: true }; }
  gap(x, w) { return { type: 'gap', x, w }; }
  arc(x, n, yLow, yHigh) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.shard(x + i * 40, yLow + (yHigh - yLow) * Math.sin((Math.PI * i) / (n - 1))));
    return out;
  }
  line(x, n, y) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.shard(x + i * 38, y));
    return out;
  }

  spawnPattern() {
    const G = this.groundY, sp = this.speed, x = this.W + 80;
    const gapW = Math.round(110 + sp * 0.13 + rnd(0, 40));
    const pats = [
      { w: 30, z: 0, f: () => [this.golem(x)] },
      { w: 200, z: 0, f: () => this.arc(x, 5, G - 40, G - 135) },
      { w: 150, z: 0, f: () => this.line(x, 4, G - 40) },
      { w: 30, z: 1, f: () => [this.watcher(x, G - 54)] },
      { w: 30, z: 1, f: () => [this.watcher(x, G - 172), ...this.line(x - 40, 3, G - 40)] },
      { w: gapW, z: 1, f: () => [this.gap(x, gapW)] },
      { w: 100, z: 2, f: () => [this.golem(x), this.golem(x + 70)] },
      { w: 140, z: 1, f: () => [this.watcher(x, G - 72), this.watcher(x + 65, G - 125), this.watcher(x + 130, G - 72)] },
      { w: 220, z: 1, f: () => [this.golem(x + 90), ...this.arc(x, 5, G - 70, G - 150)] },
      { w: gapW + 40, z: 2, f: () => [this.gap(x, gapW), ...this.arc(x - 20, 5, G - 60, G - 140)] },
      { w: 230, z: 3, f: () => [this.watcher(x, G - 54), this.golem(x + 160)] },
      { w: 320 + gapW, z: 3, f: () => [this.golem(x), this.gap(x + 90, gapW), this.watcher(x + 90 + gapW + 70, G - 172)] },
    ];
    const ok = pats.filter((p) => p.z <= this.zone && (this.distM > 90 || p.z === 0));
    const p = pick(ok);
    for (const e of p.f()) { if (e.type === 'gap') this.gaps.push(e); else this.entities.push(e); }
    this.spawnCursor = x + p.w + sp * rnd(0.65, 1.2) + 100;
  }

  // ---- events ----
  land() {
    const r = this.rocky;
    if (r.stomping) {
      r.stomping = false; r.landLock = 0.26;
      this.rings.push({ x: r.x, y: this.groundY, r: 10, t: 0 });
      this.shake = Math.max(this.shake, 6);
      this.sfx.stomp();
      this.dust(r.x, this.groundY, 14);
      let n = 0;
      for (const e of this.entities) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - r.x, e.y - this.groundY);
        if (e.type === 'watcher' && d < 175) { this.shatter(e, 3); n++; }
        else if (e.type === 'golem' && d < 120) { this.shatter(e, 2); n++; }
      }
      if (n >= 2) this.popup(r.x, this.groundY - 130, `combo ×${n}`);
    } else {
      r.landLock = 0.06;
      this.dust(r.x, this.groundY, 4);
    }
  }
  shatter(e, bonus) {
    e.alive = false;
    this.shards += bonus;
    this.sfx.shatter();
    this.popup(e.x, e.y - 30, `+${bonus}`);
    for (let i = 0; i < 12; i++) {
      const a = rnd(0, 6.28), s = rnd(80, 320);
      this.particles.push({ kind: 'glass', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: rnd(0.5, 0.9), t: 0, size: rnd(3, 8), rot: rnd(0, 6.28), vr: rnd(-8, 8) });
    }
  }
  hurt() {
    const r = this.rocky;
    r.cracks++; r.inv = 1.2; r.flash = 1; r.crackGlow = 1;
    this.hitstop = 0.07; this.shake = Math.max(this.shake, 7);
    this.sfx.hit();
    this.spark(r.x, r.y - 50, 8);
    if (r.cracks >= 3) this.die();
    else this.popup(r.x, r.y - 110, 'crack');
  }
  die() {
    const r = this.rocky;
    if (r.dead) return;
    r.dead = true;
    this.state = 'dying'; this.deadT = 0;
    this.holding = false;
    this.particles.push(...shatterPieces(r.x, Math.min(r.y, this.groundY + 30), ROCKY_S));
    this.shake = 12;
    this.sfx.die();
  }
  aftershock() {
    this.shake = 10; this.vib = 1;
    this.banner = { t: 1.8 };
    this.sfx.aftershock();
  }
  finish() {
    this.state = 'over';
    const m = magnitudeFor(this.distM, this.shards);
    this.hooks.onOver({
      m, tier: tierFor(m), dist: this.distM, shards: this.shards, zone: this.zone,
      trace: this.runTrace.slice(), date: new Date().toISOString().slice(0, 10),
    });
  }

  // ---- fx helpers ----
  popup(x, y, text) { this.popups.push({ x, y, text, t: 1 }); }
  spark(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.28), s = rnd(40, 160);
      this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rnd(0.3, 0.6), t: 0, size: rnd(2, 4) });
    }
  }
  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      const s = rnd(30, 140), dir = Math.random() < 0.5 ? -1 : 1;
      this.particles.push({ kind: 'dust', x: x + dir * rnd(4, 14), y: y - 2, vx: dir * s, vy: -rnd(20, 90), life: rnd(0.35, 0.7), t: 0, size: rnd(2, 5) });
    }
  }

  // ---- update ----
  loop(ts) {
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    if (this.state !== 'paused') {
      const n = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < n; i++) { this.t += dt / n; this.update(dt / n); }
    }
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    const r = this.rocky;
    if (this.state === 'title') {
      this.bg.update(dt, 40);
      r.x = Math.round(this.W * 0.72); r.y = this.groundY;
      r.setState('idle');
      r.update(dt, 0, this.t);
      this.updateTrace(dt, 40, true);
      return;
    }
    if (this.state === 'over') { this.updateFx(dt, 0); return; }
    if (this.state === 'dying') {
      this.deadT += dt;
      this.updateFx(dt, this.speed * 0.3);
      this.bg.update(dt, this.speed * 0.3);
      if (this.deadT > 1.1) this.finish();
      return;
    }

    this.speed = Math.min(780, 330 + this.zone * 38 + this.distM * 0.06);
    const sp = this.speed;
    this.distPx += sp * dt;
    this.distM = this.distPx / PX_PER_M;
    const z = Math.floor(this.distM / ZONE_M);
    if (z > this.zone) { this.zone = z; this.aftershock(); }
    this.bg.update(dt, sp);

    // physics
    if (this.holding) this.holdT += dt;
    let g = 2300;
    if (r.stomping) g = 5200;
    else if (this.holding && r.vy < 0 && this.holdT < 0.17) g = 950;
    const prevY = r.y;
    r.vy += g * dt;
    r.y += r.vy * dt;
    const overGap = this.gaps.some((gp) => r.x > gp.x + 8 && r.x < gp.x + gp.w - 8);
    if (r.y >= this.groundY) {
      if (!overGap && prevY <= this.groundY + 1) {
        if (!r.grounded) this.land();
        r.y = this.groundY; r.vy = 0; r.grounded = true;
      } else {
        r.grounded = false;
        if (r.y > this.H + 150) this.die();
      }
    } else r.grounded = false;

    if (!r.dead) {
      if (r.grounded) r.setState(r.landLock > 0 ? 'land' : 'run');
      else if (r.stomping) r.setState('stomp');
      else r.setState(r.vy < 0 ? 'jump' : 'fall');
    }
    r.update(dt, sp, this.t);

    // world scroll
    for (const e of this.entities) { e.x -= sp * dt; if (e.type === 'watcher') e.ph += dt * 2.2; }
    for (const gp of this.gaps) gp.x -= sp * dt;
    this.entities = this.entities.filter((e) => e.alive && e.x > -120);
    this.gaps = this.gaps.filter((gp) => gp.x + gp.w > -50);
    this.spawnCursor -= sp * dt;
    if (this.spawnCursor < this.W + 40) this.spawnPattern();

    this.collide();
    this.updateTrace(dt, sp, false);
    this.updateFx(dt, sp);
  }

  collide() {
    const r = this.rocky;
    if (r.dead) return;
    const hw = 13 * ROCKY_S, top = r.y - 92 * ROCKY_S, bot = r.y - 2;
    const cx = r.x, cy = r.y - 46 * ROCKY_S;
    for (const e of this.entities) {
      if (!e.alive) continue;
      if (e.type === 'shard') {
        if (Math.hypot(e.x - cx, e.y - cy) < 32) {
          e.alive = false; this.shards++;
          this.sfx.shard(); this.spark(e.x, e.y, 6); this.popup(e.x, e.y - 14, '+1');
        }
        continue;
      }
      let hit = false;
      if (e.type === 'watcher') {
        const ny = e.y + Math.sin(e.ph) * 6;
        const qx = Math.max(cx - hw, Math.min(e.x, cx + hw));
        const qy = Math.max(top, Math.min(ny, bot));
        hit = Math.hypot(e.x - qx, ny - qy) < e.r - 3;
        if (hit && r.stomping) { this.shatter(e, 3); continue; }
      } else if (e.type === 'golem') {
        hit = Math.abs(e.x - cx) < hw + 13 && bot > e.y - 62 && top < e.y;
      }
      if (hit && r.inv <= 0) this.hurt();
    }
  }

  updateTrace(dt, sp, flat) {
    for (const s of this.trace) s.x -= sp * dt;
    while (this.trace.length && this.trace[0].x < -20) this.trace.shift();
    const r = this.rocky;
    if (!r.dead) {
      const jitter = flat ? 0 : (Math.random() - 0.5) * 1.2 + Math.sin(this.t * 40) * this.vib * 5;
      this.trace.push({ x: r.x, y: Math.min(r.y, this.H + 10) + jitter });
      if (!flat && this.distPx >= this.nextTraceAt) {
        this.runTrace.push(Math.max(0, this.groundY - r.y));
        this.nextTraceAt += this.traceStep;
        if (this.runTrace.length > 900) {
          this.runTrace = this.runTrace.filter((_, i) => i % 2 === 0);
          this.traceStep *= 2;
        }
      }
    }
  }

  updateFx(dt, sp) {
    for (const rg of this.rings) { rg.t += dt * 1.6; rg.r = 10 + rg.t * 170; rg.x -= sp * dt; }
    this.rings = this.rings.filter((rg) => rg.t < 1);
    this.shake = Math.max(0, this.shake - dt * 22);
    this.vib = Math.max(0, this.vib - dt * 0.7);
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    for (const p of this.popups) { p.y -= 34 * dt; p.t -= dt * 0.9; p.x -= sp * dt * 0.5; }
    this.popups = this.popups.filter((p) => p.t > 0);
    for (const p of this.particles) {
      p.t += dt;
      const grav = p.kind === 'dust' ? 300 : p.kind === 'spark' ? -150 : 1400;
      p.vy += grav * dt;
      p.x += (p.vx - sp * 0.6) * dt; p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += p.vr * dt;
      if (p.y > this.groundY && (p.kind === 'facet' || p.kind === 'glass')) { p.y = this.groundY; p.vy *= -0.35; p.vx *= 0.7; }
    }
    this.particles = this.particles.filter((p) => p.t < p.life);
  }

  // ---- draw ----
  draw() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 2, (Math.random() - 0.5) * this.shake * 2);
    this.bg.draw(ctx);
    this.drawGround(ctx);
    for (const e of this.entities) this.drawEntity(ctx, e);
    for (const rg of this.rings) {
      ctx.beginPath();
      ctx.ellipse(rg.x, rg.y, rg.r, rg.r * 0.32, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(243,231,236,${(1 - rg.t) * 0.8})`;
      ctx.lineWidth = 2.5 * (1 - rg.t) + 0.5;
      ctx.stroke();
    }
    this.rocky.draw(ctx, ROCKY_S);
    this.drawCompanion(ctx);
    this.drawParticles(ctx);
    for (const p of this.popups) {
      ctx.fillStyle = `rgba(243,231,236,${Math.min(1, p.t) * 0.95})`;
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
    if (this.state !== 'title') this.drawHUD(ctx);
    if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(22,18,21,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = PAL.pearl;
      ctx.textAlign = 'center';
      ctx.font = '400 40px "Instrument Serif", serif';
      ctx.fillText('Paused', W / 2, H / 2 - 6);
      ctx.fillStyle = 'rgba(252,252,252,0.6)';
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillText('Esc to resume', W / 2, H / 2 + 22);
    }
  }

  drawGround(ctx) {
    const W = this.W, H = this.H, G = this.groundY, off = this.bg.scroll;
    ctx.fillStyle = '#1A1417';
    ctx.fillRect(0, G, W, H - G);
    ctx.strokeStyle = 'rgba(252,252,252,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 96, sx = -(off % step);
    for (let x = sx; x < W + step; x += step) {
      ctx.moveTo(x, G); ctx.lineTo(x + 34, H);
      ctx.moveTo(x + 50, G + 40); ctx.lineTo(x + step + 10, G + 10);
    }
    ctx.stroke();
    for (const gp of this.gaps) {
      ctx.fillStyle = '#0E0B0D';
      ctx.fillRect(gp.x, G, gp.w, H - G);
      const gr = ctx.createLinearGradient(0, G, 0, G + 90);
      gr.addColorStop(0, 'rgba(130,90,109,0.5)');
      gr.addColorStop(1, 'rgba(130,90,109,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(gp.x, G, 3, 90);
      ctx.fillRect(gp.x + gp.w - 3, G, 3, 90);
    }
    // the trace: behind Rocky it is his history, ahead of him the baseline
    const rx = this.rocky.x;
    const segs = [];
    let cursor = rx;
    const gaps = this.gaps.slice().sort((a, b) => a.x - b.x);
    for (const gp of gaps) {
      if (gp.x + gp.w < cursor) continue;
      if (gp.x > cursor) segs.push([cursor, gp.x]);
      cursor = Math.max(cursor, gp.x + gp.w);
    }
    if (cursor < W) segs.push([cursor, W]);
    const vib = this.vib, t = this.t;
    const pass = (w, a) => {
      ctx.lineWidth = w; ctx.strokeStyle = `rgba(243,231,236,${a})`;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      for (const s of this.trace) { if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y); }
      ctx.stroke();
      ctx.beginPath();
      for (const [x0, x1] of segs) {
        for (let x = x0; x <= x1; x += 8) {
          const y = G + Math.sin((x + off) * 0.15) * 0.5 + vib * Math.sin(x * 0.3 + t * 60) * 4;
          x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };
    pass(6, 0.12);
    pass(1.8, 0.95);
  }

  drawEntity(ctx, e) {
    if (e.type === 'shard') {
      const y = e.y + Math.sin(this.t * 3 + e.ph) * 4;
      drawCrystal(ctx, e.x, y, 11, Math.sin(this.t * 1.5 + e.ph) * 0.25, 0.7 + 0.3 * Math.sin(this.t * 6 + e.ph));
    } else if (e.type === 'watcher') {
      const y = e.y + Math.sin(e.ph) * 6;
      drawWatcher(ctx, e.x, y, e.r, this.rocky.x - e.x, this.rocky.y - 50 - y);
    } else if (e.type === 'golem') {
      drawGlassGolem(ctx, e.x, e.y);
    }
  }

  drawCompanion(ctx) {
    const r = this.rocky;
    if (r.dead) return;
    const a = this.t * 2.6;
    const cx = r.x - 26 + Math.cos(a) * 16, cy = r.y - 104 + Math.sin(a) * 7 + Math.sin(this.t * 1.7) * 3;
    ctx.fillStyle = 'rgba(243,231,236,0.08)';
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
    drawCrystal(ctx, cx, cy, 7, Math.sin(this.t * 2) * 0.3, 1);
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const k = 1 - p.t / p.life;
      if (p.kind === 'spark') {
        ctx.fillStyle = `rgba(243,231,236,${k})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(130,90,109,${k * 0.6})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.5 - k), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.beginPath();
        ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.8, p.size * 0.5); ctx.lineTo(-p.size * 0.7, p.size * 0.6); ctx.closePath();
        if (p.kind === 'glass') { ctx.fillStyle = 'rgba(252,252,252,0.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(252,252,252,0.7)'; ctx.lineWidth = 1; ctx.stroke(); }
        else { ctx.fillStyle = p.col; ctx.fill(); }
        ctx.restore();
      }
    }
  }

  drawHUD(ctx) {
    const W = this.W;
    const m = magnitudeFor(this.distM, this.shards);
    const spacing = (px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; };
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(252,252,252,0.55)';
    ctx.font = '500 11px "Instrument Sans", sans-serif';
    spacing(2.2);
    ctx.fillText('MAGNITUDE', 24, 34);
    spacing(0);
    ctx.fillStyle = PAL.pearl;
    ctx.font = '500 42px "JetBrains Mono", monospace';
    ctx.fillText('M ' + m.toFixed(2), 22, 74);
    ctx.fillStyle = 'rgba(243,231,236,0.75)';
    ctx.font = 'italic 400 17px "Instrument Serif", serif';
    ctx.fillText(tierFor(m), 24, 96);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(252,252,252,0.82)';
    ctx.font = '500 15px "JetBrains Mono", monospace';
    ctx.fillText(Math.floor(this.distM).toLocaleString('en-US') + ' m', W - 24, 40);
    const sh = String(this.shards);
    ctx.fillText(sh, W - 24, 64);
    drawCrystal(ctx, W - 24 - ctx.measureText(sh).width - 13, 59, 7, 0, 1);
    for (let i = 0; i < 3; i++) {
      const cx = W - 30 - i * 18, cy = 88;
      const cracked = this.rocky.cracks > i;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 6, cy - 2); ctx.lineTo(cx + 4, cy + 7); ctx.lineTo(cx - 4, cy + 7); ctx.lineTo(cx - 6, cy - 2);
      ctx.closePath();
      if (cracked) { ctx.strokeStyle = 'rgba(252,252,252,0.3)'; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.fillStyle = 'rgba(243,231,236,0.9)'; ctx.fill(); }
    }
    ctx.fillStyle = 'rgba(252,252,252,0.45)';
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillText('zone ' + this.zone, W - 24, 114);

    if (this.banner) {
      const a = Math.min(1, this.banner.t);
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(252,252,252,${a})`;
      ctx.font = '500 13px "Instrument Sans", sans-serif';
      spacing(5);
      ctx.fillText('AFTERSHOCK', W / 2, 52);
      spacing(0);
      ctx.fillStyle = `rgba(194,154,175,${a})`;
      ctx.font = 'italic 400 22px "Instrument Serif", serif';
      ctx.fillText('zone ' + this.zone, W / 2, 80);
    }
    ctx.restore();
  }
}
