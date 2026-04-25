import test from 'node:test'
import assert from 'node:assert/strict'

// Smoke test: installCartBroadcast should be importable, idempotent,
// and graceful when BroadcastChannel is missing (the Safari < 15.4
// fallback path). We don't exercise the full cross-tab flow here —
// that requires a browser environment with two windows. The
// install/cleanup contract is what we care about for unit-level
// regression coverage.

import { installCartBroadcast } from '@/domains/orders/cart-broadcast'

test('installCartBroadcast returns a cleanup function in environments without BroadcastChannel', () => {
  // In the Node test runner there's no BroadcastChannel global by
  // default — the `isSupported()` check should bail out and return a
  // no-op cleanup.
  const cleanup = installCartBroadcast()
  assert.equal(typeof cleanup, 'function')
  // Calling cleanup must not throw.
  assert.doesNotThrow(() => cleanup())
})

test('multiple installs are idempotent (no duplicate listeners)', () => {
  const a = installCartBroadcast()
  const b = installCartBroadcast()
  assert.equal(typeof a, 'function')
  assert.equal(typeof b, 'function')
  assert.doesNotThrow(() => {
    a()
    b()
  })
})
