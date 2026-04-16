/**
 * Generic IndexedDB-backed queue for failed network mutations that should
 * be retried when the user comes back online. Used by the Background Sync
 * API handler in sw.js.
 *
 * Safety contract:
 * - Only queues idempotent or safe-to-retry mutations (favorites, not checkout).
 * - Each entry has a maxAge (default 1h). Stale entries are discarded.
 * - Queue is cleared on sign-out via clearSyncQueue().
 */

const DB_NAME = 'mp-sync-queue'
const STORE_NAME = 'pending'
const DB_VERSION = 1
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

export interface SyncQueueEntry {
  id?: number // auto-increment key
  url: string
  method: string
  body: string | null
  headers: Record<string, string>
  createdAt: number
  maxAge: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Enqueues a failed mutation for background sync replay.
 */
export async function enqueueForSync(
  url: string,
  method: string,
  body: string | null,
  headers: Record<string, string> = {},
  maxAge = DEFAULT_MAX_AGE_MS
): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)

  const entry: SyncQueueEntry = {
    url,
    method,
    body,
    headers,
    createdAt: Date.now(),
    maxAge,
  }

  store.add(entry)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/**
 * Returns all pending entries, filtering out expired ones.
 */
export async function getPendingEntries(): Promise<SyncQueueEntry[]> {
  if (typeof indexedDB === 'undefined') return []

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  const entries: SyncQueueEntry[] = await new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  db.close()

  const now = Date.now()
  return entries.filter((e) => now - e.createdAt < e.maxAge)
}

/**
 * Removes a specific entry by ID after successful replay.
 */
export async function removeEntry(id: number): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).delete(id)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/**
 * Clears the entire queue. Call on sign-out to prevent stale mutations
 * from replaying under a different user session.
 */
export async function clearSyncQueue(): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).clear()
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/**
 * Requests Background Sync registration from the SW. Falls back silently
 * on unsupported browsers.
 */
export async function requestBackgroundSync(tag = 'mp-cart-sync'): Promise<void> {
  if (typeof navigator === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  try {
    const registration = await navigator.serviceWorker.ready
    const swReg = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> }
    }
    await swReg.sync?.register(tag)
  } catch {
    // Not supported — ignore. The online event fallback will handle it.
  }
}
