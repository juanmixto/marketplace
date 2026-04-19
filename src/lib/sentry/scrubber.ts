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

const REDACTED = '[redacted]'

// Keys we match case-insensitively against Sentry event field names.
const REDACT_KEY_PATTERN =
  /(password|token|cookie|authorization|session|secret|apikey|api_key|clientsecret|client_secret|cardnumber|card_number|cvv|cvc|iban|bic|swift|phone|telefono|email|correo|address|direccion|postalcode|cp)/i

// Value patterns — scrub inside any string, including URLs and free text.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// Intl phone: 6-15 digits, optional leading +, optional separators.
const PHONE_PATTERN = /\+?\d[\d\s\-().]{5,14}\d/g
// Stripe-style tokens: starts with pi_/ch_/cs_/sk_/pk_/evt_/in_/sub_/cus_ then 16+ chars.
const STRIPE_TOKEN_PATTERN = /\b(pi|ch|cs|sk|pk|evt|in|sub|cus|seti|pm)_[A-Za-z0-9_]{14,}\b/g
// Long bearer-ish tokens (JWTs, API keys).
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g

function scrubString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(LONG_TOKEN_PATTERN, REDACTED)
    .replace(STRIPE_TOKEN_PATTERN, REDACTED)
    .replace(PHONE_PATTERN, REDACTED)
}

/**
 * Deep-walk an object, scrubbing keys and values in place. Cycles are
 * tracked via a visited set so we never stack-overflow on self-referential
 * error payloads (Prisma's structured errors can have them).
 */
export function scrubPayload<T>(input: T, visited = new WeakSet<object>()): T {
  if (input == null) return input
  if (typeof input === 'string') return scrubString(input) as unknown as T
  if (typeof input !== 'object') return input

  if (visited.has(input as object)) return input
  visited.add(input as object)

  if (Array.isArray(input)) {
    return input.map((v) => scrubPayload(v, visited)) as unknown as T
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (REDACT_KEY_PATTERN.test(key)) {
      out[key] = REDACTED
      continue
    }
    out[key] = scrubPayload(value, visited)
  }
  return out as unknown as T
}

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
  } catch {
    // Paranoid: if scrubbing itself crashes, drop the event rather than
    // leaking un-scrubbed data. A missing event is a better failure mode.
    return null
  }
}
