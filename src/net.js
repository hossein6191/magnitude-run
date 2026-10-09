// Leaderboard client. Talks to the Vercel functions under /api (see api/*.js
// for the exact shapes). Every call resolves instead of throwing: the game must
// keep working when there is no network, no Redis, or a private-mode browser.

const TIMEOUT_MS = 3500;
const BOARD_TTL_MS = 20000;
const PID_LEN = 16;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// In-memory fallbacks so pid/name stay stable for the session even when
// localStorage throws (private mode, blocked site data).
const mem = { pid: null, name: null };
let online = false;
const boards = new Map();   // cache key -> { at, data }
const inflight = new Map(); // cache key -> Promise, dedupes concurrent board() calls

function read(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}

function randomId() {
  const bytes = new Uint8Array(PID_LEN);
  try { crypto.getRandomValues(bytes); }
  catch (e) { for (let i = 0; i < PID_LEN; i++) bytes[i] = Math.floor(Math.random() * 256); }
  let s = '';
  for (let i = 0; i < PID_LEN; i++) s += ALPHA[bytes[i] % ALPHA.length];
  return s;
}

// Same character rules as api/_lib/util.js runnerFor. The word list stays
// server-side, so the server may still refuse a name ('name not allowed').
// Returns '' for a name nobody may use.
export function cleanName(raw) {
  const s = String(raw || '').normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/[^A-Za-z0-9_ .\-؀-ۿ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  const visible = s.replace(/[\p{M}\p{Cc}\s]/gu, '');
  return visible.length < 2 || s.toLowerCase() === 'rocky' ? '' : s;
}

function apiBase() {
  const b = typeof window !== 'undefined' && typeof window.MR_API_BASE === 'string' ? window.MR_API_BASE : '';
  return b.replace(/\/+$/, '');
}

// One fetch wrapper for every endpoint: JSON in, JSON out, hard timeout, and
// null on anything that is not a parsable response. Callers inspect status.
async function request(path, { method = 'GET', body, query, timeoutMs = TIMEOUT_MS } = {}) {
  if (typeof fetch !== 'function') return null;
  let url = apiBase() + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
  try {
    const init = { method, signal: ac ? ac.signal : undefined, cache: 'no-store' };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { status: res.status, data };
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function boardKey(board, limit, date, name) { return `${board}|${limit}|${date || ''}|${name.toLowerCase()}`; }

export const net = {
  get base() { return apiBase(); },
  get online() { return online; },

  pid() {
    if (mem.pid) return mem.pid;
    let id = read('mr-pid');
    if (!id || !/^[A-Za-z0-9]{16}$/.test(id)) { id = randomId(); write('mr-pid', id); }
    mem.pid = id;
    return id;
  },

  // The runner's name: their identity on the board and the key to their saved
  // progress. '' until the player picks one.
  name() {
    if (mem.name != null) return mem.name;
    const n = read('mr-name');
    mem.name = n ? cleanName(n) : '';
    if (n && !mem.name) write('mr-name', '');
    return mem.name;
  },
  setName(n) {
    const clean = cleanName(n);
    mem.name = clean;
    write('mr-name', clean);
    return clean;
  },

  // POST /api/start -> { token, date, seed, online } | null
  async startRun() {
    const r = await request('/api/start', { method: 'POST', body: {} });
    if (!r || r.status !== 200 || !r.data || typeof r.data.token !== 'string') { online = false; return null; }
    online = r.data.online === true;
    return { token: r.data.token, date: r.data.date, seed: r.data.seed, now: Number(r.data.now) || 0, online };
  },

  // POST /api/submit -> { ok, improved, rank, total, board, date } | { ok: false, error } | null
  // dist and m go through unrounded: the server recomputes the magnitude from
  // dist and shards and only allows a 0.011 tolerance.
  async submit({ token, mode = 'endless', dist, shards, zone, m, killer = '', seed = 0 } = {}) {
    if (!token) return null;
    const body = {
      token, name: net.name(),
      mode: mode === 'daily' ? 'daily' : 'endless',
      dist: Number(dist), shards: Number(shards), zone: Number(zone), m: Number(m),
      killer: String(killer || '').slice(0, 24), seed: Number(seed) || 0,
    };
    // a cold function plus a dozen Redis round-trips can take a while on a phone: the
    // token is single-use, so give the post a real budget rather than lose the run
    const r = await request('/api/submit', { method: 'POST', body, timeoutMs: 10000 });
    if (!r) { online = false; return null; }
    const d = r.data || {};
    if (r.status === 200 && d.ok) {
      online = true;
      boards.clear(); // ranks moved, next board() must refetch
      return { ok: true, improved: Boolean(d.improved), rank: d.rank ?? null, total: d.total ?? 0, board: d.board || body.mode, date: d.date || '' };
    }
    if (r.status === 503) { online = false; return null; }
    if (r.status === 422 || r.status === 409 || r.status === 401) {
      online = true; // server reached Redis before rejecting the run
      return { ok: false, error: String(d.error || 'rejected') };
    }
    if (r.status === 429) { online = true; return { ok: false, error: 'busy' }; }
    return null;
  },

  // GET /api/board -> { online, board, date, total, entries, you } | null
  // Successful results are cached for 20s per (board, limit, date) so the
  // over-screen and title can both ask without hammering the function.
  async board(board = 'global', { limit = 25, date } = {}) {
    const b = board === 'daily' ? 'daily' : 'global';
    const lim = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 25));
    const dt = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
    const name = net.name();
    const key = boardKey(b, lim, dt, name);
    const hit = boards.get(key);
    if (hit && Date.now() - hit.at < BOARD_TTL_MS) return hit.data;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      const r = await request('/api/board', { query: { board: b, limit: lim, date: dt, name } });
      if (!r || r.status !== 200 || !r.data) { online = false; return null; }
      const d = r.data;
      online = d.online === true;
      const out = {
        online, board: d.board || b, date: d.date || dt || net.dailyDate(),
        total: Number(d.total) || 0,
        entries: Array.isArray(d.entries) ? d.entries : [],
        you: d.you || null,
      };
      boards.set(key, { at: Date.now(), data: out });
      return out;
    })();
    inflight.set(key, p);
    try { return await p; } finally { inflight.delete(key); }
  },

  // GET /api/profile -> { online, exists, name, save } | null (unreachable)
  async profile(name) {
    const r = await request('/api/profile', { query: { name } });
    if (!r || !r.data) return null;
    if (r.status === 422) return { online: true, refused: true };
    if (r.status !== 200) return null;
    return { online: r.data.online === true, exists: Boolean(r.data.exists), name: String(r.data.name || name), save: r.data.save || null };
  },

  // POST /api/profile -> { ok, created, name, save } | { refused } | null
  async saveProfile(name, save) {
    const r = await request('/api/profile', { method: 'POST', body: { name, save }, timeoutMs: 8000 });
    if (!r || !r.data) return null;
    if (r.status === 422) return { refused: true };
    if (r.status !== 200 || !r.data.ok) return null;
    return { ok: true, created: Boolean(r.data.created), name: String(r.data.name || name), save: r.data.save || null };
  },

  // Drop cached boards, e.g. behind a manual refresh button.
  invalidate() { boards.clear(); },

  dailyDate() { return new Date().toISOString().slice(0, 10); },

  // FNV-1a over 'magnitude-run:<date>': the public fallback course for an offline
  // daily run. The real daily seed is an HMAC the server keeps secret, so an
  // offline daily run is a different course and is never posted.
  dailySeed(date) {
    let h = 2166136261;
    for (const ch of `magnitude-run:${date}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  },
};

export function fmtRank(rank, total) {
  if (rank == null || !Number.isFinite(Number(rank))) return '';
  const r = '#' + Math.floor(Number(rank)).toLocaleString('en-US');
  const t = Number(total);
  return Number.isFinite(t) && t > 0 ? `${r} of ${Math.floor(t).toLocaleString('en-US')}` : r;
}
