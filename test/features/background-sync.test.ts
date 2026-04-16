import test from 'node:test'
import assert from 'node:assert/strict'

// ── SW sync handler safety tests ─────────────────────────────────────────

test('SW sync handler rejects payment-related mutations', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  // The sync handler must explicitly block checkout and payment endpoints.
  assert.ok(swContent.includes("'/api/checkout'"), 'SW must block /api/checkout from sync replay')
  assert.ok(swContent.includes("'/api/orders'"), 'SW must block /api/orders from sync replay')
  assert.ok(swContent.includes("'/api/stripe'"), 'SW must block /api/stripe from sync replay')
})

test('SW sync handler uses the correct tag', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  assert.ok(swContent.includes("'mp-cart-sync'"), 'SW must use mp-cart-sync tag')
})

test('SW sync handler removes expired entries', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  // Must check createdAt + maxAge.
  assert.ok(swContent.includes('entry.maxAge'), 'SW must check entry.maxAge for expiry')
  assert.ok(swContent.includes('entry.createdAt'), 'SW must check entry.createdAt')
})

test('SW sync handler treats 409 Conflict as success', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  // 409 means "already applied" — should delete the entry, not retry.
  assert.ok(swContent.includes('409'), 'SW must handle 409 Conflict as success')
})

// ── Sync queue module structure ──────────────────────────────────────────

test('sync-queue module exports expected functions', async () => {
  const mod = await import('@/lib/pwa/sync-queue')

  assert.equal(typeof mod.enqueueForSync, 'function')
  assert.equal(typeof mod.getPendingEntries, 'function')
  assert.equal(typeof mod.removeEntry, 'function')
  assert.equal(typeof mod.clearSyncQueue, 'function')
  assert.equal(typeof mod.requestBackgroundSync, 'function')
})

test('sync-queue: enqueueForSync degrades in Node (no indexedDB)', async () => {
  const { enqueueForSync } = await import('@/lib/pwa/sync-queue')
  // Should not throw, just silently return.
  await assert.doesNotReject(() =>
    enqueueForSync('/api/favoritos/prod123', 'POST', null)
  )
})

test('sync-queue: getPendingEntries returns empty in Node', async () => {
  const { getPendingEntries } = await import('@/lib/pwa/sync-queue')
  const entries = await getPendingEntries()
  assert.deepEqual(entries, [])
})

test('sync-queue: clearSyncQueue degrades in Node', async () => {
  const { clearSyncQueue } = await import('@/lib/pwa/sync-queue')
  await assert.doesNotReject(() => clearSyncQueue())
})

test('sync-queue: requestBackgroundSync degrades in Node', async () => {
  const { requestBackgroundSync } = await import('@/lib/pwa/sync-queue')
  await assert.doesNotReject(() => requestBackgroundSync())
})

// ── Offline indicator ────────────────────────────────────────────────────

test('OfflineIndicator component file exists', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const filePath = path.join(process.cwd(), 'src/components/pwa/OfflineIndicator.tsx')
  assert.ok(fs.existsSync(filePath))
})

// ── Sync queue DB/store name coherence ───────────────────────────────────

test('sync-queue and SW use the same IndexedDB name', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  const queuePath = path.join(process.cwd(), 'src/lib/pwa/sync-queue.ts')
  const queueContent = fs.readFileSync(queuePath, 'utf-8')

  assert.ok(swContent.includes("'mp-sync-queue'"), 'SW must reference mp-sync-queue')
  assert.ok(queueContent.includes("'mp-sync-queue'"), 'sync-queue must reference mp-sync-queue')
})
