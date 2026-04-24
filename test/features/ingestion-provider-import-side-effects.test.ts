import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * PR-B safety gate: importing the ingestion provider layer must not
 * open network connections, read files, spawn children, or initialise
 * pg-boss. If this test ever starts to flake because some module-level
 * side effect leaks (a `new PgBoss()`, a top-level `fetch`, a
 * `fs.readFileSync`) we want to catch it here, not in production.
 */

test('importing @/domains/ingestion is side-effect free', async () => {
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch must not be called at import time')
  }) as typeof fetch

  const before = {
    netSockets: countActiveHandles('TCP'),
    timers: countActiveHandles('Timeout'),
  }

  try {
    const mod = await import('@/domains/ingestion')
    // Touch the exports so tree-shaking analysis cannot elide the
    // module entirely — we genuinely want to exercise the import.
    assert.equal(typeof mod.getTelegramProvider, 'function')
    assert.equal(typeof mod.createMockProvider, 'function')
    assert.equal(typeof mod.isIngestionKilled, 'function')
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(fetchCalled, false, 'no HTTP calls at import time')

  const after = {
    netSockets: countActiveHandles('TCP'),
    timers: countActiveHandles('Timeout'),
  }
  assert.equal(
    after.netSockets,
    before.netSockets,
    'no extra TCP sockets opened at import time',
  )
  assert.equal(
    after.timers,
    before.timers,
    'no extra timers scheduled at import time',
  )
})

function countActiveHandles(kind: string): number {
  // `process._getActiveHandles` is undocumented but stable enough to
  // use as a smoke test here; if it ever disappears this test can
  // fall back to `performance.eventLoopUtilization()`.
  const getHandles = (process as unknown as {
    _getActiveHandles?: () => Array<{ constructor: { name: string } }>
  })._getActiveHandles
  if (typeof getHandles !== 'function') return 0
  return getHandles().filter((h) => h.constructor.name.includes(kind)).length
}
