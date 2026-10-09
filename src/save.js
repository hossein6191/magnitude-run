// A runner's save: missions progress (rank, lanes, lifetime counters, skin) and
// the best runs. Shared by the browser and the /api/profile function, so both
// sides merge the same way.
//
// Merging takes the larger value of every counter and the union of finished
// missions. A save can only grow: whoever plays under a name can add to its
// progress but never erase it, and a phone and a laptop that both played
// converge on the furthest of the two.

export const SAVE_VERSION = 1;
const MAX_NUM = 1e12;
const KEY_RE = /^[a-z_]{1,24}$/;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_NUM) : 0;
};
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// { key: number } maps such as count/sum/max: per-key max, only sane keys
function mergeCounts(a, b) {
  const out = {};
  const keys = new Set([...Object.keys(obj(a)), ...Object.keys(obj(b))]);
  let n = 0;
  for (const k of keys) {
    if (!KEY_RE.test(k) || ++n > 64) continue;
    out[k] = Math.max(num(obj(a)[k]), num(obj(b)[k]));
  }
  return out;
}

function mergeLife(a, b) {
  a = obj(a); b = obj(b);
  const out = { count: mergeCounts(a.count, b.count), sum: mergeCounts(a.sum, b.sum), max: mergeCounts(a.max, b.max) };
  for (const k of ['runs', 'bestM', 'bestDist', 'bestZone', 'totalDist', 'playTime']) out[k] = Math.max(num(a[k]), num(b[k]));
  return out;
}

function mergeProgress(a, b) {
  a = obj(a); b = obj(b);
  const la = Array.isArray(a.lanes) ? a.lanes : [], lb = Array.isArray(b.lanes) ? b.lanes : [];
  const lanes = [];
  for (let i = 0; i < Math.min(8, Math.max(la.length, lb.length)); i++) {
    const x = obj(la[i]), y = obj(lb[i]);
    lanes.push({ idx: Math.floor(Math.max(num(x.idx), num(y.idx))), since: Math.floor(Math.max(num(x.since), num(y.since))) });
  }
  const done = [];
  for (const id of [...(Array.isArray(a.done) ? a.done : []), ...(Array.isArray(b.done) ? b.done : [])]) {
    if (typeof id === 'string' && id.length <= 40 && !done.includes(id)) done.push(id);
    if (done.length >= 400) break;
  }
  const skin = typeof b.skin === 'string' && b.skin.length <= 20 ? b.skin : typeof a.skin === 'string' && a.skin.length <= 20 ? a.skin : 'mauve';
  return { v: SAVE_VERSION, points: Math.max(num(a.points), num(b.points)), lanes, done, life: mergeLife(a.life, b.life), skin };
}

function cleanBest(v) {
  const o = obj(v);
  const m = Number(o.m);
  if (!Number.isFinite(m) || m <= 0) return null;
  const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : '';
  return { m: Math.min(m, 20), dist: num(o.dist), shards: Math.floor(num(o.shards)), date };
}
function betterBest(a, b) {
  a = cleanBest(a); b = cleanBest(b);
  if (!a) return b;
  if (!b) return a;
  return b.m > a.m ? b : a;
}
// the daily best only counts for its own day: a newer day replaces an older one
function betterDaily(a, b) {
  a = cleanBest(a); b = cleanBest(b);
  if (!a) return b;
  if (!b) return a;
  if (a.date !== b.date) return a.date > b.date ? a : b;
  return b.m > a.m ? b : a;
}

// Merge two saves (either may be null or malformed). b is the newer one: on the
// few fields that are a choice rather than a count (the skin), b wins.
export function mergeSave(a, b) {
  a = obj(a); b = obj(b);
  return {
    v: SAVE_VERSION,
    progress: mergeProgress(a.progress, b.progress),
    best: betterBest(a.best, b.best),
    bestDaily: betterDaily(a.bestDaily, b.bestDaily),
  };
}

// A short summary for the "welcome back" screen.
export function saveSummary(s) {
  s = obj(s);
  const p = obj(s.progress), life = obj(p.life), best = cleanBest(s.best);
  return { points: num(p.points), runs: Math.floor(num(life.runs)), bestM: best ? best.m : num(life.bestM), km: num(life.totalDist) / 1000 };
}
