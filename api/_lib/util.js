// Shared helpers for the Vercel functions. Files under api/_lib are not
// deployed as functions themselves (leading underscore).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { magnitudeFor } from '../../src/score.js';

let client = null;
export function redis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
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

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 20000) { resolve(null); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
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

// Deterministic daily seed from the date alone, so offline play matches online.
export function dailySeed(date) {
  let h = 2166136261;
  for (const ch of `magnitude-run:${date}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
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

// Server-side plausibility. Returns an error string or null.
export function validateRun(run, tokenPayload, nowMs) {
  const dist = Number(run.dist), shards = Number(run.shards), zone = Number(run.zone), m = Number(run.m);
  if (![dist, shards, zone, m].every(Number.isFinite)) return 'bad numbers';
  if (dist < 0 || dist > 200000 || shards < 0 || shards > 100000) return 'out of range';
  if (zone !== Math.floor(dist / 600)) return 'zone mismatch';
  if (shards > dist * 0.8 + 40) return 'too many shards';
  const expect = magnitudeFor(dist, shards);
  if (Math.abs(expect - m) > 0.011) return 'magnitude mismatch';
  const elapsed = nowMs - Number(tokenPayload.t);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'bad token time';
  if (elapsed > 6 * 3600 * 1000) return 'token expired';
  // top speed is 780 px/s = 97.5 m/s; allow 10% slack
  const minMs = (dist / 108) * 1000;
  if (elapsed < minMs) return 'run too fast';
  return null;
}
