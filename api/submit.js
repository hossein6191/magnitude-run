// POST /api/submit { token, name, mode: 'endless'|'daily', dist, shards, zone, m, killer }
// → { ok, rank, best, board, date }
// Keeps one best entry per runner (name, case-insensitive) on each board. Sorted sets in Upstash Redis:
//   lb:global            member pid, score composite(m, dist)
//   lb:daily:<date>      same, expires after 3 days
//   pb:global:<pid>      JSON details for the listing
//   pb:daily:<date>:<pid>
import { send, preflight, readJson, redis, rateLimit, clientIp, verifyToken, validateRun, runnerFor, compositeScore, utcDate, dailySeed, TOKEN_TTL_MS } from './_lib/util.js';
import { magnitudeFor } from '../src/score.js';

const BOARD_MAX = 5000;
const DETAIL_TTL = 180 * 86400;

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const r = await redis();
  if (!r) return send(res, 503, { error: 'leaderboard offline', online: false });
  const body = await readJson(req);
  if (!body) return send(res, 400, { error: 'bad json' });
  // check the signature and the run before touching Redis: unsigned junk costs nothing
  const payload = verifyToken(body.token);
  if (!payload || payload.v !== 1) return send(res, 401, { error: 'bad token' });
  const now = Date.now();
  const why = validateRun(body, payload, now);
  if (why) return send(res, 422, { error: why });
  // the runner is the name: the same name on any device is the same board entry
  const who = runnerFor(body.name);
  if (!who) return send(res, 422, { error: 'name not allowed' });
  const pid = who.pid, name = who.name;
  const mode = body.mode === 'daily' ? 'daily' : 'endless';
  const date = mode === 'daily' ? String(payload.d || utcDate(now)) : utcDate(now);
  if (mode === 'daily' && payload.d !== utcDate(now) && payload.d !== utcDate(now - 86400000)) return send(res, 422, { error: 'daily token stale' });
  if (mode === 'daily' && Number(body.seed) !== dailySeed(date)) return send(res, 422, { error: 'wrong course' });
  const boardKey = mode === 'daily' ? `lb:daily:${date}` : 'lb:global';
  const detailKey = mode === 'daily' ? `pb:daily:${date}:${pid}` : `pb:global:${pid}`;

  // Rate limits. The per-player cap sits above what an honest client can post
  // (a run plus the restart gate is at least ~8 s, so ~75 posts in 10 min). The
  // pid is the client's own choice, so the per-IP caps are the real guard: a
  // wide one for shared Wi-Fi / carrier NAT, and one on NEW board entries per
  // board so rotating pids cannot flood a board (150 still fits a classroom).
  const ip = clientIp(req);
  if (!(await rateLimit(r, `submit:pid:${pid}`, 90, 600)) || !(await rateLimit(r, `submit:ip:${ip}`, 600, 600))) return send(res, 429, { error: 'slow down' });

  // A token is single-use. It is spent before the new-entry check so replays of a
  // used token cannot eat that budget, and handed back if the post is refused or
  // fails, so the client can send the same run again.
  const tokKey = `tok:${payload.n}`;
  const used = await r.set(tokKey, 1, { nx: true, ex: Math.ceil(TOKEN_TTL_MS / 1000) + 60 });
  if (used !== 'OK') return send(res, 409, { error: 'token used' });
  const giveBack = async () => { try { await r.del(tokKey); } catch (e) { /* the token then simply expires */ } };
  try {
    const prev = await r.zscore(boardKey, pid);
    if (prev == null && !(await rateLimit(r, `submit:new:${mode}:${ip}`, 150, 600))) { await giveBack(); return send(res, 429, { error: 'slow down' }); }

    const dist = Math.floor(Number(body.dist)), shards = Math.floor(Number(body.shards)), zone = Number(body.zone);
    // rank by the recomputed magnitude, never the client's number
    const m = magnitudeFor(Number(body.dist), shards);
    const score = compositeScore(m, dist);
    const improved = prev == null || score > Number(prev);
    const ttl = mode === 'daily' ? 3 * 86400 : DETAIL_TTL;
    if (improved) {
      await r.zadd(boardKey, { score, member: pid });
      await r.set(detailKey, JSON.stringify({ name, m: Number(m.toFixed(2)), dist, shards, zone, date, killer: String(body.killer || '').slice(0, 24) }), { ex: ttl });
      if (mode === 'daily') await r.expire(boardKey, 3 * 86400);
      // keep the board bounded: drop the lowest entries past the cap, details included
      const n = await r.zcard(boardKey);
      if (n > BOARD_MAX) {
        const over = (await r.zrange(boardKey, 0, n - BOARD_MAX - 1)).map(String);
        if (over.length) { await r.zrem(boardKey, ...over); await r.del(...over.map((id) => (mode === 'daily' ? `pb:daily:${date}:${id}` : `pb:global:${id}`))); }
      }
    } else {
      // keep the listing alive for as long as the player keeps playing, and let them rename
      const cur = await r.get(detailKey);
      const obj = cur ? (typeof cur === 'string' ? JSON.parse(cur) : cur) : { name, m: Math.floor(Number(prev) / 1e6) / 10000, dist: Number(prev) % 1e6, shards: 0, zone: 0, date, killer: '' };
      obj.name = name;
      await r.set(detailKey, JSON.stringify(obj), { ex: ttl });
    }
    const rank = await r.zrevrank(boardKey, pid);
    const total = await r.zcard(boardKey);
    await r.incr('stats:runs');
    return send(res, 200, { ok: true, improved, rank: rank == null ? null : rank + 1, total, board: mode, date });
  } catch (e) {
    // the store failed after the token was spent: hand it back so a retry can post the run
    await giveBack();
    return send(res, 500, { error: 'store failed' });
  }
}
