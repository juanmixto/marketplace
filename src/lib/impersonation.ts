/**
 * Admin-support impersonation (ticket #351).
 *
 * Lets users with ADMIN_SUPPORT / SUPERADMIN role start a short-lived
 * "view as vendor" session to reproduce issues reported by a producer.
 *
 * MVP design choices (explicitly not the full ticket scope):
 *   - Stateless signed tokens (HMAC-SHA256 over AUTH_SECRET). No DB tables,
 *     no per-session revocation. Tokens expire at `exp` and cannot be
 *     revoked before then — mitigated by the short 15-minute TTL.
 *   - Audit log goes through the structured logger (`logger.info` with
 *     `scope: 'impersonation.*'`). Hook up to Datadog/Loki/Sentry via
 *     LOGGER_SINK when wiring production.
 *   - Feature-flagged behind `IMPERSONATION_ENABLED=true`. While the flag
 *     is off, `startImpersonation` server-action refuses to create new
 *     tokens and `getImpersonationContext` returns null. Turning the flag
 *     on requires no code change.
 *   - Read-only is enforced at the guard layer: `requireVendor()` returns
 *     `{ isImpersonating: true, readOnly }` on the session, and a shared
 *     helper `assertNotReadOnlyImpersonation()` is meant to be called at
 *     the top of every vendor mutation. Wiring every mutation is tracked
 *     as follow-up work in #351.
 *
 * A future iteration can back this with an `ImpersonationSession` table
 * without changing the public interface of this module.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const IMPERSONATION_COOKIE = 'mp_impersonation'
export const IMPERSONATION_TTL_SECONDS = 15 * 60 // 15 minutes
export const IMPERSONATION_ENABLED_ENV_VAR = 'IMPERSONATION_ENABLED'

export interface ImpersonationPayload {
  /** Short session id — random, used as a stable handle in audit logs. */
  sid: string
  /** User id of the admin who initiated the impersonation. */
  adminId: string
  /** User id of the vendor being impersonated (owner of the Vendor row). */
  targetUserId: string
  /** Vendor row id being impersonated. */
  vendorId: string
  /** When true, all mutations are blocked by the guard layer. */
  readOnly: boolean
  /** Unix timestamp (seconds) at which the token becomes invalid. */
  exp: number
}

export interface ImpersonationContext extends ImpersonationPayload {
  /** Remaining seconds until exp. */
  remainingSeconds: number
}

export function isImpersonationEnabled(): boolean {
  return process.env[IMPERSONATION_ENABLED_ENV_VAR] === 'true'
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) {
    // Fail loud: impersonation depends on a cryptographically strong secret.
    throw new Error('[impersonation] AUTH_SECRET must be configured')
  }
  return secret
}

function toBase64Url(input: Buffer): string {
  return input.toString('base64url')
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

function sign(payload: string): string {
  return toBase64Url(createHmac('sha256', getSecret()).update(payload).digest())
}

export function signImpersonationToken(
  payload: Omit<ImpersonationPayload, 'exp'>,
  ttlSeconds: number = IMPERSONATION_TTL_SECONDS
): string {
  const body: ImpersonationPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const bodyEncoded = toBase64Url(Buffer.from(JSON.stringify(body), 'utf8'))
  const signature = sign(bodyEncoded)
  return `${bodyEncoded}.${signature}`
}

export function verifyImpersonationToken(token: string | null | undefined): ImpersonationContext | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const bodyEncoded = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  const expected = sign(bodyEncoded)
  const expectedBuf = fromBase64Url(expected)
  const actualBuf = fromBase64Url(signature)
  if (expectedBuf.length !== actualBuf.length) return null
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null

  let parsed: ImpersonationPayload
  try {
    parsed = JSON.parse(fromBase64Url(bodyEncoded).toString('utf8'))
  } catch {
    return null
  }

  if (
    typeof parsed.sid !== 'string' ||
    typeof parsed.adminId !== 'string' ||
    typeof parsed.targetUserId !== 'string' ||
    typeof parsed.vendorId !== 'string' ||
    typeof parsed.readOnly !== 'boolean' ||
    typeof parsed.exp !== 'number'
  ) {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (parsed.exp <= now) return null

  return { ...parsed, remainingSeconds: parsed.exp - now }
}

export function createImpersonationSessionId(): string {
  // 12 bytes = 16 base64url chars. Enough entropy to uniquely identify a
  // session in audit logs without being guessable.
  return toBase64Url(
    Buffer.from(Array.from({ length: 12 }, () => Math.floor(Math.random() * 256)))
  )
}

/**
 * Called at the top of every vendor mutation that must NOT run while a
 * read-only impersonation session is active. Throws when blocked so the
 * error bubbles up through Next's server-action error boundary.
 */
export function assertNotReadOnlyImpersonation(context: ImpersonationContext | null): void {
  if (context?.readOnly) {
    throw new Error('[impersonation] This session is read-only. Mutations are blocked.')
  }
}
