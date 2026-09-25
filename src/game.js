// Magnitude Run — core loop. Logical canvas is 540 tall; width follows the
// viewport (640..1280). Rocky stays at a fixed x and the world scrolls past.
//
// Verbs: JUMP (hold for height; in the air low = buffered jump, high = stomp)
//        DOWN (on the ground = slide; in the air = stomp).
// Feel:  coyote time 80 ms, jump buffer 100 ms, hit-stop 70 ms, slow-mo on death.

import { Rocky, drawCrystal, PAL, shatterPieces, applySkin } from './rocky.js';
import { Background, mulberry32, biomeForZone, BIOMES } from './world.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { magnitudeFor, tierFor } from './score.js';
import { HAZARDS, buildPatterns, buildEvent, pickWeighted, KILLER, POWERS, hintFor } from './hazards.js';

const LOGICAL_H = 540;
const PX_PER_M = 8;
const ZONE_M = 600;
const ROCKY_S = 0.9;
// jump: 150 px apex in 0.32 s -> g = 2h/t^2, v0 = 2h/t; falling is 1.5x heavier,
// releasing early cuts the jump (2.8x gravity until the apex)
const JUMP_H = 150, JUMP_T = 0.32;
const GRAV = (2 * JUMP_H) / (JUMP_T * JUMP_T), JUMP_V = -(2 * JUMP_H) / JUMP_T;
const FALL_MUL = 1.5, CUT_MUL = 2.8, FLOAT_MUL = 0.7, MAX_FALL = 1500, STOMP_G = 5200, DIVE_MUL = 3;
const COYOTE = 0.12, BUFFER = 0.15, DOWN_BUFFER = 0.12;
const SLIDE_MIN = 0.45, SLIDE_MAX = 1.0, SLIDE_COMMIT = 0.15;
const SPEED_BASE = 330, SPEED_CAP = 726;

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

export class Game {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.sfx = new Sfx();
    this.music = new Music(() => this.sfx.ctx, () => this.sfx.master);
    this.music.start();
    this.musicX = -1;
    this.bg = new Background();
    this.rocky = new Rocky();
    this.state = 'title';
    this.mode = 'endless';
    this.seed = 0;
    this.rng = Math.random;
    this.settings = { shake: true, hints: true };
    this.best = null;
    this.debugStart = 0;
    this.t = 0;
    this.last = performance.now();
    this.holding = false; this.holdT = 0; this.downHeld = false;
    this.power = { magnet: 0, dash: 0, amp: 0 };
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
    this.entities = []; this.gaps = []; this.particles = []; this.rings = []; this.popups = []; this.hints = [];
    this.trace = []; this.runTrace = []; this.nextTraceAt = 0; this.traceStep = 6;
    this.spawnCursor = this.W + 320;
    this.banner = null; this.shake = 0; this.vib = 0; this.deadT = 0; this.hitstop = 0; this.timeScale = 1;
    this.speed = 330; this.speedMul = 1;
    this.power = { magnet: 0, dash: 0, amp: 0 };
    this.chain = 0; this.chainT = 0; this.maxCombo = 1;
    this.nextPowerAt = 300 + this.rng() * 150;
    this.event = null; this.eventUntil = 0;
    this.killer = ''; this.startedAt = 0;
    this.seenHints = new Set();
    this.stats = { watchers: 0, golems: 0, closecalls: 0, powerups: 0, slides: 0, stomps: 0, stompBest: 0, vents: 0 };
    this.bg.setBiome(0); this.bg.fade = 1; this.bg.prev = -1;
    const r = this.rocky;
    r.reset();
    r.x = Math.round(this.W * (this.state === 'title' ? 0.72 : 0.28));
    r.y = this.groundY;
    for (let x = -10; x < r.x; x += 6) this.trace.push({ x, y: this.groundY });
  }

  start(mode = 'endless', seed = 0, date = null) {
    this.mode = mode;
    this.seed = seed;
    this.runDate = date || new Date().toISOString().slice(0, 10);
    this.tickT = 0;
    this.rng = mode === 'daily' ? mulberry32(seed) : Math.random;
    this.state = 'playing';
    this.reset();
    this.startedAt = performance.now();
    if (mode === 'endless' && this.debugStart > 0) { this.distPx = this.debugStart * PX_PER_M; this.distM = this.debugStart; this.zone = Math.floor(this.distM / ZONE_M); this.bg.setBiome(biomeForZone(this.zone)); this.bg.fade = 1; this.nextPowerAt = this.distM + 200; }
    this.rocky.setState('run');
    this.sfx.ensure();
    this.music.setDanger(0); this.music.setIntensity(0); this.music.setState('playing'); this.musicX = -1;
    this.hooks.onEvent && this.hooks.onEvent('run_start', 1);
  }

  // ---- input verbs ----
  jump() {
    if (this.state === 'title') { this.hooks.onStartRequest(); return; }
    if (this.state === 'paused') { this.togglePause(); return; }
    if (this.state !== 'playing') return;
    const r = this.rocky;
    if (r.dead) return;
    this.holding = true;
    this.jumpBuf = BUFFER;
    let mul = 1;
    if (r.sliding) { if (r.slideT < SLIDE_COMMIT) return; this.endSlide(); mul = 0.9; }
    const canJump = (r.grounded || (r.airT < COYOTE && !r.jumped)) && r.landLock <= 0;
    if (canJump) { this.doJump(mul); return; }
    if (!r.grounded && !r.stomping && !r.diving) {
      const low = r.vy > 0 && r.y > this.groundY - 110;
      if (!low) this.stomp();
    }
  }
  jumpRelease() { this.holding = false; }
  down() {
    if (this.state === 'paused') { this.togglePause(); return; }
    if (this.state !== 'playing') return;
    const r = this.rocky;
    if (r.dead) return;
    this.downHeld = true;
    this.downBuf = DOWN_BUFFER;
    if (r.grounded) { if (!r.sliding && r.landLock <= 0 && !(r.slideLock > 0)) this.startSlide(); }
    else if (!r.stomping && !r.diving && r.airT > 0.08) this.dive();
  }
  downRelease() { this.downHeld = false; }
  // a flick down right after a tap: take the jump back and slide instead
  swipe() {
    if (this.state !== 'playing') return;
    const r = this.rocky;
    if (!r.grounded && r.jumped && r.airT < 0.14 && r.vy < 0 && !r.stomping) {
      r.y = this.groundY; r.vy = 0; r.grounded = true; r.jumped = false; r.airT = 0; this.holding = false;
      this.downHeld = true; this.downBuf = 0;
      this.startSlide();
      return;
    }
    this.down();
  }
  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused'; this.holding = false; this.downHeld = false;
      this.music.stop();
      this.hooks.onPause && this.hooks.onPause(true);
    } else if (this.state === 'paused') {
      this.state = 'playing'; this.last = performance.now();
      this.music.start(); this.music.setState('playing');
      this.hooks.onPause && this.hooks.onPause(false);
    }
  }
  tick() {
    if (this.hooks.onTick) this.hooks.onTick({ m: magnitudeFor(this.distM, this.shards), dist: this.distM, zone: this.zone });
  }

  doJump(mul = 1) {
    const r = this.rocky;
    r.vy = JUMP_V * mul; this.holdT = 0; r.grounded = false; r.jumped = true; r.airT = 0; this.jumpBuf = 0; r.cut = false;
    this.sfx.jump();
  }
  stomp() {
    const r = this.rocky;
    r.stomping = true; r.diving = false;
    r.vy = Math.max(r.vy, 900);
    this.sfx.stompStart();
  }
  // DOWN in the air: fast fall that lands straight into a slide (no shockwave)
  dive() {
    const r = this.rocky;
    r.diving = true;
    r.vy = Math.max(r.vy, 0) + 1400;
    this.sfx.slide();
  }
  startSlide() {
    const r = this.rocky;
    r.sliding = true; r.slideT = 0;
    this.dust(r.x + 10, this.groundY, 5);
    this.sfx.slide();
    this.stats.slides++;
  }
  endSlide() { this.rocky.sliding = false; this.rocky.slideLock = 0.12; }
  // falling into a fault line costs a crack and puts Rocky back on the far edge
  fallIntoGap() {
    const r = this.rocky;
    const gp = this.gaps.find((g) => r.x > g.x - 20 && r.x < g.x + g.w + 20) || this.gaps[0];
    if (r.cracks >= 2 || !gp) { this.die('gap'); return; }
    const shift = gp.x + gp.w + 14 - r.x;
    for (const e of this.entities) e.x -= shift;
    for (const g of this.gaps) g.x -= shift;
    for (const s of this.trace) s.x -= shift;
    this.spawnCursor -= shift;
    this.distPx += shift;
    r.y = this.groundY; r.vy = 0; r.grounded = true; r.jumped = false; r.airT = 0; r.stomping = false; r.diving = false;
    this.hurt('gap');
    this.dust(r.x, this.groundY, 10);
    this.popup(r.x, this.groundY - 130, 'pulled out');
  }

  // ---- geometry ----
  rockyBox() {
    const r = this.rocky;
    if (r.sliding) return { x0: r.x - 14, y0: r.y - 44, x1: r.x + 20, y1: r.y - 2 };
    return { x0: r.x - 13, y0: r.y - 82, x1: r.x + 13, y1: r.y - 2 };
  }

  // ---- spawning ----
  spawnPattern() {
    const sp = this.speed;
    if (this.distM >= this.nextPowerAt) {
      this.nextPowerAt = this.distM + 280 + this.rng() * 200;
      const x = this.W + 80, G = this.groundY;
      const kinds = ['shield', 'magnet', 'dash', 'amp'];
      if (this.rocky.cracks > 0) kinds.push('repair', 'repair');
      if (this.rocky.shield) kinds.splice(kinds.indexOf('shield'), 1);
      const kind = pick(kinds, this.rng);
      this.entities.push(HAZARDS.power.make(x + 60, this, kind));
      for (let i = 0; i < 3; i++) this.entities.push(HAZARDS.shard.make(x + i * 40, this, G - 40));
      this.spawnCursor = x + 140 + sp * 0.9 + 100;
      return;
    }
    const pats = buildPatterns(this, this.rng);
    const zone = Math.min(this.zone, 6);
    const ok = pats.filter((p) => p.z <= zone && (this.distM > 110 || p.z === 0));
    const p = pickWeighted(ok, this.rng);
    for (const e of p.f()) { if (e.type === 'gap') this.gaps.push(e); else this.entities.push(e); }
    this.spawnCursor = this.W + 80 + p.w + sp * (0.85 + this.rng() * 0.55) + 40;
  }
  startEvent(kind) {
    const ev = buildEvent(kind, this, this.rng);
    for (const e of ev.entities) this.entities.push(e);
    this.event = ev.name;
    this.spawnCursor = this.W + 80 + ev.w + this.speed * 1.1 + 200;
    this.banner = { t: 2.2, title: 'AFTERSHOCK', sub: ev.name };
  }

  // ---- events ----
  land() {
    const r = this.rocky;
    if (r.stomping) {
      r.stomping = false; r.landLock = 0.26; r.inv = Math.max(r.inv, 0.3);
      this.rings.push({ x: r.x, y: this.groundY, r: 10, t: 0 });
      this.shake = Math.max(this.shake, 6);
      this.sfx.stomp();
      this.dust(r.x, this.groundY, 14);
      let n = 0;
      for (const e of this.entities) {
        if (!e.alive) continue;
        const H = HAZARDS[e.type];
        if (!H || !H.stompable) continue;
        const ex = e.x, ey = H.cy ? H.cy(e) : e.y;
        if (Math.hypot(ex - r.x, ey - this.groundY) < H.stompable) { this.shatter(e, H.bonus); n++; }
      }
      this.stats.stomps++;
      this.stats.stompBest = Math.max(this.stats.stompBest, n);
      this.emit('stomp', n);
      if (n >= 2) this.popup(r.x, this.groundY - 130, `combo x${n}`);
      if (n) this.hitstop = Math.max(this.hitstop, 0.06);
      this.hooks.onVibrate && this.hooks.onVibrate(n ? 40 : 20);
    } else if (r.diving) {
      r.diving = false; r.landLock = 0;
      this.dust(r.x, this.groundY, 8);
      this.startSlide(); r.slideT = this.downHeld ? 0 : SLIDE_MIN - 0.3;
    } else {
      r.landLock = 0.06;
      this.dust(r.x, this.groundY, 4);
      if (this.jumpBuf > 0) { this.jumpBuf = 0; r.landLock = 0; this.doJump(); return; }
      if ((this.downHeld || this.downBuf > 0) && !r.sliding) { this.downBuf = 0; this.startSlide(); }
    }
  }
  shatter(e, bonus, quiet = false) {
    if (!e.alive) return;
    e.alive = false;
    if (!quiet) {
      this.addShards(bonus, e.x, e.y);
      this.sfx.shatter();
      if (e.type === 'watcher' || e.type === 'beamer') { this.stats.watchers++; this.emit('watcher', 1); }
      if (e.type === 'golem' || e.type === 'spire') { this.stats.golems++; this.emit('golem', 1); }
    }
    const cy = HAZARDS[e.type] && HAZARDS[e.type].cy ? HAZARDS[e.type].cy(e) : e.y;
    for (let i = 0; i < (quiet ? 6 : 12); i++) {
      const a = this.rng() * 6.28, s = 80 + this.rng() * 240;
      this.particles.push({ kind: 'glass', x: e.x, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.5 + this.rng() * 0.4, t: 0, size: 3 + this.rng() * 5, rot: this.rng() * 6.28, vr: (this.rng() - 0.5) * 16 });
    }
  }
  addShards(n, x, y) {
    if (n <= 0) return;
    const mult = (1 + Math.min(3, Math.floor(this.chain / 5))) * (this.power.amp > 0 ? 2 : 1);
    this.shards += n * mult;
    this.emit('shard', n * mult);
    if (x != null) this.popup(x, y - 16, `+${n * mult}`);
  }
  hurt(type) {
    const r = this.rocky;
    if (r.shield) {
      r.shield = false; r.inv = 0.7; r.flash = 0.6;
      this.popup(r.x, r.y - 110, 'shield');
      this.sfx.shieldPop();
      this.spark(r.x, r.y - 50, 14);
      this.hooks.onVibrate && this.hooks.onVibrate(30);
      return;
    }
    r.cracks++; r.inv = 1.2; r.flash = 1; r.crackGlow = 1;
    this.chain = 0;
    this.tick();
    this.hitstop = 0.1; this.shake = Math.max(this.shake, 7);
    this.sfx.hit();
    this.music.setDanger(r.cracks);
    this.spark(r.x, r.y - 50, 8);
    this.emit('crack', 1);
    this.hooks.onVibrate && this.hooks.onVibrate(60);
    if (r.cracks >= 3) this.die(type);
    else this.popup(r.x, r.y - 110, 'crack');
  }
  die(type) {
    const r = this.rocky;
    if (r.dead) return;
    r.dead = true; r.sliding = false;
    this.killer = KILLER[type] || type;
    this.state = 'dying'; this.deadT = 0; this.timeScale = 0.3;
    this.holding = false; this.downHeld = false;
    this.particles.push(...shatterPieces(r.x, Math.min(r.y, this.groundY + 30), ROCKY_S));
    this.shake = 12;
    this.sfx.die();
    this.music.duck(1.0);
    this.hooks.onVibrate && this.hooks.onVibrate([80, 40, 120]);
  }
  aftershock() {
    this.shake = 10; this.vib = 1;
    this.sfx.aftershock();
    this.music.duck(0.8);
    this.emit('aftershock', 1); this.emit('zone', this.zone);
    this.bg.setBiome(biomeForZone(this.zone));
    this.hooks.onVibrate && this.hooks.onVibrate([60, 60, 60]);
    if (this.zone >= 2) {
      const kinds = ['tremor', 'swarm', 'rockfall', 'storm'];
      this.startEvent(kinds[(this.zone - 2) % kinds.length]);
    } else {
      this.banner = { t: 1.8, title: 'AFTERSHOCK', sub: `zone ${this.zone} · ${BIOMES[biomeForZone(this.zone)].name}` };
    }
  }
  closecall(e) {
    this.stats.closecalls++;
    this.addShards(2, e.x, (HAZARDS[e.type].cy ? HAZARDS[e.type].cy(e) : e.y) - 10);
    this.popup(this.rocky.x, this.rocky.y - 120, 'close call');
    this.sfx.closecall();
    this.emit('closecall', 1);
  }
  pickPower(e) {
    const P = POWERS[e.kind];
    const r = this.rocky;
    if (e.kind === 'shield') r.shield = true;
    else if (e.kind === 'magnet') this.power.magnet = P.dur;
    else if (e.kind === 'dash') { this.power.dash = P.dur; r.inv = Math.max(r.inv, 0.2); }
    else if (e.kind === 'amp') this.power.amp = P.dur;
    else if (e.kind === 'repair') { r.cracks = Math.max(0, r.cracks - 1); r.crackGlow = 0.4; }
    this.stats.powerups++;
    this.emit('powerup', 1);
    this.banner = { t: 1.6, title: P.name.toUpperCase(), sub: P.text };
    this.sfx.power();
    this.spark(e.x, e.y, 16);
    this.hooks.onVibrate && this.hooks.onVibrate(30);
  }
  onProbeLand(e) { this.dust(e.x, this.groundY, 8); this.shake = Math.max(this.shake, 3); this.sfx.thud(); }
  onBurrowerRise(e) { this.dust(e.x, this.groundY, 10); this.sfx.rise(); }
  onRockLand(e) { this.dust(e.x, this.groundY, 10); this.shake = Math.max(this.shake, 4); this.sfx.thud(); }
  finish() {
    this.state = 'over';
    this.music.setState('over');
    const m = magnitudeFor(this.distM, this.shards);
    this.hooks.onOver({
      m, tier: tierFor(m), dist: this.distM, shards: this.shards, zone: this.zone, mode: this.mode, seed: this.seed,
      killer: this.killer, duration: (performance.now() - this.startedAt) / 1000, maxCombo: this.maxCombo,
      stats: { ...this.stats }, trace: this.runTrace.slice(), date: this.runDate,
    });
  }
  emit(name, value) { if (this.hooks.onEvent) this.hooks.onEvent(name, value); }

  // ---- fx helpers ----
  popup(x, y, text) { this.popups.push({ x, y, text, t: 1 }); }
  spark(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 40 + Math.random() * 160;
      this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.3 + Math.random() * 0.4, t: 0, size: 2 + Math.random() * 2.5 });
    }
  }
  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      const s = 30 + Math.random() * 110, dir = Math.random() < 0.5 ? -1 : 1;
      this.particles.push({ kind: 'dust', x: x + dir * (4 + Math.random() * 10), y: y - 2, vx: dir * s, vy: -(20 + Math.random() * 70), life: 0.35 + Math.random() * 0.35, t: 0, size: 2 + Math.random() * 3 });
    }
  }

  // ---- loop ----
  loop(ts) {
    const raw = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    if (this.state !== 'paused') {
      const dt = raw * this.timeScale;
      const n = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (let i = 0; i < n; i++) { this.t += dt / n; this.update(dt / n, raw / n); }
    }
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt, rawDt) {
    if (this.hitstop > 0) { this.hitstop -= rawDt; return; }
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
      this.deadT += rawDt;
      this.timeScale = this.deadT < 0.45 ? 0.3 : 1;
      this.updateFx(dt, this.speed * 0.3);
      this.bg.update(dt, this.speed * 0.3);
      if (this.deadT > 1.25) this.finish();
      return;
    }

    // power timers
    for (const k of ['magnet', 'dash', 'amp']) if (this.power[k] > 0) this.power[k] = Math.max(0, this.power[k] - dt);
    this.speedMul = this.power.dash > 0 ? 1.5 : 1;
    // +1.5% of base per 100 m, +8% at every aftershock, hard cap; Overclock may exceed it
    this.speed = Math.min(780, Math.min(SPEED_CAP, SPEED_BASE + this.distM * 0.0495 + this.zone * 26.4) * this.speedMul);
    const sp = this.speed;
    const mx = Math.min(1, (this.speed / this.speedMul - SPEED_BASE) / (SPEED_CAP - SPEED_BASE));
    if (Math.abs(mx - this.musicX) > 0.03) { this.musicX = mx; this.music.setIntensity(mx); }
    this.distPx += sp * dt;
    this.distM = this.distPx / PX_PER_M;
    const z = Math.floor(this.distM / ZONE_M);
    if (z > this.zone) { this.zone = z; this.aftershock(); }
    this.tickT += dt;
    if (this.tickT >= 0.25) { this.tickT = 0; this.tick(); }
    this.bg.update(dt, sp);
    if (this.chainT > 0) { this.chainT -= dt; if (this.chainT <= 0) this.chain = 0; }

    // slide
    if (r.sliding) {
      r.slideT += dt;
      if ((r.slideT > SLIDE_MIN && !this.downHeld) || r.slideT > SLIDE_MAX) this.endSlide();
    }
    if (r.slideLock > 0) r.slideLock -= dt;
    if (this.jumpBuf > 0) this.jumpBuf -= dt;
    if (this.downBuf > 0) this.downBuf -= dt;

    // physics
    if (this.holding) this.holdT += dt;
    let g = GRAV;
    if (r.stomping) g = STOMP_G;
    else if (r.diving) g = GRAV * DIVE_MUL;
    else if (r.vy < 0) {
      if (!this.holding || this.holdT > 0.25) r.cut = true;
      if (r.cut) g = GRAV * CUT_MUL;
      else if (-r.vy < 0.15 * -JUMP_V) g = GRAV * FLOAT_MUL;
    } else g = GRAV * FALL_MUL;
    const prevY = r.y;
    r.vy = Math.min(r.stomping || r.diving ? 4000 : MAX_FALL, r.vy + g * dt);
    r.y += r.vy * dt;
    const bridged = this.power.dash > 0;
    const overGap = !bridged && this.gaps.some((gp) => r.x > gp.x + 8 && r.x < gp.x + gp.w - 8);
    if (r.y >= this.groundY) {
      if (!overGap && prevY <= this.groundY + 1) {
        if (!r.grounded) this.land();
        r.y = this.groundY; r.vy = 0; r.grounded = true; r.jumped = false; r.airT = 0;
      } else {
        r.grounded = false; r.airT += dt;
        if (r.sliding) this.endSlide();
        if (r.y > this.groundY + 120) this.fallIntoGap();
      }
    } else { r.grounded = false; r.airT += dt; }

    if (!r.dead) {
      if (r.grounded) r.setState(r.sliding ? 'slide' : this.power.dash > 0 ? 'dash' : r.landLock > 0 ? 'land' : 'run');
      else if (r.stomping || r.diving) r.setState('stomp');
      else r.setState(r.vy < 0 ? 'jump' : 'fall');
    }
    r.update(dt, sp, this.t);

    // world scroll + hazard logic
    for (const e of this.entities) {
      e.x -= sp * dt;
      const H = HAZARDS[e.type];
      if (H && H.update) H.update(e, this, dt);
      if (e.state === 'gone') e.alive = false;
    }
    for (const gp of this.gaps) gp.x -= sp * dt;
    this.entities = this.entities.filter((e) => e.alive !== false && e.x > -160);
    this.gaps = this.gaps.filter((gp) => gp.x + gp.w > -50);
    this.spawnCursor -= sp * dt;
    if (this.spawnCursor < this.W + 40) this.spawnPattern();

    this.collide();
    this.updateHints();
    this.updateTrace(dt, sp, false);
    this.updateFx(dt, sp);
    if (this.power.dash > 0 && Math.random() < 0.5) {
      this.particles.push({ kind: 'line', x: this.W + 10, y: 40 + Math.random() * (this.groundY - 60), vx: -sp * 2.2, vy: 0, life: 0.5, t: 0, size: 40 + Math.random() * 80 });
    }
  }

  collide() {
    const r = this.rocky;
    if (r.dead) return;
    const rb = this.rockyBox();
    const cx = r.x, cy = r.sliding ? r.y - 24 : r.y - 46 * ROCKY_S;
    for (const e of this.entities) {
      if (e.alive === false) continue;
      const H = HAZARDS[e.type];
      if (!H) continue;
      if (e.type === 'shard') {
        if (Math.hypot(e.x - cx, e.y - cy) < 32) {
          e.alive = false;
          this.chain++; this.chainT = 3; this.maxCombo = Math.max(this.maxCombo, 1 + Math.min(3, Math.floor(this.chain / 5)));
          this.addShards(1, e.x, e.y);
          this.sfx.shard(Math.min(8, Math.floor(this.chain / 2)));
          this.spark(e.x, e.y, 5);
        }
        continue;
      }
      if (e.type === 'power') {
        const [x0, y0, x1, y1] = H.box(e, this);
        if (rb.x1 > x0 && rb.x0 < x1 && rb.y1 > y0 && rb.y0 < y1) { e.alive = false; this.pickPower(e); }
        continue;
      }
      if (e.type === 'vent') {
        if (r.grounded && Math.abs(e.x - r.x) < 16 && e.fired <= 0) {
          e.fired = 0.7; r.vy = -1150; r.grounded = false; r.jumped = true; r.airT = 0; if (r.sliding) this.endSlide();
          this.sfx.vent(); this.stats.vents++; this.spark(e.x, this.groundY - 10, 12);
        }
        continue;
      }
      if (!H.solid) continue;
      if (e.type === 'probe' && e.state === 'aim') continue;
      if (e.type === 'rock' && e.state === 'warn') continue;
      if (e.type === 'burrower' && e.h <= 8) { if (e.state === 'warn') continue; }

      // near-miss bookkeeping
      const [bx0, by0, bx1, by1] = H.box(e, this);
      if (bx1 > rb.x0 - 4 && bx0 < rb.x1 + 4) {
        const gap = Math.max(by0 - rb.y1, rb.y0 - by1);
        e.minGap = e.minGap == null ? gap : Math.min(e.minGap, gap);
        if (r.sliding && H.ceiling) e.slidUnder = true;
        if (r.sliding && e.type === 'beamer') e.slidUnder = true;
      } else if (bx1 < rb.x0 - 4 && !e.passed) {
        e.passed = true;
        if (!e.touched && e.minGap != null && e.minGap >= 0 && e.minGap < 18) this.closecall(e);
        if (!e.touched && e.slidUnder) { this.emit('slide', 1); this.emit(e.type === 'beamer' ? 'beam' : e.type, 1); }
        if (!e.touched && (e.type === 'burrower' || e.type === 'probe' || e.type === 'moth' || e.type === 'rock' || e.type === 'golem' || e.type === 'spire')) this.emit(e.type === 'spire' ? 'golem' : e.type, 1);
        if (!e.touched && e.type === 'watcher' && e.minGap != null && e.minGap >= 0) this.emit('watcher_pass', 1);
      }

      if (!H.hit(e, rb, this)) continue;
      e.touched = true;
      if (this.power.dash > 0) { this.shatter(e, H.bonus || 1); continue; }
      if (r.stomping && H.stompable && (H.air || e.type === 'burrower' || e.type === 'probe' || e.type === 'rock')) { this.shatter(e, H.bonus); continue; }
      if (r.inv <= 0) this.hurt(e.type);
    }
  }

  updateHints() {
    if (!this.settings.hints) return;
    for (const e of this.entities) {
      const H = HAZARDS[e.type];
      if (!H || !H.solid || e.hinted) continue;
      if (e.x > this.W - 60) continue;
      e.hinted = true;
      const key = e.type === 'watcher' ? (e.y < this.groundY - 120 ? 'watcher_high' : 'watcher') : e.type;
      if (this.seenHints.has(key)) continue;
      this.seenHints.add(key);
      const text = hintFor(e, this);
      if (text) this.hints.push({ e, text, t: 0 });
    }
    for (const h of this.hints) h.t += 0.016;
    this.hints = this.hints.filter((h) => h.e.alive !== false && h.e.x > this.rocky.x - 40 && h.t < 4);
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
        if (this.runTrace.length > 900) { this.runTrace = this.runTrace.filter((_, i) => i % 2 === 0); this.traceStep *= 2; }
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
      const grav = p.kind === 'dust' ? 300 : p.kind === 'spark' ? -150 : p.kind === 'line' ? 0 : 1400;
      p.vy += grav * dt;
      p.x += (p.vx - (p.kind === 'line' ? 0 : sp * 0.6)) * dt; p.y += p.vy * dt;
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
    if (this.shake > 0 && this.settings.shake) ctx.translate((Math.random() - 0.5) * this.shake * 2, (Math.random() - 0.5) * this.shake * 2);
    this.bg.draw(ctx);
    this.drawGround(ctx);
    this.drawBestMarker(ctx);
    for (const e of this.entities) { const Hz = HAZARDS[e.type]; if (Hz) Hz.draw(e, ctx, this); }
    for (const rg of this.rings) {
      ctx.beginPath();
      ctx.ellipse(rg.x, rg.y, rg.r, rg.r * 0.32, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(243,231,236,${(1 - rg.t) * 0.8})`;
      ctx.lineWidth = 2.5 * (1 - rg.t) + 0.5;
      ctx.stroke();
    }
    if (this.power.dash > 0) this.drawDashTrail(ctx);
    this.rocky.draw(ctx, ROCKY_S, this.t);
    this.drawCompanion(ctx);
    this.drawParticles(ctx);
    for (const p of this.popups) {
      ctx.fillStyle = `rgba(243,231,236,${Math.min(1, p.t) * 0.95})`;
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    }
    this.drawHints(ctx);
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
      ctx.fillText('tap, or press Esc, to resume', W / 2, H / 2 + 22);
    }
  }

  drawGround(ctx) {
    const W = this.W, H = this.H, G = this.groundY, off = this.bg.scroll;
    ctx.fillStyle = this.bg.groundColor();
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
    const bridged = this.power.dash > 0;
    for (const gp of this.gaps) {
      ctx.fillStyle = '#0E0B0D';
      ctx.fillRect(gp.x, G, gp.w, H - G);
      const gr = ctx.createLinearGradient(0, G, 0, G + 90);
      gr.addColorStop(0, 'rgba(130,90,109,0.5)');
      gr.addColorStop(1, 'rgba(130,90,109,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(gp.x, G, 3, 90);
      ctx.fillRect(gp.x + gp.w - 3, G, 3, 90);
      if (bridged) { ctx.fillStyle = 'rgba(243,231,236,0.18)'; ctx.fillRect(gp.x, G - 2, gp.w, 4); }
    }
    const rx = this.rocky.x;
    const segs = [];
    let cursor = rx;
    const gaps = bridged ? [] : this.gaps.slice().sort((a, b) => a.x - b.x);
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

  drawBestMarker(ctx) {
    if (!this.best || !this.best.dist || this.state === 'title' || this.mode !== 'endless') return;
    const x = this.rocky.x + (this.best.dist * PX_PER_M - this.distPx);
    if (x < -40 || x > this.W + 40) return;
    const G = this.groundY;
    ctx.strokeStyle = 'rgba(194,154,175,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, G - 150); ctx.lineTo(x, G); ctx.stroke(); ctx.setLineDash([]);
    drawCrystal(ctx, x, G - 160, 9, 0, 1);
    ctx.fillStyle = 'rgba(194,154,175,0.9)'; ctx.font = '500 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(`best M ${this.best.m.toFixed(2)}`, x, G - 176);
  }

  drawCompanion(ctx) {
    const r = this.rocky;
    if (r.dead) return;
    const a = this.t * 2.6;
    const cx = r.x - 26 + Math.cos(a) * 16, cy = (r.sliding ? r.y - 60 : r.y - 104) + Math.sin(a) * 7 + Math.sin(this.t * 1.7) * 3;
    const glow = this.power.magnet > 0 ? 0.25 : 0.08;
    ctx.fillStyle = `rgba(243,231,236,${glow})`;
    ctx.beginPath(); ctx.arc(cx, cy, this.power.magnet > 0 ? 18 : 12, 0, Math.PI * 2); ctx.fill();
    drawCrystal(ctx, cx, cy, 7, Math.sin(this.t * 2) * 0.3, 1);
  }

  drawDashTrail(ctx) {
    const r = this.rocky;
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.18 / i;
      ctx.fillStyle = PAL.glow;
      ctx.fillRect(r.x - 12 - i * 16, r.y - 86, 24, 84);
    }
    ctx.globalAlpha = 1;
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
      } else if (p.kind === 'line') {
        ctx.strokeStyle = `rgba(243,231,236,${k * 0.35})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.size, p.y); ctx.stroke();
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

  drawHints(ctx) {
    for (const h of this.hints) {
      const e = h.e;
      const H = HAZARDS[e.type];
      const [, y0] = H.box(e, this);
      const top = Math.max(60, Math.min(this.groundY - 20, (e.type === 'fang' ? this.groundY - 70 : y0) - 26));
      const a = Math.min(1, h.t * 4) * (h.t > 3.2 ? Math.max(0, 4 - h.t) / 0.8 : 1);
      ctx.fillStyle = `rgba(243,231,236,${a})`;
      ctx.font = '600 12px "Instrument Sans", sans-serif';
      ctx.textAlign = 'center';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
      ctx.fillText(h.text, e.x, top);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.strokeStyle = `rgba(243,231,236,${a * 0.6})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(e.x, top + 6); ctx.lineTo(e.x, top + 16); ctx.stroke();
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
    ctx.fillText(this.mode === 'daily' ? 'MAGNITUDE · DAILY' : 'MAGNITUDE', 24, 34);
    spacing(0);
    ctx.fillStyle = PAL.pearl;
    ctx.font = '500 42px "JetBrains Mono", monospace';
    ctx.fillText('M ' + m.toFixed(2), 22, 74);
    ctx.fillStyle = 'rgba(243,231,236,0.75)';
    ctx.font = 'italic 400 17px "Instrument Serif", serif';
    ctx.fillText(tierFor(m), 24, 96);

    // right cluster
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(252,252,252,0.82)';
    ctx.font = '500 15px "JetBrains Mono", monospace';
    ctx.fillText(Math.floor(this.distM).toLocaleString('en-US') + ' m', W - 24, 40);
    const mult = (1 + Math.min(3, Math.floor(this.chain / 5))) * (this.power.amp > 0 ? 2 : 1);
    const sh = String(this.shards) + (mult > 1 ? `  x${mult}` : '');
    ctx.fillStyle = mult > 1 ? '#C29AAF' : 'rgba(252,252,252,0.82)';
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
    if (this.rocky.shield) { ctx.strokeStyle = 'rgba(243,231,236,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(W - 90, 88, 9, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = 'rgba(252,252,252,0.45)';
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillText(`zone ${this.zone} · ${BIOMES[biomeForZone(this.zone)].name}`, W - 24, 114);

    // power timers
    let py = this.H - 26;
    ctx.textAlign = 'left';
    for (const k of ['dash', 'magnet', 'amp']) {
      if (this.power[k] <= 0) continue;
      const P = POWERS[k], frac = this.power[k] / P.dur;
      ctx.fillStyle = 'rgba(252,252,252,0.7)'; ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillText(P.name, 24, py);
      ctx.fillStyle = 'rgba(252,252,252,0.15)'; ctx.fillRect(24, py + 5, 110, 3);
      ctx.fillStyle = '#C29AAF'; ctx.fillRect(24, py + 5, 110 * frac, 3);
      py -= 22;
    }

    if (this.banner) {
      const a = Math.min(1, this.banner.t);
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(252,252,252,${a})`;
      ctx.font = '500 13px "Instrument Sans", sans-serif';
      spacing(5);
      ctx.fillText(this.banner.title, W / 2, 52);
      spacing(0);
      ctx.fillStyle = `rgba(194,154,175,${a})`;
      ctx.font = 'italic 400 22px "Instrument Serif", serif';
      ctx.fillText(this.banner.sub, W / 2, 80);
    }
    ctx.restore();
  }
}
