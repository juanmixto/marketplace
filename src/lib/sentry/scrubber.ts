/**
 * PII scrubber for Sentry events (#523).
 *
 * Runs as `beforeSend` / `beforeSendTransaction` hook on every Sentry
 * event before it leaves the server/client. Removes every known PII
 * field we can identify by name or pattern. A leak here is a GDPR
 * exposure, so this module is paranoid by design:
 *
 *   - Keys matching any REDACT_KEY_PATTERN → value replaced with '[redacted]'
 *   - String values matching EMAIL_PATTERN / PHONE_PATTERN / TOKEN_PATTERN
 *     (anywhere, even inside URL search params or free-text fields) →
 *     replaced in place
 *   - Cookies/headers/user fields stripped to a minimal safe shape
 *
 * Tested in `test/features/sentry-scrubber.test.ts` — any change to the
 * patterns must come with a test that proves the new input is caught.
 */

import type { Event, EventHint } from '@sentry/nextjs'
import { scrubPayload, scrubString } from '@/lib/scrubber'

// Sentry's Request type is not publicly re-exported from @sentry/nextjs.
// Re-declare the structural shape we touch — matches the Sentry SDK's
// internal `Request` interface and will fail to compile if they add a
// required field we don't know about.
interface SentryRequest {
  url?: string
  method?: string
  query_string?: string | Record<string, string>
  headers?: Record<string, string>
  cookies?: Record<string, string>
  data?: unknown
  env?: Record<string, string>
}

// Re-export so existing call sites (and the test suite) don't churn (#1354).
export { scrubPayload }

/**
 * Clean up Sentry's `request` payload: drop cookies, strip PII from
 * query strings and headers, keep only whitelisted header names.
 */
function scrubRequest(req: SentryRequest | undefined): SentryRequest | undefined {
  if (!req) return req
  const safeHeaders: Record<string, string> = {}
  if (req.headers) {
    // Allow-list of non-sensitive headers. Everything else dropped.
    const ALLOWED_HEADERS = new Set([
      'user-agent',
      'accept',
      'accept-language',
      'x-forwarded-proto',
      'x-vercel-id',
      'x-correlation-id',
    ])
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value !== 'string') continue
      if (ALLOWED_HEADERS.has(name.toLowerCase())) safeHeaders[name] = value
    }
  }
  const cleaned: SentryRequest = {
    ...req,
    headers: safeHeaders,
    // Cookies are all-redacted, not just session ones — even a tracking
    // cookie could be linked back to a user.
    cookies: undefined,
    data: req.data ? scrubPayload(req.data) : undefined,
  }
  if (cleaned.url) cleaned.url = scrubString(cleaned.url)
  if (cleaned.query_string && typeof cleaned.query_string === 'string') {
    cleaned.query_string = scrubString(cleaned.query_string)
  }
  return cleaned
}

/**
 * Sentry `beforeSend` hook. Returns `null` to drop the event entirely,
 * or the scrubbed event otherwise. Never throws — a throw here crashes
 * the entire Sentry transport.
 */
export function scrubSentryEvent(event: Event, _hint?: EventHint): Event | null {
  try {
    const cleaned: Event = { ...event }

    // User: keep only internal id (opaque to external observers), drop
    // everything else. Email / username / IP are PII.
    if (cleaned.user) {
      cleaned.user = cleaned.user.id ? { id: cleaned.user.id } : undefined
    }

    // Request: handled above.
    if (cleaned.request) {
      cleaned.request = scrubRequest(cleaned.request as SentryRequest) as Event['request']
    }

    // Extra / contexts / breadcrumbs: deep-walk.
    if (cleaned.extra) cleaned.extra = scrubPayload(cleaned.extra)
    if (cleaned.contexts) cleaned.contexts = scrubPayload(cleaned.contexts)
    if (cleaned.tags) cleaned.tags = scrubPayload(cleaned.tags)
    if (cleaned.breadcrumbs) {
      cleaned.breadcrumbs = cleaned.breadcrumbs.map((b) => ({
        ...b,
        message: b.message ? scrubString(b.message) : b.message,
        data: b.data ? scrubPayload(b.data) : b.data,
      }))
    }

    // Exception values: messages may embed emails / tokens.
    if (cleaned.exception?.values) {
      cleaned.exception = {
        ...cleaned.exception,
        values: cleaned.exception.values.map((v) => ({
          ...v,
          value: v.value ? scrubString(v.value) : v.value,
        })),
      }
    }
    if (cleaned.message) cleaned.message = scrubString(cleaned.message)

    return cleaned
  } catch (err) {
    // Paranoid: if scrubbing itself crashes, drop the event rather than
    // leaking un-scrubbed data. A missing event is a better failure mode.
    //
    // But don't crash silently — a scrubber that keeps throwing means every
    // error in the app is being swallowed on its way to Sentry, which is an
    // observability dead-zone that is itself invisible. Log to stderr (not
    // via `logger`, to avoid any risk of a re-entrant Sentry capture) so
    // operators can see the problem in server logs even when Sentry is dark.
    try {
      console.error('[sentry-scrubber] crashed — dropping event', {
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : String(err),
      })
    } catch {
      // Absolute last resort: never let console.error itself kill the app.
    }
    return null
  }
}
