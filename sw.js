/* BURN service worker — network-first.
   Online: siempre sirve la última versión (evita que la PWA instalada quede pegada a una vieja).
   Offline: cae al último contenido cacheado. La localStorage del usuario NO se toca. */
const CACHE = 'burn-cache-v2';
/* Shell mínimo para que la app funcione OFFLINE apenas se instala (sin esperar a visitar todo).
   La app es un solo index.html autocontenido, así que con cachearlo alcanza; igual sumamos icons
   y manifest. Precache resiliente: si alguno falla, no aborta los demás. */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      await Promise.all(SHELL.map(async u => {
        try { const r = await fetch(u, { cache: 'no-store' }); if (r && r.ok) await c.put(u, r.clone()); } catch (_) {}
      }));
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // limpiar caches viejas de otras versiones
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // solo recursos propios

  e.respondWith((async () => {
    const isDoc = req.mode === 'navigate' || req.destination === 'document';
    try {
      // network-first; para el HTML evitamos la caché HTTP vieja
      const res = await fetch(req, isDoc ? { cache: 'no-store' } : {});
      if (res && res.ok) {
        try { const c = await caches.open(CACHE); c.put(req, res.clone()); } catch (_) {}
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (isDoc) {
        const home = await caches.match('./index.html') || await caches.match('index.html');
        if (home) return home;
      }
      throw err;
    }
  })());
});
