// Missions, lifetime stats, ranks and skin unlocks. Everything lives in one
// versioned localStorage key so a player keeps their progress across tabs
// and days. Mission order is fixed (no Math.random): every player starts
// with the same three easy missions and climbs the same ladder, the way the
// early Jetpack Joyride slots work.

const KEY = 'mr-progress';
const VERSION = 1;

// Event names the game emits through track(). Both per-run and lifetime
// counters are kept for each: count (times fired), sum (values) and max
// (largest single value, used for stomp combos).
export const EVENTS = [
  'shard', 'watcher', 'golem', 'fang', 'beam', 'burrower', 'probe', 'slide',
  'stomp', 'closecall', 'powerup', 'zone', 'crack', 'aftershock', 'daily',
];

// Rank ladder: points thresholds map to levels 1.0..9.0 with USGS-flavoured
// titles, echoing the "Magnitude" roles on the Seismic Discord.
export const RANK_THRESHOLDS = [0, 40, 100, 180, 290, 430, 600, 800, 1050];
export const RANK_TITLES = ['Micro', 'Minor', 'Light', 'Moderate', 'Strong', 'Major', 'Great', 'Epic', 'Cataclysmic'];

// Skins unlock at whole levels. 'mauve' is the brand default and always on.
export const SKINS = [
  { id: 'mauve', name: 'Mauve', level: 1 },
  { id: 'obsidian', name: 'Obsidian', level: 3 },
  { id: 'rose', name: 'Rose', level: 5 },
  { id: 'glass', name: 'Glass', level: 7 },
  { id: 'enclave', name: 'Enclave', level: 9 },
];

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);
const fmt = (n) => n.toLocaleString('en-US');

// ---- mission templates ----
// scope 'run': read from the run that is in progress (or just ended).
// scope 'life': read from lifetime totals, updated live as events arrive.
// prog(run, life) returns the raw number compared against goal.
const T = (id, text, points, goal, scope, prog, unit = 'count') => ({ id, text, points, goal, scope, prog, unit });
const runCount = (ev) => (r) => r.count[ev];
const runSum = (ev) => (r) => r.sum[ev];
const runMax = (ev) => (r) => r.max[ev];
const lifeCount = (ev) => (r, l) => l.count[ev];
const lifeSum = (ev) => (r, l) => l.sum[ev];
const runDist = (r) => r.dist;
const runM = (r) => r.m;
const runZone = (r) => Math.max(r.zone, r.count.zone);
// Distance covered before the first crack of the run. With no crack it is
// simply the run distance, so a clean run keeps counting to the end.
const runClean = (r) => (r.firstCrackDist == null ? r.dist : r.firstCrackDist);
const lifeDist = (r, l) => l.totalDist + (r.ended ? 0 : r.dist);
const lifeRuns = (r, l) => l.runs;

// Three lanes, each easy to hard, so the three active missions always mix
// collecting, fighting and surviving.
const LANES = [
  [
    T('shards-15', 'Collect 15 shards in one run', 10, 15, 'run', runSum('shard')),
    T('shards-40', 'Collect 40 shards in one run', 15, 40, 'run', runSum('shard')),
    T('powerups-3', 'Pick up 3 power-ups in one run', 15, 3, 'run', runCount('powerup')),
    T('shards-80', 'Collect 80 shards in one run', 25, 80, 'run', runSum('shard')),
    T('life-shards-500', 'Collect 500 shards (lifetime)', 30, 500, 'life', lifeSum('shard')),
    T('life-powerups-20', 'Pick up 20 power-ups (lifetime)', 30, 20, 'life', lifeCount('powerup')),
    T('shards-150', 'Collect 150 shards in one run', 40, 150, 'run', runSum('shard')),
    T('life-shards-2000', 'Collect 2,000 shards (lifetime)', 50, 2000, 'life', lifeSum('shard')),
    T('shards-250', 'Collect 250 shards in one run', 60, 250, 'run', runSum('shard')),
  ],
  [
    T('watchers-3', 'Shatter 3 Watchers in one run', 10, 3, 'run', runCount('watcher')),
    T('stomps-5', 'Stomp 5 times in one run', 10, 5, 'run', runCount('stomp')),
    T('slides-3', 'Slide under 3 Fangs in one run', 15, 3, 'run', runCount('slide')),
    T('combo-2', 'Shatter 2 Watchers with one stomp combo', 15, 2, 'run', runMax('stomp')),
    T('golems-5', 'Crack 5 Glass Golems in one run', 20, 5, 'run', runCount('golem')),
    T('life-watchers-25', 'Shatter 25 Watchers (lifetime)', 20, 25, 'life', lifeCount('watcher')),
    T('slides-6', 'Slide under 6 Fangs in one run', 25, 6, 'run', runCount('slide')),
    T('burrowers-4', 'Dodge 4 Burrowers in one run', 25, 4, 'run', runCount('burrower')),
    T('combo-3', 'Shatter 3 Watchers with one stomp combo', 30, 3, 'run', runMax('stomp')),
    T('probes-6', 'Dodge 6 Probes in one run', 30, 6, 'run', runCount('probe')),
    T('life-watchers-100', 'Shatter 100 Watchers (lifetime)', 35, 100, 'life', lifeCount('watcher')),
    T('life-fangs-50', 'Clear 50 Fangs (lifetime)', 35, 50, 'life', lifeCount('fang')),
    T('combo-5', 'Shatter 5 Watchers with one stomp combo', 45, 5, 'run', runMax('stomp')),
    T('watchers-15', 'Shatter 15 Watchers in one run', 45, 15, 'run', runCount('watcher')),
    T('life-watchers-500', 'Shatter 500 Watchers (lifetime)', 60, 500, 'life', lifeCount('watcher')),
  ],
  [
    T('dist-300', 'Run 300 m in one run', 10, 300, 'run', runDist, 'm'),
    T('zone-1', 'Reach zone 1', 10, 1, 'run', runZone, 'zone'),
    T('mag-3', 'Reach M 3.00', 15, 3, 'run', runM, 'M'),
    T('closecalls-2', 'Make 2 close calls in one run', 15, 2, 'run', runCount('closecall')),
    T('daily-1', 'Play the daily challenge', 20, 1, 'life', lifeCount('daily')),
    T('clean-800', 'Survive 800 m without a crack', 25, 800, 'run', runClean, 'm'),
    T('zone-3', 'Reach zone 3', 25, 3, 'run', runZone, 'zone'),
    T('closecalls-4', 'Make 4 close calls in one run', 30, 4, 'run', runCount('closecall')),
    T('life-km-10', 'Run 10 km (lifetime)', 30, 10000, 'life', lifeDist, 'km'),
    T('mag-5', 'Reach M 5.00', 30, 5, 'run', runM, 'M'),
    T('beams-5', 'Dodge 5 Beams in one run', 30, 5, 'run', runCount('beam')),
    T('life-daily-5', 'Play 5 daily challenges (lifetime)', 35, 5, 'life', lifeCount('daily')),
    T('clean-1500', 'Survive 1,500 m without a crack', 40, 1500, 'run', runClean, 'm'),
    T('zone-5', 'Reach zone 5', 40, 5, 'run', runZone, 'zone'),
    T('life-aftershocks-25', 'Ride out 25 aftershocks (lifetime)', 35, 25, 'life', lifeCount('aftershock')),
    T('life-runs-50', 'Finish 50 runs (lifetime)', 35, 50, 'life', lifeRuns),
    T('mag-7', 'Reach M 7.00', 50, 7, 'run', runM, 'M'),
    T('life-km-50', 'Run 50 km (lifetime)', 55, 50000, 'life', lifeDist, 'km'),
    T('clean-3000', 'Survive 3,000 m without a crack', 60, 3000, 'run', runClean, 'm'),
  ],
];

// Once a lane is exhausted it keeps producing lifetime missions with growing
// goals, so there are always three things to chase.
const CYCLES = [
  (n) => T(`cycle-shards-${n}`, `Collect ${fmt(3000 + 1000 * n)} shards (lifetime)`, 40, 3000 + 1000 * n, 'life', lifeSum('shard')),
  (n) => T(`cycle-watchers-${n}`, `Shatter ${fmt(750 + 250 * n)} Watchers (lifetime)`, 40, 750 + 250 * n, 'life', lifeCount('watcher')),
  (n) => T(`cycle-km-${n}`, `Run ${75 + 25 * n} km (lifetime)`, 40, (75 + 25 * n) * 1000, 'life', lifeDist, 'km'),
];

export const MISSIONS = LANES.flat();

function templateFor(lane, idx) {
  const list = LANES[lane];
  return idx < list.length ? list[idx] : CYCLES[lane](idx - list.length);
}

function label(unit, p, g) {
  if (unit === 'M') return `M ${p.toFixed(2)} / ${g.toFixed(2)}`;
  if (unit === 'm') return `${fmt(Math.floor(p))} / ${fmt(g)} m`;
  if (unit === 'km') return `${(p / 1000).toFixed(1)} / ${g / 1000} km`;
  if (unit === 'zone') return `zone ${Math.floor(p)} / ${g}`;
  return `${fmt(Math.floor(p))} / ${fmt(g)}`;
}

// ---- state ----
function zeros() {
  const o = {};
  for (const ev of EVENTS) o[ev] = 0;
  return o;
}
function counters(src) {
  const out = { count: zeros(), sum: zeros(), max: zeros() };
  if (!src) return out;
  for (const k of ['count', 'sum', 'max']) {
    const s = src[k] || {};
    for (const ev of EVENTS) out[k][ev] = Math.max(0, num(s[ev]));
  }
  return out;
}
function freshRun(no, mode) {
  return {
    ...counters(), no, mode, ended: false,
    m: 0, dist: 0, zone: 0, duration: 0, firstCrackDist: null,
  };
}
function freshLife(src) {
  const s = src || {};
  return {
    ...counters(s),
    runs: Math.max(0, Math.floor(num(s.runs))),
    bestM: num(s.bestM), bestDist: num(s.bestDist), bestZone: num(s.bestZone),
    totalDist: num(s.totalDist), playTime: num(s.playTime),
  };
}
function freshState(src) {
  const s = src && typeof src === 'object' && src.v === VERSION ? src : {};
  const lanes = LANES.map((_, i) => {
    const l = Array.isArray(s.lanes) && s.lanes[i] ? s.lanes[i] : {};
    return { idx: Math.max(0, Math.floor(num(l.idx))), since: Math.max(0, Math.floor(num(l.since))) };
  });
  return {
    v: VERSION,
    points: Math.max(0, num(s.points)),
    lanes,
    done: Array.isArray(s.done) ? s.done.filter((id) => typeof id === 'string') : [],
    life: freshLife(s.life),
    skin: typeof s.skin === 'string' ? s.skin : 'mauve',
  };
}

export class Missions {
  constructor() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* private mode or bad JSON */ }
    this.state = freshState(saved);
    this.life = this.state.life;
    // Before the first runStart the run counters are empty and belong to no
    // run, so per-run missions read 0 and lifetime ones read live totals.
    this.run = freshRun(this.life.runs, 'endless');
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* ignore */ }
  }

  // Wipe everything. Kept for a settings button; never called by the game.
  reset() {
    this.state = freshState(null);
    this.life = this.state.life;
    this.run = freshRun(0, 'endless');
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  // ---- run lifecycle ----
  runStart(mode = 'endless') {
    this.run = freshRun(this.life.runs + 1, mode === 'daily' ? 'daily' : 'endless');
    if (this.run.mode === 'daily') this.track('daily');
  }

  // Optional, cheap: call each frame (or whenever the HUD updates) so
  // distance, magnitude and zone missions show live progress and the
  // "without a crack" missions know how far Rocky got before the first hit.
  runTick({ m, dist, zone } = {}) {
    const r = this.run;
    if (r.ended) return;
    r.m = Math.max(r.m, num(m));
    r.dist = Math.max(r.dist, num(dist));
    r.zone = Math.max(r.zone, num(zone));
  }

  track(event, value = 1) {
    if (!EVENTS.includes(event)) return false;
    const v = num(value, 1);
    const r = this.run, l = this.life;
    r.count[event] += 1; r.sum[event] += v; r.max[event] = Math.max(r.max[event], v);
    l.count[event] += 1; l.sum[event] += v; l.max[event] = Math.max(l.max[event], v);
    if (event === 'crack' && r.firstCrackDist == null) r.firstCrackDist = r.dist;
    return true;
  }

  runEnd({ m, dist, shards, zone, mode, duration } = {}) {
    const r = this.run, l = this.life;
    const before = this.rank();
    if (r.ended) return { completed: [], points: 0, rankBefore: before, rankAfter: before, newUnlocks: [] };
    r.ended = true;
    r.m = Math.max(r.m, num(m));
    r.dist = Math.max(r.dist, num(dist));
    r.zone = Math.max(r.zone, num(zone));
    r.duration = num(duration);
    if (mode === 'daily' || mode === 'endless') r.mode = mode;
    // The game's shard total includes shatter bonuses; trust it over the
    // events if the integrator only tracked pickups.
    const extra = num(shards) - r.sum.shard;
    if (extra > 0) { r.sum.shard += extra; l.sum.shard += extra; }
    if (r.mode === 'daily' && r.count.daily === 0) this.track('daily');

    l.runs += 1;
    l.bestM = Math.max(l.bestM, r.m);
    l.bestDist = Math.max(l.bestDist, r.dist);
    l.bestZone = Math.max(l.bestZone, r.zone);
    l.totalDist += r.dist;
    l.playTime += r.duration;

    const unlocksBefore = this.unlocks();
    const completed = [];
    let earned = 0;
    // Evaluate until nothing new completes. A mission revealed by a
    // completion is stamped with this run number, so a per-run one only
    // starts counting from the next run while a lifetime one may finish now.
    for (let guard = 0; guard < 12; guard++) {
      let any = false;
      for (let i = 0; i < this.state.lanes.length; i++) {
        const lane = this.state.lanes[i];
        const t = templateFor(i, lane.idx);
        if (!this.evaluate(t, lane).done) continue;
        completed.push({ id: t.id, text: t.text, points: t.points });
        this.state.points += t.points;
        earned += t.points;
        this.state.done.push(t.id);
        lane.idx += 1; lane.since = r.no;
        any = true;
      }
      if (!any) break;
    }
    this.save();
    const after = this.rank();
    const newUnlocks = this.unlocks().filter((id) => !unlocksBefore.includes(id));
    return { completed, points: earned, rankBefore: before, rankAfter: after, newUnlocks };
  }

  evaluate(t, lane) {
    // A per-run mission assigned at the end of run N is gated until run N+1.
    const gated = t.scope === 'run' && this.run.no <= lane.since;
    const raw = gated ? 0 : num(t.prog(this.run, this.life));
    return { progress: Math.max(0, Math.min(t.goal, raw)), done: raw >= t.goal };
  }

  // ---- queries ----
  list() {
    return this.state.lanes.map((lane, i) => {
      const t = templateFor(i, lane.idx);
      const { progress, done } = this.evaluate(t, lane);
      return {
        id: t.id, text: t.text, progress, goal: t.goal, done, points: t.points,
        scope: t.scope, unit: t.unit, label: label(t.unit, progress, t.goal),
      };
    });
  }

  rank() {
    const p = this.state.points;
    let i = 0;
    while (i + 1 < RANK_THRESHOLDS.length && p >= RANK_THRESHOLDS[i + 1]) i++;
    const top = i === RANK_THRESHOLDS.length - 1;
    const lo = RANK_THRESHOLDS[i], hi = top ? null : RANK_THRESHOLDS[i + 1];
    const frac = top ? 1 : (p - lo) / (hi - lo);
    // One decimal, floored, so 39 points reads 1.9 and never rounds up to
    // a level whose title the player has not earned.
    const level = top ? 9 : Math.min(i + 1.9, Math.floor((i + 1 + frac) * 10) / 10);
    return { points: p, level, title: RANK_TITLES[i], nextAt: hi, progress: frac };
  }

  stats() {
    const l = this.life;
    return {
      runs: l.runs, bestM: l.bestM, bestDist: l.bestDist, bestZone: l.bestZone,
      totalDist: l.totalDist, playTime: l.playTime,
      shards: l.sum.shard, watchers: l.count.watcher, golems: l.count.golem,
      stomps: l.count.stomp, bestStomp: l.max.stomp, slides: l.count.slide,
      closecalls: l.count.closecall, powerups: l.count.powerup,
      dailyPlayed: l.count.daily, missions: this.state.done.length, points: this.state.points,
    };
  }

  unlocks() {
    const lvl = Math.floor(this.rank().level);
    return SKINS.filter((s) => s.level <= lvl).map((s) => s.id);
  }

  getSkin() {
    return this.unlocks().includes(this.state.skin) ? this.state.skin : 'mauve';
  }

  setSkin(id) {
    if (!this.unlocks().includes(id)) return false;
    this.state.skin = id;
    this.save();
    return true;
  }
}
