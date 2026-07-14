const CACHE = 'qlnhv-cache-reset-20260714';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('qlnhv-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const isNavigation = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  if (isNavigation) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});