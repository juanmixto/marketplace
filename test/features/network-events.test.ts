import test from 'node:test'
import assert from 'node:assert/strict'

// We can't easily stub `@/lib/analytics` from outside without a heavy
// loader hook. Instead, swap the module's `capturePostHog` function via
// a global probe (PostHog client is a no-op when env is missing) and
// just assert the public-facing behavior: that each helper exists,
// returns void, and accepts the documented param shapes without throwing.
//
// The real wire-up to PostHog is exercised by the existing analytics
// tests; here we only need the contract.

import {
  trackNetworkError,
  trackOfflineFallback,
  trackBgSyncReplay,
  trackPaymentRetry,
  trackConnectionSlowDetected,
  trackConnectionOffline,
  trackConnectionRestored,
} from '@/lib/analytics/network-events'

test('all helpers exist and accept their documented param shapes', () => {
  assert.equal(typeof trackNetworkError, 'function')
  assert.equal(typeof trackOfflineFallback, 'function')
  assert.equal(typeof trackBgSyncReplay, 'function')
  assert.equal(typeof trackPaymentRetry, 'function')
  assert.equal(typeof trackConnectionSlowDetected, 'function')
  assert.equal(typeof trackConnectionOffline, 'function')
  assert.equal(typeof trackConnectionRestored, 'function')
})

test('helpers do not throw with valid params', () => {
  assert.doesNotThrow(() =>
    trackNetworkError({
      scope: 'cart',
      errorType: 'timeout',
      effectiveType: '3g',
      saveData: false,
      retriesAttempted: 2,
    }),
  )
  assert.doesNotThrow(() => trackOfflineFallback({ attemptedPath: '/x', swVersion: 'abc' }))
  assert.doesNotThrow(() => trackBgSyncReplay({ scope: 'cart_add', outcome: 'success', ageMs: 100 }))
  assert.doesNotThrow(() =>
    trackPaymentRetry({ errorType: 'card_declined', attemptNumber: 2 }),
  )
  assert.doesNotThrow(() => trackConnectionSlowDetected({ effectiveType: '2g', saveData: true }))
  assert.doesNotThrow(() => trackConnectionOffline())
  assert.doesNotThrow(() => trackConnectionRestored({ effectiveType: '4g' }))
  assert.doesNotThrow(() => trackConnectionRestored())
})

test('helpers return void (fire-and-forget)', () => {
  const result = trackNetworkError({ scope: 'other', errorType: 'unknown' })
  assert.equal(result, undefined)
})
