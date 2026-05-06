/**
 * PII detection + audit logging for admin search inputs (#1353).
 *
 * Admin pages let an operator search by free-text. The same field can
 * legitimately match an `orderNumber` ("ORD-123…") OR enumerate the
 * customer base ("@gmail.com", "+346…", "28001"). Without an audit
 * trail an admin (or compromised account) can browse the personal-data
 * graph and leave no forensic trace; with one, every PII-shaped
 * search lands in `AuditLog` keyed by a sha256 of the query so the
 * literal email/phone never enters the audit table itself.
 *
 * The rate-limit guard fires `admin.search.pii_burst` when the same
 * actor performs ≥ 20 PII searches in 10 minutes. Real moderation
 * work doesn't pattern-match like this — that signal is what
 * PostHog/Sentry alerts are tuned for.
 */

import crypto from 'node:crypto'
import { checkRateLimit } from '@/lib/ratelimit'
import { logger } from '@/lib/logger'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'

export type PiiQueryKind = 'email' | 'phone' | 'postal' | 'free-text'

/**
 * Classifies a search input as PII or free-text. The matchers are
 * deliberately permissive: a partial `@gmail.com` or `+346` is still
 * an enumeration probe even when the value isn't a fully-formed
 * email / phone, so we count those as PII.
 *
 * Returns the FIRST class that matches; the caller doesn't need a
 * "list of classes". Free-text inputs (orderNumber, vendor name,
 * product slug) return `'free-text'` and are not audited.
 */
export function detectPiiInQuery(q: string): PiiQueryKind {
  const value = q.trim()
  if (value.length === 0) return 'free-text'

  // Email: anything containing '@' followed by something dot-something
  // is treated as PII even if it's a partial probe. `juan@`,
  // `@gmail.com`, `juan@example.com` all match.
  if (/@/.test(value) && /[a-zA-Z0-9.-]\.[a-zA-Z]{2,}|@/.test(value)) {
    return 'email'
  }
  // ES phone — strict (mobiles 6/7, landlines 8/9) OR partial intl
  // probes (+34X, +346…). The strict form matches the full 9-digit
  // local; the loose form catches the early-typing probes.
  if (
    /\b(?:\+34\s?)?[6-9]\d{6,8}\b/.test(value)
    || /^\+\d{1,3}\d?$/.test(value)
  ) {
    return 'phone'
  }
  // Spanish postal code: exactly 5 digits. Catch 4-digit probes too
  // since CP enumeration usually starts narrow.
  if (/^\d{4,5}$/.test(value)) {
    return 'postal'
  }

  return 'free-text'
}

/**
 * Stable hash of the query term for audit storage. We never want the
 * literal email / phone in `AuditLog.after` — the audit trail is itself
 * a PII surface. The hash lets a forensic investigator confirm "did
 * actor X search for `juan@example.com` between 14:00-15:00?" by
 * computing the same sha256 of the suspect value, but doesn't enable
 * extraction of the raw search terms from the audit table.
 */
export function hashSearchTerm(q: string): string {
  return crypto.createHash('sha256').update(q.trim().toLowerCase()).digest('hex')
}

const PII_BURST_LIMIT = 20
const PII_BURST_WINDOW_SECONDS = 10 * 60 // 10 minutes

/**
 * Records an admin search audit entry when the query is PII-shaped,
 * and emits `admin.search.pii_burst` when the actor crosses the
 * 20-in-10-minutes threshold. Calls are awaited so the audit row is
 * persisted before the search results return; the cost is one
 * INSERT per PII search.
 *
 * Returns the classification so callers can decide whether to also
 * track it through their own analytics surface.
 */
export interface AuditAdminSearchInput {
  scope: string
  actorId: string
  actorRole: string
  query: string
  matchedCount: number
}

export async function auditAdminSearch(
  input: AuditAdminSearchInput,
): Promise<{ kind: PiiQueryKind; audited: boolean; burst: boolean }> {
  const kind = detectPiiInQuery(input.query)
  if (kind === 'free-text') {
    return { kind, audited: false, burst: false }
  }

  const ip = await getAuditRequestIp()
  const qHash = hashSearchTerm(input.query)

  await createAuditLog({
    action: 'DATA_SEARCH',
    entityType: input.scope,
    entityId: qHash,
    after: {
      qHash,
      kind,
      matchedCount: input.matchedCount,
    },
    actorId: input.actorId,
    actorRole: input.actorRole,
    ip,
  })

  // Non-failing rate-limit check: we WANT every search to land in
  // audit even if the actor is in the noisy bucket. The threshold
  // alert is fire-and-forget on top.
  const result = await checkRateLimit(
    `admin-search-pii:${input.scope}`,
    input.actorId,
    PII_BURST_LIMIT,
    PII_BURST_WINDOW_SECONDS,
  )

  if (!result.success) {
    logger.warn('admin.search.pii_burst', {
      scope: input.scope,
      actorId: input.actorId,
      actorRole: input.actorRole,
      kind,
      // Numbers, never the raw query.
      windowSeconds: PII_BURST_WINDOW_SECONDS,
      threshold: PII_BURST_LIMIT,
    })
    return { kind, audited: true, burst: true }
  }

  return { kind, audited: true, burst: false }
}
