/* Mercado Productor — PWA service worker.
 *
 * Phase 3 (current): stale-while-revalidate runtime cache for a strict
 * allow-list of public static assets. Navigations still use the
 * Phase 2 offline fallback. Everything else is pass-through.
 *
 * Caches
 * ------
 * - mp-offline-v1 : precached `/offline` shell (Phase 2)
 * - mp-static-v1  : runtime SWR cache for static assets (Phase 3)
 *
 * Allow-list for the static cache
 * -------------------------------
 * We only cache things that are either:
 *   a) content-addressed (hashed, safe to cache forever), or
 *   b) brand assets that change rarely and are same-origin public.
 *
 *   - /_next/static/*       (hashed JS/CSS/media from Next build)
 *   - /icons/icon-*.png     (manifest icons)
 *   - /favicon.svg, /favicon.ico
 *   - /opengraph-image, /twitter-image (crawler-facing OG images)
 *   - Anything ending in .woff2 under /_next/static (next/font)
 *
 * Exclusions (denylist — defensive second layer)
 * ----------------------------------------------
 *   /api/*, /admin/*, /vendor/*, /checkout/*, /auth/*
 *   Anything with query strings indicating user state
 *
 * An URL must pass the allow-list AND not hit the denylist to be cached.
 * LRU trim at MAX_STATIC_ENTRIES keeps the cache from growing unbounded.
 */

// __BUILD_ID__ is replaced at build time by scripts/build-sw.mjs. The
// literal below is only used if the template is served directly (dev).
const SW_VERSION = '__BUILD_ID__'
const OFFLINE_CACHE = 'mp-offline-v1'
const STATIC_CACHE = 'mp-static-v1'
const PREFETCH_CACHE = 'mp-prefetch-v1'
const OFFLINE_URL = '/offline'
const MAX_STATIC_ENTRIES = 60

const PROTECTED_PREFIXES = [
  '/api/',
  '/admin',
  '/vendor',
  '/checkout',
  '/auth',
]

const ALLOWED_EXACT = new Set([
  '/favicon.svg',
  '/favicon.ico',
  '/opengraph-image',
  '/twitter-image',
])

function isProtected(url) {
  return PROTECTED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
}

function isCacheableStatic(url) {
  if (url.origin !== self.location.origin) return false
  if (isProtected(url)) return false
  const path = url.pathname
  if (path.startsWith('/_next/static/')) return true
  if (path.startsWith('/icons/icon-') && path.endsWith('.png')) return true
  if (ALLOWED_EXACT.has(path)) return true
  return false
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  // Drop the oldest (keys() returns insertion order).
  const excess = keys.length - maxEntries
  for (let i = 0; i < excess; i += 1) {
    await cache.delete(keys[i])
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE)
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const allowed = new Set([OFFLINE_CACHE, STATIC_CACHE, PREFETCH_CACHE])
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => !allowed.has(k)).map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

function handleNavigation(event) {
  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request)
      } catch {
        const cache = await caches.open(OFFLINE_CACHE)
        const cached = await cache.match(OFFLINE_URL)
        if (cached) return cached
        throw new Error('offline and no cached shell available')
      }
    })()
  )
}

function handleStaticAsset(event) {
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      const cached = await cache.match(event.request)
      const networkPromise = fetch(event.request)
        .then(async (response) => {
          // Only cache successful, basic (same-origin) responses. Skip
          // opaque/redirected responses and anything non-2xx.
          if (response && response.ok && response.type === 'basic') {
            await cache.put(event.request, response.clone())
            // Fire-and-forget trim; don't block the response.
            event.waitUntil(trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES))
          }
          return response
        })
        .catch(() => null)

      if (cached) {
        // Stale-while-revalidate: return cache immediately, refresh in bg.
        event.waitUntil(networkPromise)
        return cached
      }
      const network = await networkPromise
      if (network) return network
      // No cache, no network — let the browser see the failure.
      return fetch(event.request)
    })()
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  if (req.mode === 'navigate') {
    if (url.origin !== self.location.origin) return
    if (isProtected(url)) return
    handleNavigation(event)
    return
  }

  if (isCacheableStatic(url)) {
    handleStaticAsset(event)
    return
  }
  // Everything else: pass-through. No respondWith, no caching.
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// ── Push Notifications ───────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  const title = payload.title || 'Mercado Productor'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'mp-default',
    data: { url: payload.url || '/' },
    vibrate: [100, 50, 100],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'
  const fullUrl = new URL(targetUrl, self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url === fullUrl && 'focus' in client) {
            return client.focus()
          }
        }
        return self.clients.openWindow(fullUrl)
      })
  )
})

// ── Periodic Background Sync ─────────────────────────────────────────────

const PERIODIC_SYNC_TAG = 'mp-catalog-prefetch'

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== PERIODIC_SYNC_TAG) return

  event.waitUntil(
    (async () => {
      const conn = navigator.connection
      if (conn && conn.saveData) return
      if (conn && (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g')) return

      try {
        const response = await fetch('/api/catalog/featured?limit=12')
        if (!response.ok) return

        const cache = await caches.open(PREFETCH_CACHE)
        await cache.put('/api/catalog/featured?limit=12', response)

        const clients = await self.clients.matchAll({ type: 'window' })
        for (const client of clients) {
          client.postMessage({ type: 'catalog-prefetched' })
        }
      } catch {
        // Network failure during background sync — silently skip.
      }
    })()
  )
})

// ── Background Sync for failed mutations ─────────────────────────────────

const SYNC_TAG = 'mp-cart-sync'
const SYNC_DB_NAME = 'mp-sync-queue'
const SYNC_STORE_NAME = 'pending'
const SYNC_PROTECTED = ['/api/checkout', '/api/orders', '/api/stripe']

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return

  event.waitUntil(
    (async () => {
      const db = await openSyncDB()
      const tx = db.transaction(SYNC_STORE_NAME, 'readwrite')
      const store = tx.objectStore(SYNC_STORE_NAME)

      const entries = await new Promise((resolve, reject) => {
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })

      const now = Date.now()

      for (const entry of entries) {
        if (now - entry.createdAt > entry.maxAge) {
          store.delete(entry.id)
          continue
        }

        const url = new URL(entry.url, self.location.origin)
        if (SYNC_PROTECTED.some((p) => url.pathname.startsWith(p))) {
          store.delete(entry.id)
          continue
        }

        try {
          const response = await fetch(entry.url, {
            method: entry.method,
            body: entry.body,
            headers: entry.headers,
          })

          if (response.ok || response.status === 409) {
            store.delete(entry.id)
          }
        } catch {
          // Network still down — leave in queue.
        }
      }

      db.close()

      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        client.postMessage({ type: 'sync-completed' })
      }
    })()
  )
})

self.__SW_VERSION = SW_VERSION
