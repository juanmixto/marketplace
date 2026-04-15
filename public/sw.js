/* Mercado Productor — minimal PWA service worker.
 *
 * Phase 1 (current): installability only. No runtime caching yet.
 * We keep the fetch handler intentionally transparent so nothing is ever
 * served from cache — this avoids stale auth, stale dashboards, and stale
 * checkout state while still satisfying the browser's "has a controlling
 * SW" installability requirement.
 *
 * When we eventually add runtime caching, the allow-list must exclude:
 *   /api/*, /admin/*, /vendor/*, /checkout/*, /auth/*, /(auth)/*
 * and anything with an Authorization / Cookie header.
 */

const SW_VERSION = 'mp-sw-v1'

self.addEventListener('install', () => {
  // Activate immediately on first install so the page gets a controller
  // without requiring a manual reload.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Nuke any caches from a previous SW version — we are not using
      // runtime caching yet, so no cache should survive.
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request

  // Only handle GETs; never intercept POST/PUT/PATCH/DELETE.
  if (req.method !== 'GET') return

  // Let the browser handle everything itself. This is a no-op SW that only
  // exists so the app is installable. We explicitly do NOT call
  // event.respondWith, so the default network fetch runs unchanged.
  return
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// Version tag for easier debugging from DevTools > Application > SW.
self.__SW_VERSION = SW_VERSION
