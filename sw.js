// Double Pivot — Service Worker v4
// Offline-first: cache shell on install, serve from cache, update in background

const CACHE_VERSION = 'dp-v4';

// NOTE: Do NOT include './' here — on Netlify (and many hosts) bare '/' returns
// a 301 redirect to index.html, and cache.addAll() fails the entire install
// if any resource returns a redirect instead of a direct 200 response.
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── Install: pre-cache all shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => {
        // Log but don't let a single cache miss abort the whole SW install
        console.warn('[SW] cache.addAll failed for some assets:', err);
      })
  );
});

// ── Activate: delete all old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for shell assets, network-first for Google Fonts
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  // Skip cross-origin requests that aren't fonts (e.g. analytics)
  if (url.origin !== self.location.origin &&
      url.hostname !== 'fonts.googleapis.com' &&
      url.hostname !== 'fonts.gstatic.com') return;

  // Google Fonts: network-first with cache fallback
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        fetch(event.request.clone())
          .then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cache.match(event.request))
      )
    );
    return;
  }

  // Everything else: cache-first, stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request.clone())
          .then(response => {
            if (response && response.status === 200 && response.type !== 'opaque') {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});

// ── Allow main thread to trigger skipWaiting for instant updates
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
