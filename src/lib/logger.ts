/**
 * Thin structured-logging wrapper.
 *
 * In development: pretty-printed to stderr/stdout via console.* so devs
 * can read it while running the app.
 *
 * In production: emits one JSON line per log entry to stdout so standard
 * log aggregators (Datadog, Loki, Vercel) can parse it without extra
 * configuration. Hook a Sentry/Datadog client in here later by setting
 * the LOGGER_SINK env var — the code below is intentionally trivial.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.error('stripe-webhook:confirm', { orderId, err })
 *
 * The first argument is a stable, dotted/dashed "scope" identifier that
 * describes *where* the event came from. The second is structured
 * context you want to search on.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>

export interface LogEntry {
  level: LogLevel
  scope: string
  message?: string
  timestamp: string
  context?: LogContext
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function envLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase()
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Serialize values safely. Errors get `{ name, message, stack }` so we
 * don't silently drop them when JSON.stringify runs.
 */
export function serializeContext(context: LogContext | undefined): LogContext | undefined {
  if (!context) return undefined
  const out: LogContext = {}
  for (const [key, value] of Object.entries(context)) {
    if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message, stack: value.stack }
    } else {
      out[key] = value
    }
  }
  return out
}

export function buildLogEntry(
  level: LogLevel,
  scope: string,
  messageOrContext?: string | LogContext,
  maybeContext?: LogContext
): LogEntry {
  const timestamp = new Date().toISOString()
  let message: string | undefined
  let context: LogContext | undefined

  if (typeof messageOrContext === 'string') {
    message = messageOrContext
    context = maybeContext
  } else {
    context = messageOrContext
  }

  return {
    level,
    scope,
    timestamp,
    ...(message !== undefined ? { message } : {}),
    ...(context ? { context: serializeContext(context) } : {}),
  }
}

function writeEntry(entry: LogEntry) {
  if (LEVEL_RANK[entry.level] < LEVEL_RANK[envLogLevel()]) return

  // #1210: auto-inject ambient correlationId from the AsyncLocalStorage
  // so callers don't have to thread it through every layer. Explicit
  // context.correlationId still wins (e.g. webhook handlers that have a
  // stable per-event id different from the per-request id).
  const enriched = withAmbientContext(entry)

  // P1-2 (#1189): auto-apply deep redaction before any sink (stdout in
  // prod, console in dev). Until #1189 the redact() helper was shallow
  // and opt-in, which meant call sites that passed nested objects
  // (`logger.info('x', { user: { password } })`) leaked the value into
  // Loki / Vercel logs. Sentry already had its own deep scrubber; this
  // brings the structured-log path to parity.
  const safeEntry: LogEntry = enriched.context
    ? { ...enriched, context: scrubLogContext(enriched.context) }
    : enriched

  // Browser bundles inline `process.env.NODE_ENV` as "production" when
  // Next.js builds the client, so isProduction() returns true here too.
  // But `process.stdout` is undefined in the browser — calling .write on
  // it threw "Cannot read properties of undefined (reading 'write')" and
  // killed the entire client bundle (no useEffect runs, no PostHog, no
  // cart, no checkout — full passive page). Detect the browser and fall
  // back to console so a stray client-side import never tumbles
  // hydration. See 2026-05-04 incident; PwaRegister.tsx is the canonical
  // 'use client' caller that triggered the regression.
  if (
    isProduction() &&
    typeof process !== 'undefined' &&
    typeof process.stdout?.write === 'function'
  ) {
    const serialized = JSON.stringify(safeEntry)
    process.stdout.write(serialized + '\n')
    // #1220 — ship to external HTTP NDJSON sink (Axiom / Better Stack
    // / Loki push) when LOGGER_SINK_URL is set. Inert otherwise.
    // `enqueueForSink` is fire-and-forget — never blocks the request
    // path, never throws. A sink outage degrades observability, not
    // user requests.
    enqueueForSink(serialized)
    return
  }
  if (isProduction()) {
    // Browser path: emit a structured console line so future log
    // shippers can still pick it up if the client logger is wired
    // to a sink.
    console.log(JSON.stringify(safeEntry))
    return
  }

  const tag = `[${safeEntry.scope}]`
  const payload = safeEntry.context ?? {}
  switch (safeEntry.level) {
    case 'error':
      console.error(tag, safeEntry.message ?? '', payload)
      break
    case 'warn':
      console.warn(tag, safeEntry.message ?? '', payload)
      break
    case 'info':
      console.info(tag, safeEntry.message ?? '', payload)
      break
    case 'debug':
      console.debug(tag, safeEntry.message ?? '', payload)
      break
  }
}

function withAmbientContext(entry: LogEntry): LogEntry {
  // Lazy-load to avoid pulling node:async_hooks into the edge bundle
  // when the logger is imported from middleware. The require itself is
  // cheap — Node caches the module — so we accept it on every call.
  let ambientCorrelationId: string | undefined
  try {
    const ctx = require('./correlation-context') as typeof import('./correlation-context')
    ambientCorrelationId = ctx.getCorrelationId()
  } catch {
    ambientCorrelationId = undefined
  }
  if (!ambientCorrelationId) return entry
  const existing = entry.context?.correlationId
  if (typeof existing === 'string' && existing.length > 0) return entry
  return {
    ...entry,
    context: { ...(entry.context ?? {}), correlationId: ambientCorrelationId },
  }
}

export interface Logger {
  debug: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  info: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  warn: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  error: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
}

// ─── PII redaction ───────────────────────────────────────────────────────────
//
// #1354: shared patterns + scrubString live in `@/lib/scrubber` so the
// logger and Sentry can never drift again. The deep-walk below stays
// here because logger has slightly different semantics (Error
// instances pass through unchanged, `extraKeys` is supported).

import { enqueueForSink } from '@/lib/logger-sink'
import {
  REDACT_KEY_PATTERN as DEFAULT_REDACT_KEY_PATTERN,
  REDACTED_LOGGER as REDACTED,
  scrubStringLogger as scrubString,
} from '@/lib/scrubber'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * Internal deep-redact used inside writeEntry. Walks the context
 * recursively, replacing values under sensitive keys and scrubbing
 * email/Stripe/JWT-shaped substrings inside any string value. Tracks
 * visited objects via a WeakSet to handle circular refs (Prisma's
 * structured errors can have them) without stack-overflowing.
 *
 * Error instances are passed through unchanged — the higher-level
 * serializeContext step handles them. Arrays are mapped element-wise.
 * Class instances we don't recognise (Maps, Sets, Buffer, Stream) are
 * passed through too — the {} they would serialize to is more useful
 * than '[REDACTED]'.
 */
function scrubLogContext(
  context: LogContext,
  visited: WeakSet<object> = new WeakSet(),
  extraKeys: ReadonlySet<string> | undefined = undefined,
): LogContext {
  return scrubValue(context, visited, extraKeys) as LogContext
}

function scrubValue(
  value: unknown,
  visited: WeakSet<object>,
  extraKeys: ReadonlySet<string> | undefined,
): unknown {
  if (value == null) return value
  if (typeof value === 'string') return scrubString(value)
  if (typeof value !== 'object') return value
  if (value instanceof Error) return value

  if (visited.has(value)) return value
  visited.add(value)

  if (Array.isArray(value)) {
    return value.map(v => scrubValue(v, visited, extraKeys))
  }

  if (!isPlainObject(value)) return value

  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    const isSensitive =
      DEFAULT_REDACT_KEY_PATTERN.test(key) ||
      (extraKeys ? extraKeys.has(key.toLowerCase()) : false)
    out[key] = isSensitive ? REDACTED : scrubValue(v, visited, extraKeys)
  }
  return out
}

/**
 * Redact a single context object. Mostly kept for back-compat with
 * call sites that prefer to pre-scrub before logging; writeEntry now
 * applies the same scrub automatically so this is rarely needed.
 *
 * `extraKeys` adds project-specific keys to the sensitive set in
 * addition to the built-in pattern.
 */
export function redact(
  context: LogContext,
  extraKeys?: readonly string[]
): LogContext {
  const extras = extraKeys
    ? new Set(extraKeys.map(k => k.toLowerCase()))
    : undefined
  return scrubLogContext(context, new WeakSet<object>(), extras)
}

/**
 * Mirror logger.error calls to Sentry (#523) as captureMessage events so
 * oncall sees the same signal in both places. Non-blocking: the dynamic
 * import happens best-effort and is swallowed on failure — a Sentry
 * outage must never break the app's own logging.
 *
 * Kept inline here (not in src/lib/sentry/capture.ts) so the logger
 * stays self-contained and doesn't grow a dependency on another server
 * module that might change signature.
 */
function mirrorErrorToSentry(scope: string, context: LogContext | undefined) {
  // In tests and when no DSN is configured, this is a fast no-op.
  if (process.env.NODE_ENV === 'test') return
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return

  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.withScope((s) => {
        s.setLevel('error')
        s.setTag('domain.scope', scope)
        // #1210: explicit context.correlationId wins; otherwise pull
        // from the per-request ALS so the Sentry event matches the id
        // the user can see in `x-correlation-id` and the structured
        // logs of the same request.
        let correlationId = context?.correlationId
        if (typeof correlationId !== 'string') {
          try {
            const ctx = require('./correlation-context') as typeof import('./correlation-context')
            correlationId = ctx.getCorrelationId()
          } catch {
            correlationId = undefined
          }
        }
        if (typeof correlationId === 'string') s.setTag('correlationId', correlationId)
        const userId = context?.userId
        if (typeof userId === 'string') s.setUser({ id: userId })
        // Capture the error object if the caller attached one; otherwise
        // fall back to a message keyed on the scope so the Sentry issue
        // title is stable ("logger.error:<scope>").
        const err = context?.error
        if (err instanceof Error) {
          Sentry.captureException(err)
        } else {
          Sentry.captureMessage(`logger.error:${scope}`, 'error')
        }
      })
    })
    .catch(() => {
      // Sentry not available — that's fine.
    })
}

export const logger: Logger = {
  debug: (scope, message, context) => writeEntry(buildLogEntry('debug', scope, message, context)),
  info: (scope, message, context) => writeEntry(buildLogEntry('info', scope, message, context)),
  warn: (scope, message, context) => writeEntry(buildLogEntry('warn', scope, message, context)),
  error: (scope, messageOrContext, context) => {
    writeEntry(buildLogEntry('error', scope, messageOrContext, context))
    const effectiveContext =
      typeof messageOrContext === 'string' ? context : messageOrContext
    mirrorErrorToSentry(scope, effectiveContext)
  },
}
