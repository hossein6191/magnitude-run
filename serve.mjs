// Tiny static server for local play: node serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.argv[2] || 5173);
// Local dev runs the real api/*.js handlers against an in-memory store, so the
// leaderboard flow can be tried without Vercel or Redis (nothing persists).
process.env.MR_DEV_STORE = process.env.MR_DEV_STORE || '1';
const api = {};
async function apiHandler(name) {
  if (!/^[a-z]+$/.test(name)) return null;
  if (!api[name]) {
    try { api[name] = (await import(`./api/${name}.js`)).default; } catch (e) { api[name] = null; }
  }
  return api[name];
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/api/')) {
      const h = await apiHandler(p.slice(5).replace(/\/$/, ''));
      if (!h) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"no such function"}'); }
      return h(req, res);
    }
    if (p.endsWith('/')) p += 'index.html';
    if (p === '/favicon.ico') p = '/icon.svg';
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    const s = await stat(file);
    if (s.isDirectory()) { res.writeHead(302, { Location: p + '/' }); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Magnitude Run at http://127.0.0.1:${port}/`));
