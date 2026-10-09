// Headless smoke test: runs the real game loop in Node with a stubbed DOM and
// a simple bot, checking for exceptions, NaNs, runaway entity counts and that
// the daily seed is deterministic.   node tools/smoke.mjs
import './smoke-env.mjs';
const fakeCanvas = globalThis.__fakeCanvas;
const noop = () => {};
const { Game } = await import('../src/game.js');
const { mulberry32 } = await import('../src/world.js');
const { HAZARDS } = await import('../src/hazards.js');
const { Missions } = await import('../src/missions.js');

const seen = new Set();
const events = new Map();
let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL', msg); };

function bot(game) {
  const r = game.rocky;
  const ahead = game.entities.filter((e) => e.alive !== false && HAZARDS[e.type] && HAZARDS[e.type].solid && e.x > r.x - 10 && e.x < r.x + 150);
  const gapAhead = game.gaps.find((g) => g.x > r.x - 10 && g.x < r.x + 120);
  let verb = null;
  for (const e of ahead) {
    const H = HAZARDS[e.type];
    if (e.type === 'watcher' && e.y < game.groundY - 120) continue;
    if (e.type === 'beamer' && !e.low) verb = 'down';
    else if (H.ceiling || e.type === 'moth') verb = 'down';
    else if (!verb) verb = 'jump';
  }
  if (gapAhead && !verb) verb = 'jump';
  return verb;
}

function runOnce({ mode, seed, seconds, label }) {
  const rnd = mulberry32(seed || 7); // the bot must be deterministic too
  const game = new Game(fakeCanvas(), {
    onStartRequest: noop, onOver: (res) => { game.__over = res; }, onPause: noop, onVibrate: noop,
    onEvent: (n, v) => events.set(n, (events.get(n) || 0) + v), onTick: noop,
  });
  game.start(mode, seed, '2026-01-01');
  const dt = 1 / 60;
  let t = 0, holdUntil = 0, downUntil = 0;
  try {
    while (t < seconds && game.state !== 'over') {
      for (const e of game.entities) seen.add(e.type);
      const verb = bot(game);
      if (verb === 'jump' && game.rocky.grounded && t > holdUntil) { game.jump(); holdUntil = t + 0.18; setTimeout(noop, 0); }
      if (verb === 'down' && t > downUntil) { game.down(); downUntil = t + 0.5; }
      if (t > holdUntil) game.jumpRelease();
      if (t > downUntil) game.downRelease();
      if (rnd() < 0.004 && !game.rocky.grounded) game.jump(); // occasional stomp
      game.update(dt, dt);
      if ((t * 60) % 15 < 1) game.draw();
      t += dt;
      const r = game.rocky;
      if (!Number.isFinite(r.y) || !Number.isFinite(r.vy)) { fail(`${label}: NaN in rocky at ${t.toFixed(2)}s`); break; }
      if (!Number.isFinite(game.distM)) { fail(`${label}: NaN distance`); break; }
      if (game.entities.length > 400) { fail(`${label}: ${game.entities.length} entities alive`); break; }
      if (game.particles.length > 3000) { fail(`${label}: ${game.particles.length} particles`); break; }
      if (r.y > game.groundY + 400) { fail(`${label}: Rocky fell out of the world`); break; }
    }
  } catch (e) { fail(`${label}: threw ${e.stack}`); return null; }
  const out = { dist: Math.round(game.distM), shards: game.shards, zone: game.zone, state: game.state, killer: game.killer, t: Math.round(t) };
  console.log(label, JSON.stringify(out));
  return out;
}

runOnce({ mode: 'endless', seed: 0, seconds: 90, label: 'endless-1' });
runOnce({ mode: 'endless', seed: 0, seconds: 90, label: 'endless-2' });
const a = runOnce({ mode: 'daily', seed: 123456789, seconds: 60, label: 'daily-a' });
const b = runOnce({ mode: 'daily', seed: 123456789, seconds: 60, label: 'daily-b' });
if (a && b && (a.dist !== b.dist || a.shards !== b.shards)) fail(`daily seed not deterministic: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

// Daily course across devices: screen width, refresh rate, frame jitter and what
// the player does (jumping or not, falling into gaps, Overclock) must not change
// the layout. Rocky is unkillable; every spawned item is logged in world px.
function courseLog({ W, dts, jumpy, label, targetM = 6000 }) {
  globalThis.innerWidth = W; globalThis.innerHeight = 540;
  const game = new Game(fakeCanvas(), { onStartRequest: noop, onOver: noop, onPause: noop, onVibrate: noop, onEvent: noop, onTick: noop });
  game.start('daily', 987654321, '2026-01-01');
  game.hurt = () => {};
  const log = [];
  const world = (x) => Math.round(x - game.rocky.x + game.distPx);
  const wrap = (name) => {
    const orig = game[name].bind(game);
    game[name] = (...a) => {
      const ne = game.entities.length, ng = game.gaps.length;
      const out = orig(...a);
      for (const e of game.entities.slice(ne)) log.push(`${e.type}@${world(e.x)}`);
      for (const g of game.gaps.slice(ng)) log.push(`gap@${world(g.x)}+${g.w}`);
      if (name === 'startEvent') log.push(`event:${game.event}`);
      return out;
    };
  };
  wrap('spawnPattern'); wrap('startEvent');
  const rnd = mulberry32(5);
  let i = 0;
  try {
    while (game.distM < targetM && i < 200000) {
      const dt = dts(i++);
      if (jumpy && game.rocky.grounded && rnd() < 0.04) game.jump();
      if (jumpy && rnd() < 0.05) game.jumpRelease();
      game.update(dt, dt);
      if (game.state !== 'playing') { fail(`${label}: run ended (${game.state})`); break; }
    }
  } catch (e) { fail(`${label}: threw ${e.stack}`); }
  const cut = targetM * PXM - 1200;
  return log.filter((s) => Number(s.split('@')[1]?.split('+')[0] ?? 0) < cut || s.startsWith('event:'));
}
const PXM = 8;
const jit = mulberry32(11);
const runs = [
  { W: 640, dts: () => 1 / 60, jumpy: false, label: 'phone-60hz-still' },
  { W: 1280, dts: () => 1 / 120, jumpy: true, label: 'wide-120hz-jumpy' },
  { W: 960, dts: () => 0.011 + jit() * 0.012, jumpy: true, label: 'mid-jitter-jumpy' },
  { W: 1169, dts: (i) => (i % 7 === 0 ? 0.05 : 1 / 90), jumpy: false, label: 'landscape-90hz-hitches' },
];
const logs = runs.map((r) => courseLog(r));
globalThis.innerWidth = 960; globalThis.innerHeight = 540;
const ref = logs[0];
const failsBefore = failures;
for (let k = 1; k < logs.length; k++) {
  const L = logs[k];
  const n = Math.min(ref.length, L.length);
  let bad = -1;
  for (let j = 0; j < n; j++) if (ref[j] !== L[j]) { bad = j; break; }
  if (bad >= 0) fail(`daily course differs on ${runs[k].label} at item ${bad}: ${ref[bad]} vs ${L[bad]}`);
  else if (Math.abs(ref.length - L.length) > 3) fail(`daily course length differs on ${runs[k].label}: ${ref.length} vs ${L.length}`);
}
if (failures === failsBefore) console.log('daily course across devices:', ref.length, 'items,', ref.filter((s) => s.startsWith('event:')).length, 'events, identical on', logs.length, 'setups');

// Mechanics regressions. A clean field: nothing spawns, no set-pieces, speed set by distance.
function field(distM, onEvent = noop) {
  const g = new Game(fakeCanvas(), { onStartRequest: noop, onOver: noop, onPause: noop, onVibrate: noop, onEvent, onTick: noop });
  g.start('endless', 0);
  g.aftershock = noop;
  g.distPx = distM * PXM; g.distM = distM; g.zone = Math.floor(distM / 600);
  g.entities = []; g.gaps = []; g.spawnCursor = 1e12;
  return g;
}
const step = (g, n = 1) => { for (let i = 0; i < n; i++) g.update(1 / 60, 1 / 60); };
try {
  // a JUMP pressed while falling just before touchdown jumps again on landing
  for (const before of [1, 3, 6, 8]) {
    const g = field(100), r = g.rocky;
    g.jump(); step(g, 3); g.jumpRelease();
    let frames = 0, pressed = false;
    while (!pressed && frames++ < 120) {
      // predict touchdown and press `before` frames ahead of it
      const ahead = []; let y = r.y, vy = r.vy;
      for (let k = 0; k < 20 && y < g.groundY; k++) { vy += 2929.7 * 1.5 / 60; y += vy / 60; ahead.push(y); }
      if (r.vy > 0 && ahead.length === before) { g.jump(); g.jumpRelease(); pressed = true; break; }
      step(g);
    }
    if (!pressed) fail(`buffered jump test never pressed (${before})`);
    let rose = false;
    for (let k = 0; k < before + 4; k++) { const wasFalling = r.vy > 0; step(g); if (wasFalling && r.vy < 0) rose = true; }
    if (!rose) fail(`buffered jump ${before} frame(s) before landing was swallowed`);
  }
  // a press buffered at death does not hop Rocky on the next run's first frame
  {
    const g = field(100);
    g.jumpBuf = 0.12; g.start('endless', 0); step(g);
    if (!g.rocky.grounded) fail('a jump buffered before death fired on the next run');
  }
  // the zone-1 watcher pair can be cleared by jumping, at zone-1 and zone-2 speeds
  for (const distM of [600, 1200]) {
    let clean = 0, tried = 0;
    for (let D = 40; D <= 200; D += 8) for (const hold of [0.12, 0.2, 0.3]) {
      const g = field(distM), r = g.rocky, G = g.groundY;
      let hits = 0; g.hurt = () => { hits++; };
      g.entities.push(HAZARDS.watcher.make(r.x + 600, g, G - 54), HAZARDS.watcher.make(r.x + 860, g, G - 54));
      let held = -1, t = 0;
      while (t < 4 && g.entities.some((e) => e.x > r.x - 40)) {
        const next = g.entities.filter((e) => e.x > r.x).sort((a, b) => a.x - b.x)[0];
        if (next && r.grounded && next.x - r.x < D && held < 0) { g.jump(); held = 0; }
        if (held >= 0) { held += 1 / 60; if (held > hold) { g.jumpRelease(); if (r.grounded) held = -1; } }
        step(g); t += 1 / 60;
      }
      tried++; if (!hits) clean++;
    }
    if (!clean) fail(`watcher pair cannot be jumped at ${distM} m`);
    console.log(`watcher pair at ${distM} m: ${clean}/${tried} jump timings clean`);
  }
  // jumping a golem and then stomping it counts one golem for missions
  {
    let golems = 0;
    const g = field(100, (n, v) => { if (n === 'golem') golems += v; }), r = g.rocky;
    g.hurt = noop;
    const golem = HAZARDS.golem.make(r.x + 95, g); g.entities.push(golem);
    g.jump(); let stomped = false;
    for (let k = 0; k < 120; k++) {
      if (k === 20) g.jumpRelease();
      if (!stomped && golem.x < r.x - 20 && !r.grounded) { g.jump(); stomped = true; }
      step(g);
    }
    if (golem.alive !== false) fail('golem test: the stomp did not shatter the golem');
    if (golems !== 1) fail(`one golem counted ${golems} times`);
  }
} catch (e) { fail(`mechanics threw ${e.stack}`); }

// Buffered tap height: a tap pressed in the air just before landing jumps as high as the same
// tap made on the ground (it used to give the minimum hop and could not clear a golem).
try {
  const peakOf = (early, hold) => {
    const g = field(100), r = g.rocky;
    if (early < 0) { g.jump(); let p = 0; for (let k = 0; k < 60; k++) { if (k === hold) g.jumpRelease(); step(g); p = Math.max(p, g.groundY - r.y); } return p; }
    g.jump(); step(g, 3); g.jumpRelease();
    for (let guard = 0; guard < 200; guard++) {
      let y = r.y, vy = r.vy, n = 0; while (y < g.groundY && n < 40) { vy += 2929.7 * 1.5 / 60; y += vy / 60; n++; }
      if (r.vy > 0 && n === early) break;
      step(g);
    }
    g.jump(); let p = 0, rose = false;
    for (let k = 0; k < 90; k++) { if (k === hold) g.jumpRelease(); const was = r.vy > 0; step(g); if (was && r.vy < 0) rose = true; if (rose) p = Math.max(p, g.groundY - r.y); }
    return p;
  };
  const ground = peakOf(-1, 6);
  for (const early of [4, 6, 8]) { const p = peakOf(early, 6); if (p < ground * 0.9) fail(`buffered 100 ms tap ${early} frames early peaks at ${p.toFixed(0)} px, ground tap ${ground.toFixed(0)} px`); }
} catch (e) { fail(`buffered tap threw ${e.stack}`); }

// Leaderboard API with the in-memory store: token reuse, the new-entry cap and store failures.
try {
  for (const k of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) delete process.env[k];
  process.env.MR_DEV_STORE = '1'; process.env.RUN_SECRET = 'smoke';
  const start = (await import('../api/start.js')).default;
  const submit = (await import('../api/submit.js')).default;
  const { redis } = await import('../api/_lib/util.js');
  const store = await redis();
  const call = async (h, ip, body) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s ? JSON.parse(s) : null; } };
    await h({ method: 'POST', headers: { 'x-forwarded-for': ip }, body: body || {} }, res);
    return { status: res.statusCode, body: res.body };
  };
  const pid = (i) => ('p' + String(i).padStart(15, '0')).slice(0, 16);
  const { magnitudeFor } = await import('../src/score.js');
  const m0 = magnitudeFor(0, 0);
  const run = (token, i) => ({ token, pid: pid(i), name: 'Smoke', mode: 'endless', dist: 0, shards: 0, zone: 0, m: m0, killer: '', seed: 0 });
  // 1) replaying a spent token with fresh pids never touches the new-entry budget
  const t1 = (await call(start, '10.0.0.1')).body.token;
  if ((await call(submit, '10.0.0.1', run(t1, 1))).status !== 200) fail('api: first post refused');
  let replay429 = 0;
  for (let i = 2; i < 200; i++) if ((await call(submit, '10.0.0.1', run(t1, i))).status === 429) replay429++;
  if (replay429) fail(`api: ${replay429} replays of a spent token were counted as new entries`);
  const fresh = (await call(start, '10.0.0.1')).body.token;
  if ((await call(submit, '10.0.0.1', run(fresh, 500))).status !== 200) fail('api: a new player was locked out by token replays');
  // 2) a post refused by the new-entry cap keeps its token
  let refused = null;
  for (let i = 1000; i < 1200 && !refused; i++) {
    const tk = (await call(start, '10.0.0.2')).body.token;
    const r = await call(submit, '10.0.0.2', run(tk, i));
    if (r.status === 429) refused = { tk, i };
  }
  if (!refused) fail('api: the new-entry cap never applied');
  else if ((await call(submit, '10.0.0.2', run(refused.tk, refused.i))).status === 409) fail('api: a refused post spent its token');
  // 3) a store failure after the token is spent hands it back, so the retry posts
  const tk3 = (await call(start, '10.0.0.3')).body.token;
  const zadd = store.zadd; let once = true;
  store.zadd = async (...a) => { if (once) { once = false; throw new Error('boom'); } return zadd.apply(store, a); };
  const f1 = await call(submit, '10.0.0.3', run(tk3, 3000));
  const f2 = await call(submit, '10.0.0.3', run(tk3, 3000));
  store.zadd = zadd;
  if (f1.status !== 500 || f2.status !== 200) fail(`api: store failure then retry gave ${f1.status} then ${f2.status}`);
  console.log('api: token reuse, new-entry cap and store failure ok');
} catch (e) { fail(`api threw ${e.stack}`); }

// long run: start deep in, keep Rocky invulnerable, and let every pattern and event scroll past
const g = new Game(fakeCanvas(), { onStartRequest: noop, onOver: noop, onEvent: noop, onTick: noop });
g.debugStart = 1200;
try {
  g.start('endless', 0);
  const rnd = mulberry32(99);
  let t = 0, maxEnt = 0, maxPart = 0;
  while (t < 240 && g.state !== 'over') {
    for (const e of g.entities) seen.add(e.type);
    g.rocky.inv = 5; g.rocky.cracks = 0; g.power.dash = Math.max(g.power.dash, 0.01);
    if (g.rocky.grounded && rnd() < 0.05) g.jump();
    if (rnd() < 0.02) g.down(); else if (rnd() < 0.05) g.downRelease();
    if (rnd() < 0.05) g.jumpRelease();
    g.update(1 / 60, 1 / 60); if ((t * 60) % 15 < 1) g.draw(); t += 1 / 60;
    maxEnt = Math.max(maxEnt, g.entities.length); maxPart = Math.max(maxPart, g.particles.length);
    if (!Number.isFinite(g.rocky.y)) { fail('deep run NaN'); break; }
  }
  console.log('deep', JSON.stringify({ dist: Math.round(g.distM), zone: g.zone, state: g.state, maxEntities: maxEnt, maxParticles: maxPart }));
  if (g.state === 'over') fail('invulnerable deep run ended');
} catch (e) { fail(`deep run threw ${e.stack}`); }

// missions module round trip
try {
  const ms = new Missions();
  ms.runStart('endless');
  ms.runTick({ m: 2, dist: 900, zone: 1 });
  ms.track('shard', 20); ms.track('watcher', 3); ms.track('crack', 1);
  const r = ms.runEnd({ m: 3.1, dist: 1200, shards: 20, zone: 2, mode: 'endless', duration: 40 });
  if (!r || !Array.isArray(r.completed)) fail('missions.runEnd shape');
  if (ms.list().length !== 3) fail('missions.list() should be 3');
} catch (e) { fail(`missions threw ${e.stack}`); }

const expectTypes = ['golem', 'spire', 'watcher', 'beamer', 'fang', 'moth', 'probe', 'burrower', 'vent', 'rock', 'shard', 'power'];
for (const ty of expectTypes) if (!seen.has(ty)) fail('hazard never spawned: ' + ty);
console.log('hazards seen:', [...seen].sort().join(' '));
console.log('events:', Object.fromEntries([...events].sort()));
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('smoke ok');
process.exit(0); // the music scheduler's interval would otherwise keep Node alive
