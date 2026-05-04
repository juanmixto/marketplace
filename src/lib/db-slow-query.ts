import { Prisma } from '@/generated/prisma/client'
import { logger } from '@/lib/logger'

/**
 * Prisma extension that logs every query slower than `DB_SLOW_QUERY_MS`
 * (default 500ms) at warn level under scope `db.query.slow` (#1216).
 *
 * Slow queries are the #1 predictor of production degradation: a fresh
 * N+1 introduced in a refactor, a missing index after a schema change,
 * a Postgres plan flip on a stale ANALYZE — all of these surface as
 * latency, not errors, so Sentry alone never sees them. This extension
 * gives observability the signal it needs without touching call sites.
 *
 * The structured event includes:
 *   - `model`     — `User`, `Order`, etc. (undefined for raw queries)
 *   - `operation` — `findFirst`, `update`, `$queryRaw`, etc.
 *   - `durationMs`
 *
 * We deliberately do NOT log the SQL or the args:
 *   - args may contain PII (email, phone, address fragments, …)
 *   - the SQL is reconstructible from `model` + `operation` for almost
 *     every case where you'd actually need to debug
 *
 * The threshold is configurable per-process via `DB_SLOW_QUERY_MS`. We
 * read directly from `process.env` instead of `getServerEnv()` because
 * this module is loaded by `db.ts`, which is itself loaded eagerly by
 * almost every server file — going through the env loader would create
 * an import-time cycle.
 *
 * Errors thrown inside the extension are NOT swallowed: if `query()`
 * rejects (a Prisma error, e.g. unique constraint violation), the
 * rejection propagates to the caller exactly like before. The duration
 * log fires either way (success OR failure) so you can see whether a
 * timeout is happening on a slow query vs an outright crash.
 */

function readThresholdMs(): number {
  const raw = process.env.DB_SLOW_QUERY_MS
  if (!raw) return 500
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 500
  return Math.floor(n)
}

let cachedThresholdMs: number | null = null

function getThresholdMs(): number {
  if (cachedThresholdMs === null) cachedThresholdMs = readThresholdMs()
  return cachedThresholdMs
}

/**
 * Reset the cached threshold. Test-only — production reads the env
 * once per process, which matches typical server lifetime.
 */
export function _resetSlowQueryThresholdForTests(): void {
  cachedThresholdMs = null
}

/**
 * Exported separately from the extension wrapper so tests can call it
 * directly. `Prisma.defineExtension(...)` returns an opaque function
 * (the value passed to `client.$extends()`), which is not introspectable;
 * keeping the handler standalone is the only practical way to unit-test
 * the timing + log contract without running a real Postgres.
 */
export async function observeSlowQuery<T>(params: {
  model?: string | undefined
  operation: string
  args: unknown
  query: (args: unknown) => Promise<T>
}): Promise<T> {
  const { model, operation, args, query } = params
  const start = Date.now()
  let success = true
  try {
    return await query(args)
  } catch (err) {
    success = false
    throw err
  } finally {
    const durationMs = Date.now() - start
    if (durationMs >= getThresholdMs()) {
      logger.warn('db.query.slow', {
        model,
        operation,
        durationMs,
        // success=false means the query rejected; useful when a slow
        // query is also a failing one (timeout, deadlock).
        success,
      })
    }
  }
}

export const SLOW_QUERY_EXTENSION_NAME = 'db-slow-query-observer'

export const slowQueryExtension = Prisma.defineExtension({
  name: SLOW_QUERY_EXTENSION_NAME,
  query: {
    $allOperations(params) {
      return observeSlowQuery(params) as ReturnType<typeof params.query>
    },
  },
})
