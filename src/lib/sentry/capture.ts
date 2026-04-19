/**
 * Server-side helpers to enrich Sentry captures with the context the
 * runbook (#416) and the correlation-id convention (#414) depend on.
 *
 * Everything in this file is a no-op when Sentry is not configured, so
 * call sites can use it unconditionally without branching on DSN state.
 */

import { isSentryEnabled } from './config'

interface CaptureContext {
  correlationId?: string
  checkoutAttemptId?: string
  orderId?: string
  orderNumber?: string
  userId?: string
  scope?: string
  [key: string]: unknown
}

/**
 * Capture an exception to Sentry with structured tags and contexts.
 *
 * Tags land on the event as short, indexable fields that Sentry can
 * filter by (correlationId, checkoutAttemptId, scope). Contexts carry
 * richer structured data. Fingerprint is keyed on scope so repeats
 * of the same error class group correctly in the Sentry inbox.
 *
 * Returns the Sentry event id so callers can surface it to the user
 * (e.g. in the 500 page) and match it back to log lines with the
 * same correlationId.
 */
export async function captureServerError(
  error: unknown,
  context: CaptureContext = {}
): Promise<string | null> {
  if (!isSentryEnabled) return null

  try {
    const Sentry = await import('@sentry/nextjs')
    return Sentry.withScope((scope) => {
      if (context.correlationId) scope.setTag('correlationId', context.correlationId)
      if (context.checkoutAttemptId) scope.setTag('checkoutAttemptId', context.checkoutAttemptId)
      if (context.scope) scope.setTag('domain.scope', context.scope)
      if (context.orderId) scope.setContext('order', {
        id: context.orderId,
        number: context.orderNumber,
      })
      if (context.userId) scope.setUser({ id: context.userId })

      // Group errors by domain scope when provided so the inbox stays
      // readable (one issue per scope instead of one per stack).
      if (context.scope) scope.setFingerprint([context.scope])

      return Sentry.captureException(error) || null
    })
  } catch {
    // Never let instrumentation crash the caller.
    return null
  }
}

/**
 * Non-error capture — useful for logging a structured warning that we
 * want the oncall to see in Sentry even though no throw happened.
 * Example: `checkout.confirm_amount_mismatch` is worth a Sentry event,
 * not just a log line.
 */
export async function captureServerMessage(
  message: string,
  context: CaptureContext = {}
): Promise<string | null> {
  if (!isSentryEnabled) return null

  try {
    const Sentry = await import('@sentry/nextjs')
    return Sentry.withScope((scope) => {
      scope.setLevel('warning')
      if (context.correlationId) scope.setTag('correlationId', context.correlationId)
      if (context.scope) scope.setTag('domain.scope', context.scope)
      if (context.userId) scope.setUser({ id: context.userId })
      return Sentry.captureMessage(message) || null
    })
  } catch {
    return null
  }
}
