// City Leads service worker. Conservative on purpose: navigations are
// network-first (online reps always get the latest portal), with the cached app
// shell only as an offline fallback. API calls and cross-origin requests (Maps,
// Firebase, Deepgram) are never touched. Bump CACHE to invalidate.
const CACHE = 'cityleads-v1';
const SHELL = '/cityleads/index';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // leave Maps / Firebase / APIs on other hosts alone
  if (url.pathname.startsWith('/api/')) return;     // never cache API

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(SHELL, cp)); return r; })
        .catch(() => caches.match(SHELL))
    );
    return;
  }

  // Same-origin static under /cityleads/: cache-first with background fill.
  if (url.pathname.startsWith('/cityleads/')) {
    e.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((r) => {
      if (r && r.status === 200) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
      return r;
    })));
  }
});
