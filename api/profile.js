// GET  /api/profile?name=Sara          → { online, exists, name, save }
// POST /api/profile { name, save }     → { ok, created, name, save }
//
// A runner's progress lives under their name, so entering the same name on
// another phone or browser brings it back. There is no password: a save can
// only grow (see src/save.js mergeSave), so whoever plays under a name can add
// to its progress but never erase or lower it.
//   pf:<pid>   JSON { name, save, at }   kept 400 days after the last write
import { send, preflight, readJson, redis, rateLimit, clientIp, runnerFor } from './_lib/util.js';
import { mergeSave } from '../src/save.js';

const TTL = 400 * 86400;
const MAX_BYTES = 24000;

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
  const r = await redis();
  if (!r) return send(res, 200, { online: false });
  const ip = clientIp(req);

  if (req.method === 'GET') {
    if (!(await rateLimit(r, `profile:get:${ip}`, 300, 600))) return send(res, 429, { error: 'slow down' });
    const url = new URL(req.url, 'http://x');
    const who = runnerFor(url.searchParams.get('name'));
    if (!who) return send(res, 422, { error: 'name not allowed', online: true });
    const raw = await r.get(`pf:${who.pid}`);
    const rec = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    return send(res, 200, { online: true, exists: Boolean(rec), name: rec ? rec.name : who.name, save: rec ? rec.save : null });
  }

  if (!(await rateLimit(r, `profile:post:${ip}`, 120, 600))) return send(res, 429, { error: 'slow down' });
  const body = await readJson(req);
  if (!body) return send(res, 400, { error: 'bad json' });
  const who = runnerFor(body.name);
  if (!who) return send(res, 422, { error: 'name not allowed' });
  if (JSON.stringify(body.save || null).length > MAX_BYTES) return send(res, 413, { error: 'save too large' });
  const key = `pf:${who.pid}`;
  const raw = await r.get(key);
  const rec = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
  const save = mergeSave(rec ? rec.save : null, body.save);
  // the first writer's spelling stays the runner's display name
  await r.set(key, JSON.stringify({ name: rec ? rec.name : who.name, save, at: Date.now() }), { ex: TTL });
  return send(res, 200, { ok: true, created: !rec, name: rec ? rec.name : who.name, save });
}
