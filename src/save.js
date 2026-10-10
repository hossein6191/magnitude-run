// A runner's save: missions progress (rank, lanes, lifetime counters, skin) and
// the best runs. Shared by the browser and the /api/profile function, so both
// sides merge the same way.
//
// Merging takes the larger value of every counter and the union of finished
// missions. A save can only grow: whoever plays under a name can add to its
// progress but never erase it, and a phone and a laptop used in turn converge
// on the furthest of the two. Every value is clamped to what the game can
// produce, so a hand-made save cannot pin a runner's records out of reach.
import { EVENTS, pointsFor, maxLaneIdx, LANE_COUNT } from './missions.js';

export const SAVE_VERSION = 1;
const MAX_NUM = 1e9;
const MAX_M = 9.9;   // magnitudeFor never goes higher

const num = (v, cap = MAX_NUM) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, cap) : 0;
};
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// { event: number } maps such as count/sum/max: per-event max, the game's events only
function mergeCounts(a, b) {
  const out = {};
  for (const k of EVENTS) out[k] = Math.max(num(obj(a)[k]), num(obj(b)[k]));
  return out;
}

function mergeLife(a, b) {
  a = obj(a); b = obj(b);
  const out = { count: mergeCounts(a.count, b.count), sum: mergeCounts(a.sum, b.sum), max: mergeCounts(a.max, b.max) };
  const caps = { runs: 1e7, bestM: MAX_M, bestDist: 1e6, bestZone: 2000, totalDist: 1e10, playTime: 1e9 };
  for (const k of Object.keys(caps)) out[k] = Math.max(num(a[k], caps[k]), num(b[k], caps[k]));
  return out;
}

function mergeProgress(a, b) {
  a = obj(a); b = obj(b);
  const la = Array.isArray(a.lanes) ? a.lanes : [], lb = Array.isArray(b.lanes) ? b.lanes : [];
  const life = mergeLife(a.life, b.life);
  const lanes = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const x = obj(la[i]), y = obj(lb[i]);
    // 'since' is a run number: it can never be past the runs played
    lanes.push({ idx: Math.floor(Math.max(num(x.idx, maxLaneIdx(i)), num(y.idx, maxLaneIdx(i)))), since: Math.floor(Math.min(life.runs, Math.max(num(x.since), num(y.since)))) });
  }
  const done = [];
  for (const id of [...(Array.isArray(a.done) ? a.done : []), ...(Array.isArray(b.done) ? b.done : [])]) {
    if (typeof id === 'string' && id.length <= 40 && !done.includes(id)) done.push(id);
    if (done.length >= 400) break;
  }
  const skin = typeof b.skin === 'string' && b.skin.length <= 20 ? b.skin : typeof a.skin === 'string' && a.skin.length <= 20 ? a.skin : 'mauve';
  // points follow from the lanes, so merged missions and points always agree
  return { v: SAVE_VERSION, points: pointsFor(lanes), lanes, done, life, skin };
}

// today: the server's UTC date; a best dated after it is refused (it would win every
// later daily merge)
// clampFuture: the all-time best only records the day; a phone clock running ahead keeps
// the best and gets today's date instead of losing it
function cleanBest(v, today, clampFuture = false) {
  const o = obj(v);
  const m = Number(o.m);
  if (!Number.isFinite(m) || m <= 0) return null;
  let date = typeof o.date === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(o.date) ? o.date : '';
  if (today && date > today) { if (!clampFuture) return null; date = today; }
  return { m: Math.min(m, MAX_M), dist: num(o.dist, 1e6), shards: Math.floor(num(o.shards, 1e6)), date };
}
function betterBest(a, b, today) {
  a = cleanBest(a, today, true); b = cleanBest(b, today, true);
  if (!a) return b;
  if (!b) return a;
  return b.m > a.m ? b : a;
}
// the daily best only counts for its own day: a newer day replaces an older one
function betterDaily(a, b, today) {
  a = cleanBest(a, today); b = cleanBest(b, today);
  if (!a) return b;
  if (!b) return a;
  if (a.date !== b.date) return a.date > b.date ? a : b;
  return b.m > a.m ? b : a;
}

// Merge two saves (either may be null or malformed). b is the newer one: on the
// few fields that are a choice rather than a count (the skin), b wins.
// opts.today (the server passes its UTC date) refuses bests dated in the future.
export function mergeSave(a, b, opts = {}) {
  a = obj(a); b = obj(b);
  return {
    v: SAVE_VERSION,
    progress: mergeProgress(a.progress, b.progress),
    best: betterBest(a.best, b.best, opts.today),
    bestDaily: betterDaily(a.bestDaily, b.bestDaily, opts.today),
  };
}

// A short summary for the "welcome back" screen.
export function saveSummary(s) {
  s = obj(s);
  const p = obj(s.progress), life = obj(p.life), best = cleanBest(s.best);
  return { points: pointsFor(Array.isArray(p.lanes) ? p.lanes : []), runs: Math.floor(num(life.runs)), bestM: best ? best.m : num(life.bestM, MAX_M), km: num(life.totalDist) / 1000 };
}
