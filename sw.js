// Service Worker for BTM998
// Bump CACHE_VERSION on each release to force a controlled cache refresh.
const CACHE_VERSION = '1.0.10';
const CACHE_PREFIX = 'btm998-cache';
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;

const BASE = (() => {
  try {
    const scope = self.registration?.scope;
    if (scope) {
      const path = new URL(scope).pathname;
      return path.endsWith('/') ? path : `${path}/`;
    }
  } catch (_) {}
  return '/';
})();

const CORE = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.json`,
  `${BASE}assets/css/style.css`,
  `${BASE}assets/css/kpp.css`,
  `${BASE}assets/css/commander-order.css`,
  `${BASE}assets/js/kpp.js`,
  `${BASE}assets/js/readiness-questions.js`,
  `${BASE}assets/js/knowledge-documents.js`,
  `${BASE}assets/js/dashboard.js`,
  `${BASE}assets/js/commander-panel.js`,
  `${BASE}assets/js/commander-order.js`,
  `${BASE}assets/js/pwa.js`,
  `${BASE}wiedza-kpp.html`,
  `${BASE}wiedza-inspekcja-gotowosci.html`,
  `${BASE}wiedza-procedury.html`,
  `${BASE}home.html`,
  `${BASE}panel-dowodcy.html`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    const payload = { type: 'VERSION', version: CACHE_VERSION };
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(payload);
      return;
    }
    event.source?.postMessage(payload);
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the service worker script itself.
  if (url.pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(req));
    return;
  }

  // Always fetch the PWA bootstrap script from network first
  // so update-flow fixes propagate immediately.
  if (url.pathname.endsWith('/assets/js/pwa.js')) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // HTML navigations: network first with offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(req));
    return;
  }

  const isAsset = url.pathname.startsWith(`${BASE}assets/`) || url.pathname.startsWith(`${BASE}icons/`);
  const isStatic =
    req.destination === 'script' ||
    req.destination === 'style' ||
    req.destination === 'image' ||
    req.destination === 'font' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  if (isAsset && isStatic) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

async function networkFirstPage(req) {
  try {
    const res = await fetch(req);
    await putInCache(req, res.clone());
    return res;
  } catch (_) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(
      '<!doctype html><html lang="pl"><meta charset="utf-8"><title>Offline</title><body>Brak połączenia z internetem.</body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    await putInCache(req, res.clone());
    return res;
  } catch (_) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then(async (res) => {
      await putInCache(req, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || networkPromise || new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

async function putInCache(req, res) {
  if (!res || res.status !== 200 || res.type !== 'basic') {
    return;
  }
  const cache = await caches.open(CACHE_NAME);
  await cache.put(req, res);
}
