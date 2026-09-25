// GET /api/board?board=global|daily&date=YYYY-MM-DD&limit=25&pid=...
// → { online, board, date, total, entries: [{rank,name,m,dist,shards,zone,date}], you: {rank,m,dist}|null }
import { send, preflight, redis, rateLimit, clientIp, utcDate, cleanPid } from './_lib/util.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  const r = await redis();
  if (!r) return send(res, 200, { online: false, entries: [], total: 0, you: null });
  if (!(await rateLimit(r, `board:${clientIp(req)}`, 240, 600))) return send(res, 429, { error: 'slow down' });

  const url = new URL(req.url, 'http://x');
  const board = url.searchParams.get('board') === 'daily' ? 'daily' : 'global';
  const today = utcDate();
  let date = url.searchParams.get('date') || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today;
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 25));
  const pid = cleanPid(url.searchParams.get('pid'));
  const boardKey = board === 'daily' ? `lb:daily:${date}` : 'lb:global';
  const detail = (id) => (board === 'daily' ? `pb:daily:${date}:${id}` : `pb:global:${id}`);

  const ids = (await r.zrange(boardKey, 0, limit - 1, { rev: true })).map(String);
  const total = await r.zcard(boardKey);
  let entries = [];
  if (ids.length) {
    const details = await r.mget(...ids.map(detail));
    entries = ids.map((id, i) => {
      const d = details[i];
      const obj = d ? (typeof d === 'string' ? JSON.parse(d) : d) : {};
      return { rank: i + 1, name: obj.name || 'Rocky', m: obj.m ?? 0, dist: obj.dist ?? 0, shards: obj.shards ?? 0, zone: obj.zone ?? 0, date: obj.date || '', you: pid ? id === pid : false };
    });
  }
  let you = null;
  if (pid) {
    const rank = await r.zrevrank(boardKey, pid);
    if (rank != null) {
      const d = await r.get(detail(pid));
      const obj = d ? (typeof d === 'string' ? JSON.parse(d) : d) : {};
      you = { rank: rank + 1, m: obj.m ?? 0, dist: obj.dist ?? 0, name: obj.name || 'Rocky' };
    }
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  return send(res, 200, { online: true, board, date, total, entries, you });
}
