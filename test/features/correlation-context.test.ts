import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CORRELATION_HEADER,
  getCorrelationId,
  runWithCorrelation,
} from '../../src/lib/correlation-context'
import { generateCorrelationId } from '../../src/lib/correlation'

/**
 * Contract tests for the per-request correlation context (#1210).
 *
 * These are pure unit tests — no Next.js server needed. Middleware
 * behaviour (header rewrite + response header) is covered by an
 * integration test elsewhere because middleware execution requires
 * the full Next runtime.
 */

test('CORRELATION_HEADER is the canonical lowercase header name', () => {
  assert.equal(CORRELATION_HEADER, 'x-correlation-id')
})

test('getCorrelationId returns undefined outside any run() scope', () => {
  assert.equal(getCorrelationId(), undefined)
})

test('runWithCorrelation makes the id visible to nested sync code', () => {
  const id = generateCorrelationId()
  runWithCorrelation(id, () => {
    assert.equal(getCorrelationId(), id)
  })
  // Scope should not leak after the function returns.
  assert.equal(getCorrelationId(), undefined)
})

test('runWithCorrelation propagates across async boundaries', async () => {
  const id = generateCorrelationId()
  await runWithCorrelation(id, async () => {
    assert.equal(getCorrelationId(), id)
    await new Promise((r) => setImmediate(r))
    assert.equal(getCorrelationId(), id)
    // Microtask boundary too.
    await Promise.resolve()
    assert.equal(getCorrelationId(), id)
  })
  assert.equal(getCorrelationId(), undefined)
})

test('nested runWithCorrelation shadows the outer id and restores on exit', () => {
  const outer = generateCorrelationId()
  const inner = generateCorrelationId()
  assert.notEqual(outer, inner)
  runWithCorrelation(outer, () => {
    assert.equal(getCorrelationId(), outer)
    runWithCorrelation(inner, () => {
      assert.equal(getCorrelationId(), inner)
    })
    assert.equal(getCorrelationId(), outer)
  })
})

test('logger auto-injects the ambient correlationId into structured output', async () => {
  // Late import after env tweak so the logger picks up production mode.
  const prevNodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'production')
  try {
    const { logger } = await import('../../src/lib/logger')
    const id = generateCorrelationId()

    const captured: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      if (typeof chunk === 'string') captured.push(chunk)
      return true
    }) as typeof process.stdout.write

    try {
      runWithCorrelation(id, () => logger.info('test.scope', 'hello'))
      logger.info('test.scope', 'no-context')
    } finally {
      process.stdout.write = originalWrite
    }

    const parsed = captured.map((c) => JSON.parse(c.trim()) as Record<string, unknown>)
    const inside = parsed.find(
      (e) => (e.context as { correlationId?: string } | undefined)?.correlationId === id,
    )
    assert.ok(inside, 'expected the in-scope log line to carry the ambient correlationId')

    const outside = parsed.find((e) => e.message === 'no-context')
    assert.ok(outside, 'expected the out-of-scope log line to exist')
    const outsideCtx = outside.context as Record<string, unknown> | undefined
    assert.equal(outsideCtx?.correlationId, undefined)
  } finally {
    Reflect.set(process.env, 'NODE_ENV', prevNodeEnv)
  }
})

test('explicit context.correlationId wins over the ambient one', async () => {
  const prevNodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'production')
  try {
    const { logger } = await import('../../src/lib/logger')
    const ambient = generateCorrelationId()
    const explicit = generateCorrelationId()
    assert.notEqual(ambient, explicit)

    const captured: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      if (typeof chunk === 'string') captured.push(chunk)
      return true
    }) as typeof process.stdout.write

    try {
      runWithCorrelation(ambient, () =>
        logger.info('test.scope', 'with-explicit', { correlationId: explicit }),
      )
    } finally {
      process.stdout.write = originalWrite
    }

    const parsed = captured.map((c) => JSON.parse(c.trim()) as Record<string, unknown>)
    const entry = parsed.find((e) => e.message === 'with-explicit')
    const ctx = entry?.context as { correlationId?: string } | undefined
    assert.equal(ctx?.correlationId, explicit)
  } finally {
    Reflect.set(process.env, 'NODE_ENV', prevNodeEnv)
  }
})

test('parallel runWithCorrelation scopes do not bleed into each other', async () => {
  const a = generateCorrelationId()
  const b = generateCorrelationId()
  assert.notEqual(a, b)

  const taskA = runWithCorrelation(a, async () => {
    await new Promise((r) => setTimeout(r, 5))
    return getCorrelationId()
  })
  const taskB = runWithCorrelation(b, async () => {
    await new Promise((r) => setTimeout(r, 1))
    return getCorrelationId()
  })

  const [resA, resB] = await Promise.all([taskA, taskB])
  assert.equal(resA, a)
  assert.equal(resB, b)
})
