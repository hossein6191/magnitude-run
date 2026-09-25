// Service worker: makes Magnitude Run installable and playable offline.
// Bump VERSION on any deploy that changes a precached file. The shell is
// served network-first with the cache as the offline fallback, so a deploy
// reaches players on their next load; the bump only clears stale entries.
// The leaderboard API is never cached: a stale board is worse than no board.

const VERSION = 'v3';
const PREFIX = 'magnitude-run-';
const CACHE = PREFIX + VERSION;
const PRECACHE = [
  './', './index.html', './styles.css',
  './src/main.js', './src/game.js', './src/rocky.js', './src/world.js', './src/audio.js',
  './src/card.js', './src/score.js', './src/music.js', './src/net.js', './src/missions.js',
  './src/input.js', './src/hazards.js', './src/ui.js', './src/pwa.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-180.png',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // allSettled: a file that does not exist yet must not block the install.
    await Promise.allSettled(PRECACHE.map((url) => precacheOne(cache, url)));
    await self.skipWaiting();
  })());
});

async function precacheOne(cache, url) {
  const res = await fetch(url, { cache: 'reload' });
  if (!res.ok) throw new Error(url + ': ' + res.status);
  // Vercel's cleanUrls redirects /index.html to /. A redirected response is
  // refused for navigations later, so store a clean copy of the body instead.
  const clean = res.redirected ? new Response(await res.blob(), { status: 200, headers: res.headers }) : res;
  await cache.put(url, clean);
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // DevTools "only-if-cached" quirk: let the browser handle it.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (!url.protocol.startsWith('http')) return;
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && /\/api\//.test(url.pathname)) return;
  if (FONT_HOSTS.includes(url.hostname)) { event.respondWith(staleWhileRevalidate(event, req)); return; }
  if (sameOrigin) event.respondWith(networkFirst(event, req));
});

// Fresh when online, cached when not. A 4 s stall also falls back to the cache.
async function networkFirst(event, req) {
  const cache = await caches.open(CACHE);
  const nav = req.mode === 'navigate';
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
    ]);
    if (res && res.ok) event.waitUntil(cache.put(nav ? './index.html' : req, res.clone()).catch(() => {}));
    return res;
  } catch (e) {
    return cacheFirst(event, req);
  }
}

// Shell and code: cache wins, network fills the gaps. A navigation that
// misses both falls back to the cached shell so the game opens offline.
async function cacheFirst(event, req) {
  const nav = req.mode === 'navigate';
  const cached = await caches.match(req, { ignoreSearch: nav });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      // waitUntil keeps the worker alive until the write lands.
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, copy)));
    }
    return res;
  } catch (e) {
    if (nav) {
      const shell = (await caches.match('./index.html')) || (await caches.match('./'));
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// Fonts: answer from cache at once, refresh behind the scenes. Opaque
// responses are kept too, since the stylesheet link is fetched without CORS.
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  event.waitUntil(network);
  if (cached) return cached;
  const res = await network;
  return res || new Response('', { status: 504 });
}
