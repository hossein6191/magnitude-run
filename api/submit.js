// POST /api/submit { token, pid, name, mode: 'endless'|'daily', dist, shards, zone, m, killer }
// → { ok, rank, best, board, date }
// Keeps one best entry per player id on each board. Sorted sets in Upstash Redis:
//   lb:global            member pid, score composite(m, dist)
//   lb:daily:<date>      same, expires after 3 days
//   pb:global:<pid>      JSON details for the listing
//   pb:daily:<date>:<pid>
import { send, preflight, readJson, redis, rateLimit, clientIp, verifyToken, validateRun, cleanName, cleanPid, compositeScore, utcDate } from './_lib/util.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const r = await redis();
  if (!r) return send(res, 503, { error: 'leaderboard offline', online: false });
  const ip = clientIp(req);
  if (!(await rateLimit(r, `submit:${ip}`, 40, 600))) return send(res, 429, { error: 'slow down' });

  const body = await readJson(req);
  if (!body) return send(res, 400, { error: 'bad json' });
  const payload = verifyToken(body.token);
  if (!payload || payload.v !== 1) return send(res, 401, { error: 'bad token' });
  const now = Date.now();
  const why = validateRun(body, payload, now);
  if (why) return send(res, 422, { error: why });

  // a token is single-use
  const used = await r.set(`tok:${payload.n}`, 1, { nx: true, ex: 6 * 3600 });
  if (used !== 'OK') return send(res, 409, { error: 'token used' });

  const pid = cleanPid(body.pid);
  if (!pid) return send(res, 400, { error: 'bad player id' });
  const name = cleanName(body.name);
  const mode = body.mode === 'daily' ? 'daily' : 'endless';
  const date = mode === 'daily' ? String(payload.d || utcDate(now)) : utcDate(now);
  if (mode === 'daily' && payload.d !== utcDate(now) && payload.d !== utcDate(now - 86400000)) return send(res, 422, { error: 'daily token stale' });

  const boardKey = mode === 'daily' ? `lb:daily:${date}` : 'lb:global';
  const detailKey = mode === 'daily' ? `pb:daily:${date}:${pid}` : `pb:global:${pid}`;
  const m = Number(body.m), dist = Math.floor(Number(body.dist)), shards = Math.floor(Number(body.shards)), zone = Number(body.zone);
  const score = compositeScore(m, dist);
  const prev = await r.zscore(boardKey, pid);
  const improved = prev == null || score > Number(prev);
  if (improved) {
    await r.zadd(boardKey, { score, member: pid });
    await r.set(detailKey, JSON.stringify({ name, m: Number(m.toFixed(2)), dist, shards, zone, date, killer: String(body.killer || '').slice(0, 24) }));
    if (mode === 'daily') { await r.expire(boardKey, 3 * 86400); await r.expire(detailKey, 3 * 86400); }
  } else {
    // still let players rename
    const cur = await r.get(detailKey);
    if (cur) { const obj = typeof cur === 'string' ? JSON.parse(cur) : cur; if (obj.name !== name) { obj.name = name; await r.set(detailKey, JSON.stringify(obj)); } }
  }
  const rank = await r.zrevrank(boardKey, pid);
  const total = await r.zcard(boardKey);
  await r.incr('stats:runs');
  return send(res, 200, { ok: true, improved, rank: rank == null ? null : rank + 1, total, board: mode, date });
}
