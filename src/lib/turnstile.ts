/**
 * Cloudflare Turnstile server-side verification (#1273).
 *
 * Invisible captcha for register + forgot-password. Two contracts:
 *
 * - **Fail-open by env**: when `TURNSTILE_SECRET_KEY` is unset (dev,
 *   pre-rollout, or a transient secret rotation), every request is
 *   accepted. The widget is also a no-op without `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 *   on the client side. This lets the code land + start protecting
 *   the moment ops adds the secrets, without a redeploy gate.
 *
 * - **Fail-closed on verify error**: once the secret IS configured, a
 *   network error or "siteverify" 5xx returns `{ ok: false }` and the
 *   endpoint refuses the request. A Cloudflare outage is not the
 *   moment to also unblock unbounded registration sprays.
 *
 * Endpoint and request shape per Cloudflare docs:
 *   https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

import { fetchWithTimeout, FetchTimeoutError } from '@/lib/fetch-with-timeout'
import { logger } from '@/lib/logger'

export const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export interface TurnstileVerifyResult {
  /**
   * `true` when:
   *   - Turnstile is not configured (fail-open by env), OR
   *   - Cloudflare returned `success: true` on the token.
   *
   * `false` when Turnstile IS configured AND verification failed
   * (bad token, expired, replay, network error during siteverify).
   */
  ok: boolean
  /** When `ok: false`, the operator-readable reason. */
  reason?: string
}

interface CloudflareSiteverifyResponse {
  success: boolean
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
  action?: string
  cdata?: string
}

/**
 * Verifies a Turnstile token against the Cloudflare siteverify
 * endpoint. Returns `{ ok: true }` when the token is valid OR when
 * Turnstile is not configured (fail-open by env).
 *
 * `remoteIp` is optional — Cloudflare uses it for risk scoring but
 * the verify call works without it. When you have it (from
 * `getClientIP` / `getAuditRequestIp`), pass it.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // Fail-open by env: the deployment hasn't enabled Turnstile yet.
    // The widget on the client side is also a no-op without
    // NEXT_PUBLIC_TURNSTILE_SITE_KEY, so requests don't carry a
    // token and the verify path is never exercised in this mode.
    return { ok: true }
  }

  if (!token || typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'missing-token' }
  }

  // Cloudflare docs cap the token at ~2KB; refuse larger payloads
  // before paying for the network round-trip.
  if (token.length > 2048) {
    return { ok: false, reason: 'token-too-long' }
  }

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const res = await fetchWithTimeout(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      // 5s is generous; Cloudflare's siteverify usually answers in <200ms.
      // The endpoint rejecting a request is preferable to letting the
      // user wait 30s on a Cloudflare partial outage.
      timeoutMs: 5_000,
    })

    if (!res.ok) {
      logger.warn('security.turnstile.siteverify_error', {
        status: res.status,
      })
      return { ok: false, reason: `siteverify-${res.status}` }
    }

    const data = (await res.json()) as CloudflareSiteverifyResponse
    if (data.success === true) {
      return { ok: true }
    }

    logger.warn('security.turnstile.failed', {
      errorCodes: data['error-codes'],
    })
    return {
      ok: false,
      reason: data['error-codes']?.join(',') ?? 'unknown',
    }
  } catch (err) {
    if (err instanceof FetchTimeoutError) {
      logger.warn('security.turnstile.timeout', {})
      return { ok: false, reason: 'siteverify-timeout' }
    }
    logger.error('security.turnstile.unexpected', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, reason: 'siteverify-network' }
  }
}

/**
 * Convenience: peek at the env var without leaking it to the client.
 * Useful for the route handlers that want to skip the verify step
 * entirely instead of letting the helper return ok:true silently.
 */
export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY)
}
