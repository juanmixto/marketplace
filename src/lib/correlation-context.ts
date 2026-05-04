/**
 * Per-request correlation context backed by Node's AsyncLocalStorage.
 *
 * Why this exists: until now `generateCorrelationId()` was used ad-hoc in
 * checkout and webhook code paths, and callers had to thread the id
 * through every helper as a parameter or `context: { correlationId }`.
 * That works for short call stacks but breaks down when:
 *
 *  - a handler calls a domain function that calls Prisma that triggers
 *    a logger inside a middleware — passing the id manually through 4
 *    layers is noisy and easy to forget,
 *  - a webhook handler fires an async job that should still be
 *    attributed to the originating delivery,
 *  - we want every `logger.error()` to auto-tag the Sentry event with
 *    the same id the user can see in the response header.
 *
 * The store is a plain object with the correlation id (and room to grow:
 * userId, requestPath, etc.). `runWithCorrelation()` should wrap any
 * server-side entry point that has a correlation identity:
 *
 *   - route handlers (`app/api/.../route.ts`)
 *   - server actions
 *   - background workers picking up a job
 *
 * Reads via `getCorrelationId()` are ALS-safe: outside a `run()` scope
 * they return `undefined` and callers degrade gracefully (the explicit
 * `context.correlationId` argument still wins).
 *
 * Edge runtime note: AsyncLocalStorage is not available in Next.js edge
 * routes. This module loads `node:async_hooks` lazily inside `run()` so
 * that simply importing the module doesn't break the edge bundle. In
 * edge contexts the helpers degrade to no-ops — the middleware still
 * sets the response header, just without ALS propagation.
 */

import type { AsyncLocalStorage as AsyncLocalStorageType } from 'node:async_hooks'

export interface CorrelationStore {
  correlationId: string
}

let storage: AsyncLocalStorageType<CorrelationStore> | null = null

function getStorage(): AsyncLocalStorageType<CorrelationStore> | null {
  if (storage) return storage
  try {
    // Lazy require — keeps the edge bundle (which has no node:async_hooks)
    // from blowing up at import time. We accept the dynamic require here
    // because the alternative (top-level dynamic import) would force
    // every caller to await initialization, which defeats the purpose
    // of an ambient context.
    const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks')
    storage = new AsyncLocalStorage<CorrelationStore>()
    return storage
  } catch {
    return null
  }
}

export function runWithCorrelation<T>(correlationId: string, fn: () => T): T {
  const s = getStorage()
  if (!s) return fn()
  return s.run({ correlationId }, fn)
}

export function getCorrelationId(): string | undefined {
  const s = getStorage()
  return s?.getStore()?.correlationId
}

export const CORRELATION_HEADER = 'x-correlation-id'
