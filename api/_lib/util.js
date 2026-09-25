// Shared helpers for the Vercel functions. Files under api/_lib are not
// deployed as functions themselves (leading underscore).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { magnitudeFor } from '../../src/score.js';

let client = null;
// Upstash Redis when configured; an in-memory stand-in when MR_DEV_STORE=1
// (serve.mjs sets it) so the whole online flow can be tried locally.
export async function redis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const { Redis } = await import('@upstash/redis');
    // raw strings back: we parse JSON ourselves, so digit-only ids never turn into numbers
    client = new Redis({ url, token, automaticDeserialization: false });
    return client;
  }
  if (process.env.MR_DEV_STORE === '1') { client = memoryStore(); return client; }
  return null;
}

// Just enough of the Upstash API for the three functions. Not persistent.
function memoryStore() {
  const kv = new Map(), exp = new Map(), z = new Map();
  const alive = (k) => { const e = exp.get(k); if (e && e < Date.now()) { kv.delete(k); z.delete(k); exp.delete(k); } };
  const sorted = (k) => [...(z.get(k) || new Map()).entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return {
    async incr(k) { alive(k); const v = (Number(kv.get(k)) || 0) + 1; kv.set(k, v); return v; },
    async expire(k, sec) { exp.set(k, Date.now() + sec * 1000); return 1; },
    async set(k, v, opts = {}) { alive(k); if (opts.nx && kv.has(k)) return null; kv.set(k, v); if (opts.ex) exp.set(k, Date.now() + opts.ex * 1000); else if (!opts.keepTtl) exp.delete(k); return 'OK'; },
    async del(...ks) { let n = 0; for (const k of ks) { if (kv.delete(k)) n++; z.delete(k); exp.delete(k); } return n; },
    async zrem(k, ...ms) { const s = z.get(k); let n = 0; if (s) for (const m of ms) if (s.delete(m)) n++; return n; },
    async get(k) { alive(k); return kv.has(k) ? kv.get(k) : null; },
    async mget(...ks) { return ks.map((k) => { alive(k); return kv.has(k) ? kv.get(k) : null; }); },
    async zadd(k, entry) { alive(k); if (!z.has(k)) z.set(k, new Map()); z.get(k).set(entry.member, entry.score); return 1; },
    async zscore(k, m) { alive(k); const s = z.get(k); return s && s.has(m) ? s.get(m) : null; },
    async zrevrank(k, m) { alive(k); const i = sorted(k).findIndex(([mm]) => mm === m); return i < 0 ? null : i; },
    async zcard(k) { alive(k); return (z.get(k) || new Map()).size; },
    async zrange(k, a, b) { alive(k); return sorted(k).slice(a, b + 1).map(([m]) => m); },
  };
}

export function secret() {
  return process.env.RUN_SECRET || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function preflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return true;
  }
  return false;
}

// Vercel parses the body before the handler runs (object for JSON, string for
// text, Buffer otherwise) and the stream is already drained; the local server
// hands us a live stream. Never wait on a drained stream, never wait forever.
export async function readJson(req) {
  let b;
  try { b = req.body; } catch (e) { return null; }
  if (b !== undefined || req.readableEnded || req.complete) {
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return null; } }
    return b && typeof b === 'object' && !Buffer.isBuffer(b) && !Array.isArray(b) ? b : null;
  }
  return new Promise((resolve) => {
    let data = '', done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => { finish(null); try { req.destroy(); } catch (e) { /* ignore */ } }, 3000);
    req.on('data', (c) => { data += c; if (data.length > 20000) { finish(null); req.destroy(); } });
    req.on('end', () => { try { const v = JSON.parse(data || '{}'); finish(v && typeof v === 'object' && !Array.isArray(v) ? v : null); } catch (e) { finish(null); } });
    req.on('error', () => finish(null));
  });
}

export function clientIp(req) {
  const h = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  return String(h).split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// Sliding bucket rate limit: `limit` hits per `windowSec` per key.
export async function rateLimit(r, key, limit, windowSec) {
  if (!r) return true;
  const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const n = await r.incr(bucket);
  if (n === 1) await r.expire(bucket, windowSec + 5);
  return n <= limit;
}

export function utcDate(ms = Date.now()) { return new Date(ms).toISOString().slice(0, 10); }

// The daily course seed is derived from the secret, so tomorrow's course cannot
// be practised early. Offline clients fall back to a public seed and are not posted.
export function dailySeed(date) {
  const hex = createHmac('sha256', secret()).update(`daily:${date}`).digest('hex').slice(0, 8);
  return parseInt(hex, 16) >>> 0;
}

const BAD = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'bitch', 'dick', 'cock', 'pussy', 'rape', 'nazi', 'hitler', 'kike', 'whore', 'slut', 'retard'];
export function cleanName(raw) {
  let s = String(raw || '').normalize('NFKC').replace(/[^A-Za-z0-9_ .\-؀-ۿ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  const flat = s.toLowerCase().replace(/[^a-z]/g, '');
  if (BAD.some((w) => flat.includes(w))) s = 'Rocky';
  if (s.length < 2) s = 'Rocky';
  return s;
}

export function cleanPid(raw) {
  const s = String(raw || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  return s.length >= 8 ? s : null;
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
export function signToken(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
}
export function nonce() { return randomBytes(9).toString('base64url'); }

// Composite sort score: magnitude first, distance as tie-breaker.
export function compositeScore(m, dist) {
  return Math.round(m * 10000) * 1e6 + Math.min(999999, Math.max(0, Math.floor(dist)));
}

// Fastest possible run to `distM` metres: integrate the game's speed curve
// with Overclock assumed on the whole way, then allow 10% slack.
export function minRunMs(distM) {
  let t = 0;
  for (let d = 0; d < distM; d += 10) {
    const v = Math.min(780, Math.min(726, 330 + d * 0.0495 + Math.floor(d / 600) * 26.4) * 1.5) / 8;
    t += 10 / v;
  }
  return t * 1000 * 0.9;
}

export const TOKEN_TTL_MS = 45 * 60 * 1000;

// Server-side plausibility. Returns an error string or null. Honest-player
// checks only: replay verification is what would make this strict.
export function validateRun(run, tokenPayload, nowMs) {
  const dist = Number(run.dist), shards = Number(run.shards), zone = Number(run.zone), m = Number(run.m);
  if (![dist, shards, zone, m].every(Number.isFinite)) return 'bad numbers';
  if (dist < 0 || dist > 40000 || shards < 0 || shards > 40000) return 'out of range';
  if (zone !== Math.floor(dist / 600)) return 'zone mismatch';
  if (shards > dist * 0.6 + 40) return 'too many shards';
  const expect = magnitudeFor(dist, shards);
  if (Math.abs(expect - m) > 0.011) return 'magnitude mismatch';
  const elapsed = nowMs - Number(tokenPayload.t);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'bad token time';
  if (elapsed > TOKEN_TTL_MS) return 'token expired';
  if (elapsed < minRunMs(dist)) return 'run too fast';
  return null;
}
