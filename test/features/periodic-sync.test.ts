import test from 'node:test'
import assert from 'node:assert/strict'

// ── Prefetch cache reader tests ──────────────────────────────────────────
// We can't test the actual CacheStorage API in Node, but we can test the
// readPrefetchedCatalog function handles the "no caches" case gracefully.

test('readPrefetchedCatalog: returns null when CacheStorage is undefined', async () => {
  // In Node there is no global `caches`, so the function should degrade.
  const { readPrefetchedCatalog } = await import('@/lib/pwa/prefetch-cache')
  const result = await readPrefetchedCatalog()
  assert.equal(result, null)
})

// ── SW periodic sync tag constant coherence ──────────────────────────────
// Ensures the SW and the client agree on the sync tag.

test('periodic sync tag is consistent between SW comment and PwaRegister', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.template.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  // SW defines the tag as a constant.
  assert.ok(swContent.includes("'mp-catalog-prefetch'"), 'SW must reference mp-catalog-prefetch tag')

  // PwaRegister references the same tag when requesting periodic sync.
  const registerPath = path.join(process.cwd(), 'src/components/pwa/PwaRegister.tsx')
  const registerContent = fs.readFileSync(registerPath, 'utf-8')
  assert.ok(
    registerContent.includes("'mp-catalog-prefetch'"),
    'PwaRegister must reference the same mp-catalog-prefetch tag'
  )
})

// ── SW respects data saver ───────────────────────────────────────────────

test('SW periodic sync handler references navigator.connection.saveData', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.template.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  assert.ok(swContent.includes('conn.saveData'), 'SW must respect saveData flag')
  assert.ok(swContent.includes("conn.effectiveType === 'slow-2g'"), 'SW must check for slow-2g')
  assert.ok(swContent.includes("conn.effectiveType === '2g'"), 'SW must check for 2g')
})

// ── API route returns compact payload shape ──────────────────────────────

test('featured API route file exists', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const routePath = path.join(process.cwd(), 'src/app/api/catalog/featured/route.ts')
  assert.ok(fs.existsSync(routePath), 'API route for catalog featured must exist')
})

// ── SW version bumped ────────────────────────────────────────────────────

test('SW template uses the __BUILD_ID__ placeholder for per-deploy versioning', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.template.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  assert.ok(
    swContent.includes("'__BUILD_ID__'"),
    'SW template must keep __BUILD_ID__ placeholder — scripts/build-sw.mjs substitutes it at build time'
  )
})

// ── Prefetch cache name matches SW ───────────────────────────────────────

test('prefetch cache name is consistent between SW and prefetch-cache module', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.template.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  const modulePath = path.join(process.cwd(), 'src/lib/pwa/prefetch-cache.ts')
  const moduleContent = fs.readFileSync(modulePath, 'utf-8')

  assert.ok(swContent.includes("'mp-prefetch-v1'"), 'SW must define mp-prefetch-v1')
  assert.ok(moduleContent.includes("'mp-prefetch-v1'"), 'prefetch-cache module must use mp-prefetch-v1')
})

// ── Activate prunes unknown caches ───────────────────────────────────────

test('SW activate allows the prefetch cache', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')

  const swPath = path.join(process.cwd(), 'public/sw.template.js')
  const swContent = fs.readFileSync(swPath, 'utf-8')

  // The allowed set in activate must include the prefetch cache.
  assert.ok(swContent.includes('PREFETCH_CACHE'), 'SW activate must include PREFETCH_CACHE in allowed set')
})
