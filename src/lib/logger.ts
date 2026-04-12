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

  if (isProduction()) {
    process.stdout.write(JSON.stringify(entry) + '\n')
    return
  }

  const tag = `[${entry.scope}]`
  const payload = entry.context ?? {}
  switch (entry.level) {
    case 'error':
      console.error(tag, entry.message ?? '', payload)
      break
    case 'warn':
      console.warn(tag, entry.message ?? '', payload)
      break
    case 'info':
      console.info(tag, entry.message ?? '', payload)
      break
    case 'debug':
      console.debug(tag, entry.message ?? '', payload)
      break
  }
}

export interface Logger {
  debug: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  info: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  warn: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
  error: (scope: string, messageOrContext?: string | LogContext, context?: LogContext) => void
}

export const logger: Logger = {
  debug: (scope, message, context) => writeEntry(buildLogEntry('debug', scope, message, context)),
  info: (scope, message, context) => writeEntry(buildLogEntry('info', scope, message, context)),
  warn: (scope, message, context) => writeEntry(buildLogEntry('warn', scope, message, context)),
  error: (scope, message, context) => writeEntry(buildLogEntry('error', scope, message, context)),
}
