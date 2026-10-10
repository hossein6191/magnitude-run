// GET  /api/profile?name=Sara          → { online, exists, name, save }
// POST /api/profile { name, save }     → { ok, created, name, save }
//
// A runner's progress lives under their name, so entering the same name on
// another phone or browser brings it back. There is no password: a save can
// only grow, and every value is clamped to what the game can produce (see
// src/save.js mergeSave), so whoever plays under a name can add to its progress
// but never erase it or push it out of reach.
//   pf:<pid>        JSON { name, save, at }   kept 400 days after the last write
//   pflock:<pid>    short write lock, so two devices saving at once both count
import { send, preflight, readJson, redis, rateLimit, clientIp, runnerFor, legacyPidsFor, utcDate, nonce } from './_lib/util.js';
import { mergeSave } from '../src/save.js';

const TTL = 400 * 86400;
const MAX_BYTES = 24000;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
// compare-and-act on the lock token (Lua on Upstash; the dev store mimics both)
const CAS_SET = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[3]) end return false";
const CAS_DEL = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') return send(res, 405, { error: 'GET or POST' });
  const r = await redis();
  if (!r) return send(res, 200, { online: false });
  const ip = clientIp(req);

  if (req.method === 'GET') {
    if (!(await rateLimit(r, `profile:get:${ip}`, 600, 600))) return send(res, 429, { error: 'slow down' });
    const url = new URL(req.url, 'http://x');
    const who = runnerFor(url.searchParams.get('name'));
    if (!who) return send(res, 422, { error: 'name not allowed', online: true });
    const raw = await r.get(`pf:${who.pid}`);
    let rec = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    // an older version may have kept (part of) this runner's save under another id
    for (const id of legacyPidsFor(who)) {
      const o = await r.get(`pf:${id}`);
      if (!o) continue;
      const p = typeof o === 'string' ? JSON.parse(o) : o;
      rec = rec ? { ...rec, save: mergeSave(rec.save, p.save) } : p;
    }
    return send(res, 200, { online: true, exists: Boolean(rec), name: rec ? rec.name : who.name, save: rec ? rec.save : null });
  }

  // a shared address (school, event Wi-Fi, carrier NAT) syncs often: the per-IP cap
  // matches submit's. The per-name cap counts per address too: names are public, so a
  // stranger must not be able to use up a runner's saves.
  if (!(await rateLimit(r, `profile:post:${ip}`, 600, 600))) return send(res, 429, { error: 'slow down' });
  const body = await readJson(req);
  if (!body) return send(res, 400, { error: 'bad json' });
  const who = runnerFor(body.name);
  if (!who) return send(res, 422, { error: 'name not allowed' });
  if (!(await rateLimit(r, `profile:name:${who.pid}:${ip}`, 120, 600))) return send(res, 429, { error: 'slow down' });
  let size;
  try { size = JSON.stringify(body.save || null).length; } catch (e) { return send(res, 400, { error: 'bad save' }); }
  if (size > MAX_BYTES) return send(res, 413, { error: 'save too large' });

  // read, merge and write under a short lock: without it two devices saving at the
  // same moment would each overwrite the other's half
  // the lock has an owner token: a write only happens while this request still holds it,
  // and only the owner releases it (a stalled store cannot make two writers overlap)
  const key = `pf:${who.pid}`, lock = `pflock:${who.pid}`, tok = nonce();
  let locked = false;
  for (let i = 0; i < 25 && !locked; i++) {
    locked = (await r.set(lock, tok, { nx: true, ex: 20 })) === 'OK';
    if (!locked) await sleep(80);
  }
  if (!locked) return send(res, 429, { error: 'busy' });
  try {
    const raw = await r.get(key);
    let rec = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
    // fold in any save an older version kept for this name under another id
    const moved = [];
    let base = rec ? rec.save : null;
    for (const id of legacyPidsFor(who)) {
      const old = await r.get(`pf:${id}`);
      if (!old) continue;
      const o = typeof old === 'string' ? JSON.parse(old) : old;
      base = mergeSave(base, o.save); moved.push(`pf:${id}`);
      rec = rec || { name: o.name };
    }
    // a best dated after tomorrow (UTC) is refused: it would win every later daily merge
    const save = mergeSave(base, body.save, { today: utcDate(Date.now() + 86400000) });
    // write only while this request still holds the lock, checked and written in one step
    // (the first writer's spelling stays the runner's display name)
    const ok = await r.eval(CAS_SET, [lock, key], [tok, JSON.stringify({ name: rec ? rec.name : who.name, save, at: Date.now() }), String(TTL)]);
    if (ok !== 'OK') return send(res, 429, { error: 'busy' });   // lost the lock in a stall
    if (moved.length) await r.del(...moved);
    return send(res, 200, { ok: true, created: !rec, name: rec ? rec.name : who.name, save });
  } catch (e) {
    return send(res, 400, { error: 'bad save' });
  } finally {
    try { await r.eval(CAS_DEL, [lock], [tok]); } catch (e) { /* expires in 20 s */ }
  }
}
