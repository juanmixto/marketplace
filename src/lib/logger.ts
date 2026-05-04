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

  // P1-2 (#1189): auto-apply deep redaction before any sink (stdout in
  // prod, console in dev). Until #1189 the redact() helper was shallow
  // and opt-in, which meant call sites that passed nested objects
  // (`logger.info('x', { user: { password } })`) leaked the value into
  // Loki / Vercel logs. Sentry already had its own deep scrubber; this
  // brings the structured-log path to parity.
  const safeEntry: LogEntry = entry.context
    ? { ...entry, context: scrubLogContext(entry.context) }
    : entry

  if (isProduction()) {
    process.stdout.write(JSON.stringify(safeEntry) + '\n')
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

export interface Logger {
  debug: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  info: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  warn: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  error: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
}

// ─── PII redaction ───────────────────────────────────────────────────────────

const REDACTED = '[REDACTED]'

// Keys we redact by default. Match case-insensitively as a substring so
// both `password` and `userPassword` collapse to the same rule.
const DEFAULT_REDACT_KEY_PATTERN =
  /(password|token|cookie|authorization|secret|apikey|api_key|client_secret|clientsecret|stripe_secret|stripesecretkey|webhook_secret|cardnumber|card_number|cvv|cvc|iban|bic|swift|session)/i

// Patterns inside string VALUES — catches a user email pasted into an
// otherwise-safe key (e.g. logger.info('boom', { error: 'failed for a@b.com' })).
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// Stripe-style tokens. Live and test prefixes only (sk_/pk_/whsec_/pi_/cs_/...).
const STRIPE_TOKEN_PATTERN = /\b(pi|ch|cs|sk|pk|evt|in|sub|cus|seti|pm|whsec)_[A-Za-z0-9_]{14,}\b/g
// Long bearer-ish tokens (JWTs).
const LONG_BEARER_PATTERN = /\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g

function scrubString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(LONG_BEARER_PATTERN, REDACTED)
    .replace(STRIPE_TOKEN_PATTERN, REDACTED)
}

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
        const correlationId = context?.correlationId
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
