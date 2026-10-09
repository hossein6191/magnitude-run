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
