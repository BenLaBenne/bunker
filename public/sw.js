// public/sw.js — Service Worker : cache des assets statiques, réseau pour l'API/WS.
// Le multijoueur nécessite une connexion : aucune prétention d'être jouable hors ligne.
const VERSION = 'bunker-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = [
  '/', '/index.html', '/css/app.css', '/vendor/pixi.min.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    for (const key of keys) if (key !== STATIC_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname === '/ws') return;

  // Cache-first pour les modules et assets ; network-first pour l'index
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match('/index.html');
      try {
        const fresh = await fetch(event.request);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch { return cached || Response.error(); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const res = await fetch(event.request);
      if (res.ok && url.origin === self.location.origin) cache.put(event.request, res.clone());
      return res;
    } catch {
      return cached || Response.error();
    }
  })());
});

// Message du client : nouvelle version → activation immédiate
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
