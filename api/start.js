// POST /api/start  → { token, date, seed, online }
// Issues a signed run token that carries the start time. Submissions must
// present it, which gives the server a lower bound on how long the run took.
import { send, preflight, signToken, nonce, utcDate, dailySeed, redis, rateLimit, clientIp } from './_lib/util.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const r = await redis();
  const online = Boolean(r);
  if (r && !(await rateLimit(r, `start:${clientIp(req)}`, 120, 600))) return send(res, 429, { error: 'slow down' });
  const now = Date.now();
  const date = utcDate(now);
  const token = signToken({ v: 1, t: now, n: nonce(), d: date });
  return send(res, 200, { token, date, seed: dailySeed(date), online });
}
