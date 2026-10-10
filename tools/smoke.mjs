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

// A press in the air is always either a stomp or the next jump (no window where it does nothing).
try {
  const outcomes = new Set();
  for (let at = 2; at <= 26; at += 1) {
    const g = field(100), r = g.rocky;
    g.jump(); step(g, 7); g.jumpRelease();   // a 110 ms tap
    step(g, at);
    if (r.grounded) continue;
    g.jump(); g.jumpRelease();
    let stomp = r.stomping, again = false;
    for (let k = 0; k < 60 && !again; k++) { const was = r.vy > 0 || r.grounded; step(g); if (was && r.vy < 0 && !r.grounded) again = true; stomp = stomp || r.stomping; }
    const o = stomp ? 'stomp' : again ? 'jump' : 'nothing';
    outcomes.add(o);
    if (o === 'nothing') { fail(`a press ${at} frames into a tap jump did nothing`); break; }
  }
} catch (e) { fail(`air press threw ${e.stack}`); }

// Slides: lifting DOWN then jumping is a full jump; a DOWN pressed again during the
// short lock after a slide still slides; a JUMP pressed while falling into a fault line
// is kept for the pull-out.
try {
  const apex = (g) => { let p = 0; for (let k = 0; k < 60; k++) { step(g); p = Math.max(p, g.groundY - g.rocky.y); } return p; };
  const ref = field(100); ref.jump(); step(ref, 24); ref.jumpRelease(); const full = apex(ref);
  const g1 = field(100); g1.down(); step(g1, 36); g1.downRelease(); step(g1, 2); g1.jump(); step(g1, 24); g1.jumpRelease();
  const p1 = apex(g1) ; if (p1 < full * 0.95) fail(`jump right after lifting a slide is low: ${p1.toFixed(0)} vs ${full.toFixed(0)}`);
  const g2 = field(100); g2.down(); step(g2, 36); g2.downRelease(); step(g2, 10); g2.down(); let up = 0;
  for (let k = 0; k < 20; k++) { step(g2); if (!g2.rocky.sliding) up++; }
  if (up > 10) fail(`a DOWN pressed again after a slide left Rocky standing for ${up} frames`);
  const g3 = field(100); g3.gaps.push({ type: 'gap', x: g3.rocky.x + 30, w: 220 });
  let pressed = false;
  for (let k = 0; k < 120; k++) { step(g3); if (!pressed && g3.rocky.y > g3.groundY + 20) { g3.jump(); g3.jumpRelease(); pressed = true; if (!Number.isFinite(g3.jumpBuf)) fail('a press over a fault line set a NaN jump buffer'); } }
} catch (e) { fail(`slide/gap checks threw ${e.stack}`); }

// A lane at its cap is finished: nothing is awarded again run after run.
try {
  const { maxLaneIdx } = await import('../src/missions.js');
  const ms = new Missions('smoke-progress');
  ms.load({ v: 1, lanes: [{ idx: maxLaneIdx(0), since: 0 }, { idx: 0, since: 0 }, { idx: 0, since: 0 }], done: [], life: { runs: 5, count: {}, sum: { shard: 1e6 }, max: {} } });
  ms.runStart('endless');
  const res = ms.runEnd({ m: 1, dist: 10, shards: 0, zone: 0, mode: 'endless', duration: 5 });
  if (res.completed.some((c) => c.id.startsWith('cycle-shards'))) fail('a capped lane awarded a mission again');
  if (ms.state.lanes[0].idx !== maxLaneIdx(0)) fail('a capped lane moved past its cap');
} catch (e) { fail(`lane cap threw ${e.stack}`); }

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
  const { magnitudeFor } = await import('../src/score.js');
  const m0 = magnitudeFor(0, 0);
  // a runner is their name, so each player gets their own
  const run = (token, i) => ({ token, name: 'Runner' + i, mode: 'endless', dist: 0, shards: 0, zone: 0, m: m0, killer: '', seed: 0 });
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

  // 4) a runner is their name: case does not matter, one board entry per name
  const board = (await import('../api/board.js')).default;
  const getBoard = async (name) => {
    const res = { statusCode: 0, setHeader() {}, end(s) { this.body = JSON.parse(s); } };
    await board({ method: 'GET', headers: { 'x-forwarded-for': '10.0.0.9' }, url: `/api/board?board=global&limit=50&name=${encodeURIComponent(name)}` }, res);
    return res.body;
  };
  const tA = (await call(start, '10.0.0.4')).body.token, tB = (await call(start, '10.0.0.4')).body.token;
  await call(submit, '10.0.0.4', { ...run(tA, 0), name: 'Sara' });
  await call(submit, '10.0.0.4', { ...run(tB, 0), name: 'sara' });
  const bd = await getBoard('SARA');
  if (bd.entries.filter((e) => e.name.toLowerCase() === 'sara').length !== 1) fail('api: Sara and sara are two board entries');
  if (!bd.you) fail('api: the board does not find the runner by name');
  for (const bad of ['', 'x', 'Rocky', 'rocky', '!!']) {
    const tk = (await call(start, '10.0.0.4')).body.token;
    if ((await call(submit, '10.0.0.4', { ...run(tk, 0), name: bad })).status !== 422) fail(`api: name '${bad}' was accepted`);
  }

  // 5) profiles: same name on another device gets the save back, and a save only grows
  const profile = (await import('../api/profile.js')).default;
  const prof = async (method, ip, q, body) => {
    const res = { statusCode: 0, setHeader() {}, end(s) { this.body = s ? JSON.parse(s) : null; } };
    await profile({ method, headers: { 'x-forwarded-for': ip }, url: '/api/profile' + (q || ''), body }, res);
    return { status: res.statusCode, body: res.body };
  };
  const progress = { v: 1, points: 120, lanes: [{ idx: 4, since: 9 }, { idx: 2, since: 9 }, { idx: 3, since: 9 }], done: ['shards-15', 'watchers-2'], life: { count: { shard: 10 }, sum: { shard: 300 }, max: {}, runs: 9, bestM: 3.2, bestDist: 900, bestZone: 1, totalDist: 4000, playTime: 300 }, skin: 'mauve' };
  const save = { v: 1, progress, best: { m: 3.2, dist: 900, shards: 30, date: '2026-10-09' }, bestDaily: null };
  const g0 = await prof('GET', '10.0.0.5', '?name=Mina');
  if (!g0.body.online || g0.body.exists) fail('api: a new name already has a profile');
  const p1 = await prof('POST', '10.0.0.5', '', { name: 'Mina', save });
  if (!p1.body.ok || !p1.body.created) fail('api: first profile save failed');
  const g1 = await prof('GET', '10.0.0.6', '?name=MINA');   // another device, other case
  if (!g1.body.exists || !g1.body.save || g1.body.save.progress.points !== 120 || g1.body.save.best.m !== 3.2) fail('api: the same name on another device did not get the save back');
  const wipe = { v: 1, progress: { v: 1, points: 0, lanes: [], done: [], life: {}, skin: 'rose' }, best: null, bestDaily: null };
  const p2 = await prof('POST', '10.0.0.7', '', { name: 'mina', save: wipe });
  const after = p2.body.save;
  if (after.progress.points !== 120 || after.progress.lanes[0].idx !== 4 || after.progress.life.runs !== 9 || after.best.m !== 3.2 || !after.progress.done.includes('watchers-2')) fail('api: an empty save lowered a runner\'s progress');
  if ((await prof('GET', '10.0.0.5', '?name=Rocky')).status !== 422) fail('api: the anonymous name has a profile');
  console.log('api: runner names, boards by name and profiles ok');

  // 6) one runner on any keyboard: Persian and Arabic look-alikes fold together
  const { runnerFor } = await import('../api/_lib/util.js');
  for (const [x, y] of [['میلاد', 'ميلاد'], ['کیان', 'كيان'], ['Ali12', 'Ali۱۲'], ['علی', 'علي']]) {
    const a = runnerFor(x), b = runnerFor(y);
    if (!a || !b || a.pid !== b.pid) fail(`api: '${x}' and '${y}' are different runners`);
  }
  // 7) a stranger cannot use up a runner's posts from another address
  const tReplay = (await call(start, '10.1.0.1')).body.token;
  await call(submit, '10.1.0.1', { ...run(tReplay, 0), name: 'Victim' });
  for (let i = 0; i < 120; i++) await call(submit, '10.1.0.1', { ...run(tReplay, 0), name: 'Victim' });
  const tReal = (await call(start, '10.1.0.2')).body.token;
  const real = await call(submit, '10.1.0.2', { ...run(tReal, 0), name: 'Victim' });
  if (real.status !== 200) fail(`api: a stranger blocked a runner's post (${real.status})`);
  // 8) a row from before runner names moves to the runner, keeping the better score
  await store.zadd('lb:global', { score: 9e15, member: 'LegacyRow123456x' });
  await store.set('pb:global:LegacyRow123456x', JSON.stringify({ name: 'Old Timer', m: 6.1, dist: 5000, shards: 10, zone: 8, date: '2026-10-01', killer: '' }));
  const tL = (await call(start, '10.1.0.3')).body.token;
  await call(submit, '10.1.0.3', { ...run(tL, 0), name: 'old timer', legacyPid: 'LegacyRow123456x' });
  const lb = await getBoard('Old Timer');
  const rows = lb.entries.filter((e) => e.name.toLowerCase() === 'old timer');
  if (rows.length !== 1 || !rows[0].you || rows[0].m !== 6.1) fail(`api: legacy row not moved to the runner: ${JSON.stringify(rows)}`);
  // 9) two devices saving at once both count (the write lock)
  const devA = { v: 1, progress: { v: 1, lanes: [{ idx: 3, since: 2 }, { idx: 0, since: 0 }, { idx: 0, since: 0 }], done: ['a'], life: { runs: 3 } }, best: { m: 3, dist: 600, shards: 5, date: '2026-10-01' } };
  const devB = { v: 1, progress: { v: 1, lanes: [{ idx: 0, since: 0 }, { idx: 0, since: 0 }, { idx: 4, since: 2 }], done: ['b'], life: { runs: 2 } }, best: null };
  const get = store.get; store.get = async (k) => { const v = await get.call(store, k); await new Promise((ok) => setTimeout(ok, 20)); return v; };
  await Promise.all([prof('POST', '10.1.0.4', '', { name: 'Twin', save: devA }), prof('POST', '10.1.0.5', '', { name: 'Twin', save: devB })]);
  store.get = get;
  const twin = (await prof('GET', '10.1.0.4', '?name=Twin')).body.save;
  if (twin.progress.lanes[0].idx !== 3 || twin.progress.lanes[2].idx !== 4 || !twin.best) fail(`api: simultaneous saves lost one device: ${JSON.stringify(twin.progress.lanes)}`);
  // 10) a hand-made save is clamped: no future daily best, lanes within reach, sane magnitude
  const evil = { v: 1, progress: { v: 1, lanes: [{ idx: 1e12, since: 1e12 }, { idx: 1e12, since: 1e12 }, { idx: 1e12, since: 1e12 }], life: { runs: 1, count: { junk: 5 } } }, best: { m: 99, date: '2026-10-01' }, bestDaily: { m: 5, date: '2999-01-01' } };
  const ev = (await prof('POST', '10.1.0.6', '', { name: 'Target', save: evil })).body.save;
  if (ev.bestDaily || ev.best.m > 9.9 || ev.progress.lanes[0].idx > 60 || ev.progress.lanes[0].since > 1 || 'junk' in ev.progress.life.count) fail(`api: a hostile save was not clamped: ${JSON.stringify(ev).slice(0, 300)}`);
  let deep = []; for (let i = 0; i < 100000; i++) deep = [deep];
  const dn = await prof('POST', '10.1.0.7', '', { name: 'Deep', save: deep });
  if (dn.status !== 400 && dn.status !== 413) fail(`api: a deeply nested save gave ${dn.status}`);
  console.log('api: keyboards, per-address caps, legacy rows, simultaneous saves, hostile saves ok');

  // 11) a stranger cannot use up a runner's saves from another address
  await prof('POST', '10.2.0.1', '', { name: 'Keeper', save: devA });
  for (let i = 0; i < 125; i++) await prof('POST', '10.2.6.6', '', { name: 'Keeper', save: devB });
  if ((await prof('POST', '10.2.0.1', '', { name: 'Keeper', save: devA })).status !== 200) fail('api: a stranger blocked a runner\'s saves');
  // 12) a save and a board row kept under an older, unfolded id are found and moved
  const { createHash } = await import('node:crypto');
  const oldId = createHash('sha256').update('runner:' + 'ali۱۲').digest('base64url').slice(0, 16);
  await store.set(`pf:${oldId}`, JSON.stringify({ name: 'Ali۱۲', save: devA, at: 1 }));
  await store.zadd('lb:global', { score: 8e15, member: oldId });
  await store.set(`pb:global:${oldId}`, JSON.stringify({ name: 'Ali۱۲', m: 5.5, dist: 4000, shards: 9, zone: 6, date: '2026-10-09', killer: '' }));
  const gOld = (await prof('GET', '10.2.0.2', '?name=Ali12')).body;
  if (!gOld.exists) fail('api: a save under an older id was not found');
  await prof('POST', '10.2.0.2', '', { name: 'Ali12', save: devB });
  if (await store.get(`pf:${oldId}`)) fail('api: the older save was not moved');
  const tO = (await call(start, '10.2.0.2')).body.token;
  await call(submit, '10.2.0.2', { ...run(tO, 0), name: 'Ali12' });
  const alis = (await getBoard('Ali12')).entries.filter((e) => e.name.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0)).toLowerCase() === 'ali12');
  if (alis.length !== 1 || alis[0].m !== 5.5) fail(`api: the older board row was not moved: ${JSON.stringify(alis)}`);
  // 13) a row whose details are gone does not hold a rank
  await store.zadd('lb:global', { score: 9.9e15, member: 'GhostRow12345678' });
  const gb = await getBoard('Ali12');
  if (gb.entries[0] && gb.entries[0].rank !== 1) fail('api: the board starts below #1');
  if (gb.entries.some((e) => e.name === 'Rocky')) fail('api: an orphaned row is listed');
  console.log('api: per-address save caps, older ids, orphaned rows ok');
  // 14) a row whose details expired keeps its score and comes back from the runner's profile
  const keeperPid = runnerFor('Keeper').pid;
  await store.zadd('lb:global', { score: 7.5e15, member: keeperPid });
  await store.del(`pb:global:${keeperPid}`);
  const kb = await getBoard('Keeper');
  if (!kb.entries.some((e) => e.name === 'Keeper') || (await store.zscore('lb:global', keeperPid)) == null) fail('api: a row with expired details was dropped');
  console.log('api: expired details rebuilt ok');
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
