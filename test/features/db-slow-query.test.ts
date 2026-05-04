import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@/generated/prisma/client'
import { logger } from '@/lib/logger'
import {
  _resetSlowQueryThresholdForTests,
  observeSlowQuery,
  slowQueryExtension,
  SLOW_QUERY_EXTENSION_NAME,
} from '@/lib/db-slow-query'

/**
 * Behavioural tests for the slow-query observer (#1216).
 *
 * `Prisma.defineExtension(...)` returns an opaque function, so the
 * observer is exported separately as `observeSlowQuery` and tested
 * head-on. The wrapper extension just delegates to it; the wrapper's
 * own correctness is implicit from the fact that `$extends` accepts
 * whatever `defineExtension` returns.
 */

interface CapturedLog {
  level: 'info' | 'warn' | 'error' | 'debug'
  scope: string
  context?: Record<string, unknown>
}

function captureLogs(): { captured: CapturedLog[]; restore: () => void } {
  const captured: CapturedLog[] = []
  const original = {
    info: logger.info,
    warn: logger.warn,
    error: logger.error,
    debug: logger.debug,
  }
  logger.info = (scope, msgOrCtx, ctx) =>
    captured.push({ level: 'info', scope, context: resolveCtx(msgOrCtx, ctx) })
  logger.warn = (scope, msgOrCtx, ctx) =>
    captured.push({ level: 'warn', scope, context: resolveCtx(msgOrCtx, ctx) })
  logger.error = (scope, msgOrCtx, ctx) =>
    captured.push({ level: 'error', scope, context: resolveCtx(msgOrCtx, ctx) })
  logger.debug = (scope, msgOrCtx, ctx) =>
    captured.push({ level: 'debug', scope, context: resolveCtx(msgOrCtx, ctx) })
  return {
    captured,
    restore: () => {
      logger.info = original.info
      logger.warn = original.warn
      logger.error = original.error
      logger.debug = original.debug
    },
  }
}

function resolveCtx(
  msgOrCtx: unknown,
  ctx: unknown,
): Record<string, unknown> | undefined {
  if (typeof msgOrCtx === 'object' && msgOrCtx !== null) {
    return msgOrCtx as Record<string, unknown>
  }
  return ctx as Record<string, unknown> | undefined
}

function withinDelay<T>(ms: number, value: T) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))
}

test('Prisma.defineExtension is reachable from the generated client', () => {
  // Sanity guard for an upstream Prisma rename — we'd otherwise discover it
  // only at first DB read.
  assert.equal(typeof Prisma.defineExtension, 'function')
})

test('slow-query extension is opaque (Prisma wraps the handler — testing observeSlowQuery directly)', () => {
  // `defineExtension` returns a function, not the config it was given.
  // This pin guards against the test ever silently rotting if Prisma
  // changes shape and the assumption flips back to a config object.
  assert.equal(typeof slowQueryExtension, 'function')
  assert.equal(SLOW_QUERY_EXTENSION_NAME, 'db-slow-query-observer')
})

test('a fast query (<100ms) does NOT log db.query.slow under default 500ms threshold', async () => {
  process.env.DB_SLOW_QUERY_MS = '500'
  _resetSlowQueryThresholdForTests()
  const { captured, restore } = captureLogs()
  try {
    const result = await observeSlowQuery({
      model: 'User',
      operation: 'findFirst',
      args: { where: { id: 'x' } },
      query: () => withinDelay(20, 'fast-result'),
    })
    assert.equal(result, 'fast-result')
    const slow = captured.find((c) => c.scope === 'db.query.slow')
    assert.equal(slow, undefined, 'must not log slow for fast queries')
  } finally {
    restore()
    delete process.env.DB_SLOW_QUERY_MS
    _resetSlowQueryThresholdForTests()
  }
})

test('a slow query crosses the threshold and logs db.query.slow at warn level', async () => {
  process.env.DB_SLOW_QUERY_MS = '30'
  _resetSlowQueryThresholdForTests()
  const { captured, restore } = captureLogs()
  try {
    const result = await observeSlowQuery({
      model: 'Order',
      operation: 'findMany',
      args: {},
      query: () => withinDelay(80, 'slow-result'),
    })
    assert.equal(result, 'slow-result')
    const slow = captured.find((c) => c.scope === 'db.query.slow')
    assert.ok(slow, 'expected db.query.slow to be logged')
    assert.equal(slow!.level, 'warn')
    assert.equal(slow!.context?.model, 'Order')
    assert.equal(slow!.context?.operation, 'findMany')
    assert.equal(slow!.context?.success, true)
    const dur = slow!.context?.durationMs as number
    assert.ok(dur >= 30, `durationMs should be ≥ threshold (was ${dur})`)
  } finally {
    restore()
    delete process.env.DB_SLOW_QUERY_MS
    _resetSlowQueryThresholdForTests()
  }
})

test('a slow REJECTED query still logs db.query.slow with success=false and rethrows', async () => {
  process.env.DB_SLOW_QUERY_MS = '30'
  _resetSlowQueryThresholdForTests()
  const { captured, restore } = captureLogs()
  try {
    const boom = new Error('deadlock detected')
    let caught: unknown
    try {
      await observeSlowQuery({
        model: 'Payment',
        operation: 'update',
        args: {},
        query: () =>
          new Promise((_, reject) => setTimeout(() => reject(boom), 60)),
      })
    } catch (err) {
      caught = err
    }
    assert.strictEqual(caught, boom, 'observer must rethrow the original error')
    const slow = captured.find((c) => c.scope === 'db.query.slow')
    assert.ok(slow, 'expected db.query.slow even on rejection')
    assert.equal(slow!.context?.success, false)
    assert.equal(slow!.context?.model, 'Payment')
    assert.equal(slow!.context?.operation, 'update')
  } finally {
    restore()
    delete process.env.DB_SLOW_QUERY_MS
    _resetSlowQueryThresholdForTests()
  }
})

test('threshold falls back to 500 on garbage / unset DB_SLOW_QUERY_MS', async () => {
  process.env.DB_SLOW_QUERY_MS = 'not-a-number'
  _resetSlowQueryThresholdForTests()
  const { captured, restore } = captureLogs()
  try {
    await observeSlowQuery({
      model: 'User',
      operation: 'findFirst',
      args: {},
      query: () => withinDelay(20, 'ok'), // < 500ms default
    })
    assert.equal(captured.find((c) => c.scope === 'db.query.slow'), undefined)
  } finally {
    restore()
    delete process.env.DB_SLOW_QUERY_MS
    _resetSlowQueryThresholdForTests()
  }
})
