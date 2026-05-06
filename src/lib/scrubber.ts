/**
 * Unified PII scrubber (#1354, epic #1346).
 *
 * Single source of truth for the redaction patterns shared by:
 *   - `src/lib/logger.ts` — logs that flow to stdout / Loki / Vercel
 *   - `src/lib/sentry/scrubber.ts` — Sentry events (server + client)
 *
 * Pre-#1354 the two had drifted: the logger was missing phone /
 * postal-address / DNI-NIE / IBAN-value patterns that Sentry already
 * had. A log line that wrote `phone: '+34 600 123 456'` made it to
 * stdout in the clear while the same field was scrubbed in Sentry.
 *
 * Everything in this module is pure (no I/O, no logger calls) so it
 * can be imported from either runtime without circular-dep risk.
 *
 * Tested in `test/features/scrubber.test.ts` — every new pattern MUST
 * come with a test, and the parity test asserts logger ≡ Sentry on
 * the canonical PII corpus.
 */

export const REDACTED = '[redacted]'
/** Logger uses uppercase historically. Both forms are accepted. */
export const REDACTED_LOGGER = '[REDACTED]'

/**
 * Keys we redact case-insensitively as a substring (so `userPassword`
 * collapses to the `password` rule). New entries: `phone|telefono`,
 * `address|direccion|postalcode|cp`, `dni|nie`. Bumping the regex is
 * the single edit point — both logger and Sentry pick it up.
 */
export const REDACT_KEY_PATTERN =
  /(password|token|cookie|authorization|session|secret|apikey|api_key|client_secret|clientsecret|stripe_secret|stripesecretkey|webhook_secret|cardnumber|card_number|cvv|cvc|iban|bic|swift|email|correo|phone|telefono|address|direccion|postalcode|cp|dni|nie)/i

// ─── Value patterns ──────────────────────────────────────────────────────────

/** Email anywhere inside a string. */
export const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

/**
 * Stripe-style tokens. Live and test prefixes covered.
 * `pi_`, `ch_`, `cs_`, `sk_`, `pk_`, `whsec_`, `evt_`, `in_`, `sub_`,
 * `cus_`, `seti_`, `pm_`.
 */
export const STRIPE_TOKEN_PATTERN =
  /\b(pi|ch|cs|sk|pk|evt|in|sub|cus|seti|pm|whsec)_[A-Za-z0-9_]{14,}\b/g

/** Long bearer / JWT-shaped tokens. Three dot-separated base64url segments. */
export const LONG_TOKEN_PATTERN =
  /\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g

/**
 * Spanish DNI / NIE, value scope. DNI: 8 digits + checksum letter.
 * NIE: leading X/Y/Z + 7 digits + checksum letter. We do NOT validate
 * the checksum — over-redaction is preferred to under-redaction, and
 * a 7-digit ID with a trailing capital is rare enough as a coincidence
 * inside log payloads.
 */
export const DNI_NIE_PATTERN = /\b[XYZ]?\d{7,8}[A-Z]\b/g

/**
 * Spanish phone number, normalised form (no internal separators).
 * Mobiles start with 6 or 7, landlines with 8 or 9. Optional `+34`
 * prefix and one space after it.
 */
export const PHONE_ES_PATTERN = /\b(?:\+34\s?)?[6-9]\d{8}\b/g

/**
 * Permissive phone fallback: digit, then digits / spaces / dashes /
 * dots / parens / slashes, ending in a digit. Catches the common
 * separator-rich forms (`600-123-456`, `(34) 600 12 34 56`) the
 * normalised pattern misses. Bounded so we don't swallow every long
 * digit run in a free-text payload.
 */
export const PHONE_PATTERN = /\+?\d[\d\s\-().]{5,14}\d/g

/**
 * IBAN as a value (in case the field name doesn't match the key
 * pattern, e.g. a free-text "Mi cuenta es ES91 2100 …"). Country code
 * + 2 check digits + up to 30 alphanum. Prefix-anchored on word
 * boundary so we don't mangle ordinary uppercase identifiers.
 */
export const IBAN_VALUE_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{8,30}\b/g

/**
 * Apply every value-pattern in a stable order. Long tokens first so
 * the JWT-like shape doesn't get partially rewritten by a sub-pattern
 * (e.g. an embedded email inside the JWT body).
 *
 * Pure: no logging, no I/O. Safe to call from any runtime.
 */
export function scrubString(value: string): string {
  return value
    .replace(LONG_TOKEN_PATTERN, REDACTED)
    .replace(STRIPE_TOKEN_PATTERN, REDACTED)
    .replace(IBAN_VALUE_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(DNI_NIE_PATTERN, REDACTED)
    .replace(PHONE_ES_PATTERN, REDACTED)
    .replace(PHONE_PATTERN, REDACTED)
}

/**
 * Logger-flavoured wrapper using the uppercase `[REDACTED]` token
 * many existing log lines already match against in tests. Same
 * patterns underneath; differs only in the replacement string.
 */
export function scrubStringLogger(value: string): string {
  return value
    .replace(LONG_TOKEN_PATTERN, REDACTED_LOGGER)
    .replace(STRIPE_TOKEN_PATTERN, REDACTED_LOGGER)
    .replace(IBAN_VALUE_PATTERN, REDACTED_LOGGER)
    .replace(EMAIL_PATTERN, REDACTED_LOGGER)
    .replace(DNI_NIE_PATTERN, REDACTED_LOGGER)
    .replace(PHONE_ES_PATTERN, REDACTED_LOGGER)
    .replace(PHONE_PATTERN, REDACTED_LOGGER)
}

/**
 * Deep-walk an object, scrubbing keys and values in place. Cycles
 * are tracked via a visited set so we never stack-overflow on self-
 * referential payloads (Prisma's structured errors can have them).
 *
 * Used by Sentry's `beforeSend`. The logger needs slightly different
 * semantics (passes Error instances through unchanged, applies an
 * `extraKeys` allowlist) and keeps its own walker that imports
 * `scrubStringLogger` + `REDACT_KEY_PATTERN` from this module.
 */
export function scrubPayload<T>(input: T, visited = new WeakSet<object>()): T {
  if (input == null) return input
  if (typeof input === 'string') return scrubString(input) as unknown as T
  if (typeof input !== 'object') return input

  if (visited.has(input as object)) return input
  visited.add(input as object)

  if (Array.isArray(input)) {
    return input.map(v => scrubPayload(v, visited)) as unknown as T
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
