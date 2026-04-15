/* Mercado Productor — PWA service worker.
 *
 * Phase 2 (current): offline navigation fallback.
 *
 * Strategy
 * --------
 * - Precache exactly ONE resource on install: /offline
 * - On navigation requests (request.mode === 'navigate') try the network
 *   first; if it throws (device is offline) respond with the cached
 *   /offline page.
 * - Everything else is pass-through (we never call respondWith).
 *
 * Exclusions — we do NOT intercept navigations to any of these prefixes,
 * even when offline. Serving the offline shell in place of an auth or
 * admin screen would be more confusing than the browser's own error,
 * and we must never cache state from them.
 *
 *   /api/*, /admin/*, /vendor/*, /checkout/*, /auth/*
 *
 * When we add static-asset caching in Phase 3 (#428), it MUST keep an
 * allow-list and never touch these prefixes either.
 */

const SW_VERSION = 'mp-sw-v2'
const OFFLINE_CACHE = 'mp-offline-v1'
const OFFLINE_URL = '/offline'

const PROTECTED_NAV_PREFIXES = [
  '/api/',
  '/admin',
  '/vendor',
  '/checkout',
  '/auth',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE)
      // `reload` bypasses HTTP cache so the offline shell is always fresh
      // at SW install time.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache that doesn't belong to the current version set.
      const allowed = new Set([OFFLINE_CACHE])
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => !allowed.has(k)).map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

function isProtectedNavigation(url) {
  const path = url.pathname
  return PROTECTED_NAV_PREFIXES.some((prefix) => path.startsWith(prefix))
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  // Only intercept top-level navigations. All sub-resource requests
  // (scripts, images, data fetches) fall through to the network
  // transparently.
  if (req.mode !== 'navigate') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (isProtectedNavigation(url)) return

  event.respondWith(
    (async () => {
      try {
        // Network-first. We intentionally don't cache successful responses
        // here — product listings, prices and stock must stay fresh.
        return await fetch(req)
      } catch {
        const cache = await caches.open(OFFLINE_CACHE)
        const cached = await cache.match(OFFLINE_URL)
        if (cached) return cached
        // Last-resort: let the browser's own error surface.
        throw new Error('offline and no cached shell available')
      }
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.__SW_VERSION = SW_VERSION
