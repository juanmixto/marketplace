import test from 'node:test'
import assert from 'node:assert/strict'

import { runWithCorrelation } from '@/lib/correlation-context'
import {
  trackServer,
  __resetServerAnalyticsForTests,
  __setClientForTests,
} from '@/lib/analytics.server'

/**
 * Contract tests for the server-side PostHog wrapper (#1215).
 *
 * The wrapper is intentionally fail-quiet — analytics must never tumble
 * checkout. These tests cover the behaviour callers depend on:
 *   1. No-op when PostHog isn't configured (no key).
 *   2. Captures with the agreed property shape (app_env auto-tagged,
 *      $insert_id derived from dedupeKey, correlationId pulled from
 *      ALS when present).
 *   3. Caller exceptions are swallowed.
 *
 * The wrapper exposes `__setClientForTests` so we can inject a tiny
 * stub instead of mocking the whole `posthog-node` module — easier to
 * reason about and ESM-safe (require.cache surgery doesn't work under
 * tsx).
 */

interface CapturedCall {
  distinctId: string
  event: string
  properties?: Record<string, unknown>
}

function makeStub(opts: { throwOnCapture?: boolean } = {}) {
  const captured: CapturedCall[] = []
  const stub = {
    capture(arg: CapturedCall) {
      if (opts.throwOnCapture) throw new Error('posthog stub: induced failure')
      captured.push(arg)
    },
    flush() {
      return Promise.resolve()
    },
    shutdown() {
      return Promise.resolve()
    },
  }
  return { stub, captured }
}

test('trackServer is a no-op when NEXT_PUBLIC_POSTHOG_KEY is unset', () => {
  const savedKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY
  __resetServerAnalyticsForTests()
  try {
    // Must not throw, must not log a captured event.
    assert.doesNotThrow(() =>
      trackServer('order.placed', { order_id: 'abc' }, { distinctId: 'user-1' }),
    )
  } finally {
    if (savedKey) process.env.NEXT_PUBLIC_POSTHOG_KEY = savedKey
    __resetServerAnalyticsForTests()
  }
})

test('trackServer captures with $insert_id from dedupeKey + app_env tag', () => {
  const savedAppEnv = process.env.APP_ENV
  process.env.APP_ENV = 'staging'
  const { stub, captured } = makeStub()
  __setClientForTests(stub)
  try {
    trackServer(
      'order.placed',
      { order_id: 'order-42', value: 19.99 },
      { distinctId: 'user-7', dedupeKey: 'order-42' },
    )
    assert.equal(captured.length, 1)
    assert.equal(captured[0]!.distinctId, 'user-7')
    assert.equal(captured[0]!.event, 'order.placed')
    assert.equal(captured[0]!.properties?.app_env, 'staging')
    assert.equal(captured[0]!.properties?.$insert_id, 'order.placed:order-42')
    assert.equal(captured[0]!.properties?.order_id, 'order-42')
  } finally {
    if (savedAppEnv === undefined) delete process.env.APP_ENV
    else process.env.APP_ENV = savedAppEnv
    __resetServerAnalyticsForTests()
  }
})

test('trackServer omits $insert_id when no dedupeKey is provided', () => {
  const { stub, captured } = makeStub()
  __setClientForTests(stub)
  try {
    trackServer('order.placed', { order_id: 'order-42' }, { distinctId: 'user-7' })
    assert.equal(captured.length, 1)
    assert.equal(captured[0]!.properties?.$insert_id, undefined)
  } finally {
    __resetServerAnalyticsForTests()
  }
})

test('trackServer auto-tags correlationId from the ambient ALS scope', () => {
  const { stub, captured } = makeStub()
  __setClientForTests(stub)
  try {
    runWithCorrelation('corr-abc-123', () => {
      trackServer('order.placed', { order_id: 'x' }, { distinctId: 'u' })
    })
    assert.equal(captured.length, 1)
    assert.equal(captured[0]!.properties?.correlationId, 'corr-abc-123')

    // Outside any run() scope: no correlationId attached.
    captured.length = 0
    trackServer('order.placed', { order_id: 'y' }, { distinctId: 'u' })
    assert.equal(captured.length, 1)
    assert.equal(captured[0]!.properties?.correlationId, undefined)
  } finally {
    __resetServerAnalyticsForTests()
  }
})

test('trackServer swallows PostHog client errors instead of throwing', () => {
  const { stub } = makeStub({ throwOnCapture: true })
  __setClientForTests(stub)
  try {
    // Calling code (checkout, webhook handler) must never see a throw
    // from this surface — analytics is a side concern.
    assert.doesNotThrow(() =>
      trackServer('order.placed', {}, { distinctId: 'u', dedupeKey: 'k' }),
    )
  } finally {
    __resetServerAnalyticsForTests()
  }
})
