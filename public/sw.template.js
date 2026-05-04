/* Mercado Productor — PWA service worker.
 *
 * Runtime strategy:
 *   - Stale-while-revalidate for a strict allow-list of static assets
 *   - Stale-while-revalidate for product images (/_next/image, /uploads/*)
 *   - Navigation preload to cut SW boot latency on cold page loads
 *   - Offline shell fallback when navigations fail
 *   - Everything else is pass-through
 *
 * Caches
 * ------
 * - mp-offline-v1  : precached `/offline` shell
 * - mp-static-v1   : SWR cache for static assets (JS/CSS/fonts/icons)
 * - mp-images-v1   : SWR cache for optimized product images, LRU 200
 * - mp-prefetch-v1 : periodic-sync catalog JSON
 *
 * Exclusions (denylist — defensive second layer)
 * ----------------------------------------------
 *   /api/*, /admin/*, /vendor/*, /checkout/*, /auth/*
 *   Anything with query strings indicating user state
 *
 * An URL must pass the allow-list AND not hit the denylist to be cached.
 * LRU trim keeps each cache from growing unbounded.
 */

// __BUILD_ID__ is replaced at build time by scripts/build-sw.mjs. The
// literal below is only used if the template is served directly (dev).
const SW_VERSION = '__BUILD_ID__'
const OFFLINE_CACHE = 'mp-offline-v1'
// v2: bump invalidates v1 wholesale on `activate`. The v1 SW served
// stale `/_next/static/chunks/*` via stale-while-revalidate after deploys,
// so a returning visitor could keep getting OLD JS chunks for an unbounded
// window (until the SWR background revalidate completed AND the next
// navigation picked up the refreshed cache entry). Symptom: PostHog SDK
// silently undefined for returning visitors after every deploy. v2 also
// stops caching JS chunks entirely (see isCacheableStatic below).
const STATIC_CACHE = 'mp-static-v2'
const IMAGE_CACHE = 'mp-images-v1'
const PREFETCH_CACHE = 'mp-prefetch-v1'
const OFFLINE_URL = '/offline'
const MAX_STATIC_ENTRIES = 60
const MAX_IMAGE_ENTRIES = 200

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
  '/brand/logo.svg',
  '/brand/logo.png',
  '/opengraph-image',
  '/twitter-image',
])

function isProtected(url) {
  return PROTECTED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
}

// Hostnames where we deliberately disable the static SWR cache. Dev tunnels
// recompile constantly, and a stale `/_next/static/*` chunk in the SW cache
// just confuses developers (you fix something on disk, the bundle changes,
// but the device keeps serving the previous chunk until SWR revalidates).
// Pass-through is the right default on these hosts; production keeps cache.
const DEV_HOSTNAMES = new Set(__DEV_HOSTNAMES__)

function isCacheableStatic(url) {
  if (url.origin !== self.location.origin) return false
  if (isProtected(url)) return false
  if (DEV_HOSTNAMES.has(self.location.hostname)) return false
  const path = url.pathname
  // Never cache JS chunks. Filenames are content-hashed and the HTTP
  // Cache-Control on /_next/static/chunks/* is `immutable`, so the
  // browser's HTTP cache handles them perfectly — and serves the right
  // version after a deploy without an SWR window where stale bytes win.
  if (path.startsWith('/_next/static/chunks/')) return false
  if (path.startsWith('/_next/static/')) return true
  if (path.startsWith('/icons/icon-') && path.endsWith('.png')) return true
  if (ALLOWED_EXACT.has(path)) return true
  return false
}

// Cross-origin hosts whose images we allow into the SWR cache. Must match
// the remotePatterns allow-list in next.config.ts so we never cache from
// a host the app wouldn't otherwise render.
const CDN_IMAGE_HOST_SUFFIXES = [
  'images.unsplash.com',
  '.cloudinary.com',
  '.uploadthing.com',
  '.public.blob.vercel-storage.com',
]

function isAllowedImageHost(hostname) {
  return CDN_IMAGE_HOST_SUFFIXES.some((suffix) =>
    suffix.startsWith('.') ? hostname.endsWith(suffix) : hostname === suffix
  )
}

function isCacheableImage(url) {
  if (url.origin === self.location.origin) {
    if (isProtected(url)) return false
    const path = url.pathname
    // Next's image optimizer — most product/CDN images flow through here.
    if (path === '/_next/image' || path.startsWith('/_next/image?')) return true
    // Locally-hosted uploads (LocalUploader dev/self-hosted path).
    if (path.startsWith('/uploads/')) return true
    return false
  }
  // Cross-origin: only the whitelisted CDN hosts. Responses will be
  // opaque (no CORS), but they're still cacheable as raw bytes.
  return isAllowedImageHost(url.hostname)
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
      const allowed = new Set([OFFLINE_CACHE, STATIC_CACHE, IMAGE_CACHE, PREFETCH_CACHE])
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => !allowed.has(k)).map((k) => caches.delete(k))
      )
      // Navigation preload lets the browser start fetching the page in
      // parallel with SW boot — saves ~50–300 ms on cold navigations.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable()
        } catch {
          // Some browsers don't support it; ignore.
        }
      }
      await self.clients.claim()
    })()
  )
})

function handleNavigation(event) {
  event.respondWith(
    (async () => {
      try {
        // Prefer the preload response if the browser fired one.
        const preload = await event.preloadResponse
        if (preload) return preload
        return await fetch(event.request)
      } catch {
        const cache = await caches.open(OFFLINE_CACHE)
        const cached = await cache.match(OFFLINE_URL)
        if (cached) {
          // #793 telemetry: surface to PostHog via the client bridge
          // how often users actually hit the offline fallback. PII-safe
          // — only the pathname is sent, never query/fragment.
          notifyClients({
            type: 'analytics',
            event: 'offline_fallback_shown',
            props: {
              attemptedPath: new URL(event.request.url).pathname,
              swVersion: SW_VERSION,
            },
          })
          return cached
        }
        throw new Error('offline and no cached shell available')
      }
    })()
  )
}

function notifyClients(message) {
  // Fire-and-forget broadcast to all controlled tabs. The bridge component
  // forwards `type: 'analytics'` messages to PostHog.
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    for (const client of clients) {
      client.postMessage(message)
    }
  })
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

function handleImageAsset(event) {
  event.respondWith(
    (async () => {
      const cache = await caches.open(IMAGE_CACHE)
      const cached = await cache.match(event.request)
      const networkPromise = fetch(event.request)
        .then(async (response) => {
          if (!response) return response
          // Same-origin → basic+ok. Cross-origin no-CORS → opaque
          // (status 0). Cache both — opaque bytes are fine for <img>.
          const cacheable =
            (response.ok && response.type === 'basic') ||
            response.type === 'opaque'
          if (cacheable) {
            await cache.put(event.request, response.clone())
            event.waitUntil(trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES))
          }
          return response
        })
        .catch(() => null)

      if (cached) {
        event.waitUntil(networkPromise)
        return cached
      }
      const network = await networkPromise
      if (network) return network
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

  if (isCacheableImage(url)) {
    handleImageAsset(event)
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

        // #793: classify entry by URL pathname so PostHog can break down
        // bg-sync replays per scope without exposing the raw URL.
        const replayScope = url.pathname.startsWith('/api/cart')
          ? url.pathname.includes('remove')
            ? 'cart_remove'
            : 'cart_add'
          : url.pathname.includes('favorite')
            ? 'favorite_toggle'
            : 'other'
        const ageMs = now - entry.createdAt

        try {
          const response = await fetch(entry.url, {
            method: entry.method,
            body: entry.body,
            headers: entry.headers,
          })

          if (response.ok || response.status === 409) {
            store.delete(entry.id)
            notifyClients({
              type: 'analytics',
              event: 'bg_sync_replay',
              props: { scope: replayScope, outcome: 'success', ageMs },
            })
          } else {
            notifyClients({
              type: 'analytics',
              event: 'bg_sync_replay',
              props: { scope: replayScope, outcome: 'failure', ageMs },
            })
          }
        } catch {
          // Network still down — leave in queue. No analytics event
          // here because we'll retry; only emit on terminal outcomes.
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
