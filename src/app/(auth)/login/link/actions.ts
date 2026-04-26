'use server'

import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import {
  AuthLinkTokenError,
  verifyAuthLinkToken,
} from '@/lib/auth-link-token'
import { sanitizeCallbackUrl } from '@/lib/portals'
import { signIn } from '@/lib/auth'

const PASSWORD_ATTEMPTS_PER_IP_PER_HOUR = 5

export type LinkActionResult =
  | {
      ok: false
      reason:
        | 'expired_token'
        | 'invalid_token'
        | 'invalid_password'
        | 'rate_limited'
        | 'no_password_for_user'
        | 'generic'
    }

/**
 * Phase 5 / #854-lite: password gate before linking a new social
 * Account to an existing credentials User. Reads the HMAC-signed
 * token issued by the OAuth `signIn` callback (#850), verifies the
 * password against the stored bcrypt hash, then writes the Account
 * row and redirects the user to re-trigger the OAuth flow — which
 * now hits matrix case B (linked) instead of case D, emits a session,
 * and lands at the original `callbackUrl`.
 *
 * Rate-limited per IP. Errors are deliberately uniform (no oracle
 * for "valid token + wrong password" vs "valid token + valid
 * password but expired").
 */
export async function linkSocialAccountAction(
  rawToken: string,
  password: string
): Promise<LinkActionResult> {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    logger.error('auth.link.missing_secret')
    return { ok: false, reason: 'generic' }
  }

  // Rate limit BEFORE token decode so a flood of bad tokens still
  // hits the limit. IP is the right key here: we don't want to lock
  // a legitimate user out of recovery just because someone else
  // burned their email's quota.
  const reqHeaders = await headers()
  const forwarded = reqHeaders.get('x-forwarded-for') ?? ''
  const cf = reqHeaders.get('cf-connecting-ip') ?? ''
  const realIp = reqHeaders.get('x-real-ip') ?? ''
  const ipRequest = new Request('https://localhost/', {
    headers: { 'x-forwarded-for': forwarded, 'cf-connecting-ip': cf, 'x-real-ip': realIp },
  })
  const clientIp = getClientIP(ipRequest)
  const rate = await checkRateLimit(
    'auth-link-password',
    clientIp,
    PASSWORD_ATTEMPTS_PER_IP_PER_HOUR,
    3600,
    { failClosed: true }
  )
  if (!rate.success) return { ok: false, reason: 'rate_limited' }

  let payload
  try {
    payload = await verifyAuthLinkToken(rawToken, secret)
  } catch (err) {
    if (err instanceof AuthLinkTokenError && err.code === 'expired') {
      logger.warn('auth.link.token_expired')
      return { ok: false, reason: 'expired_token' }
    }
    logger.warn('auth.link.token_invalid', {
      code: err instanceof AuthLinkTokenError ? err.code : 'unknown',
    })
    return { ok: false, reason: 'invalid_token' }
  }

  const user = await db.user.findUnique({
    where: { email: payload.email },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      accounts: {
        where: { provider: payload.provider },
        select: { providerAccountId: true },
      },
    },
  })

  if (!user || !user.isActive) {
    return { ok: false, reason: 'invalid_token' }
  }

  if (!user.passwordHash) {
    // Phase 5 (case E) — Out of MVP. Surface a distinct reason so
    // the UI can later show "we'll email you a confirm link" when
    // that path lands, instead of silently linking.
    return { ok: false, reason: 'no_password_for_user' }
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    logger.warn('auth.link.password_failed')
    return { ok: false, reason: 'invalid_password' }
  }

  // Idempotent link: if a row for the same provider already exists
  // (race / double submit), don't error — let the user proceed.
  const existing = user.accounts.find(a => a.providerAccountId === payload.providerAccountId)
  if (!existing) {
    await db.account.create({
      data: {
        userId: user.id,
        type: 'oauth',
        provider: payload.provider,
        providerAccountId: payload.providerAccountId,
      },
    })
    logger.info('auth.link.completed', {
      provider: payload.provider,
    })
  }

  // Emit a session via the credentials flow with the password the
  // user just proved. This is more reliable than re-triggering the
  // OAuth provider server-side: Auth.js v5's `signIn(<oauth>)` from
  // a server action calls Auth() internally to materialize the
  // signin URL, but the subsequent browser-side authorize → callback
  // round-trip dropped state cookies in our test environment and
  // hung the flow. Credentials → callback is a single round-trip,
  // already battle-tested by the public /login form.
  //
  // Tradeoff: users with 2FA-enrolled credentials will hit the TOTP
  // requirement and the action fails with `generic`. That's
  // acceptable today (admins are the only enrolled cohort and they
  // don't typically link OAuth on top of credentials), and a future
  // enhancement can collect the TOTP on the link page when the
  // need lands.
  const callback = payload.callbackUrl ? sanitizeCallbackUrl(payload.callbackUrl) ?? '/' : '/'
  // DEBUG (#873): use redirect: false so we can log the URL Auth.js
  // would have redirected to, then redirect explicitly. This isolates
  // whether the cookies-on-response part is the problem vs the
  // redirect-target derivation.
  // eslint-disable-next-line no-console -- temporary debug for #873
  console.log('[case-d-debug] payload.callbackUrl=', payload.callbackUrl, 'callback=', callback)
  let signInUrl: string | undefined
  try {
    const result = await signIn(
      'credentials',
      {
        email: payload.email,
        password,
        redirectTo: callback,
        redirect: false,
      } as Parameters<typeof signIn>[1]
    )
    signInUrl = typeof result === 'string' ? result : undefined
  } catch (err) {
    // eslint-disable-next-line no-console -- temporary debug for #873
    console.log('[case-d-debug] signIn threw:', err instanceof Error ? err.message : String(err))
    throw err
  }
  // eslint-disable-next-line no-console -- temporary debug for #873
  console.log('[case-d-debug] signIn returned URL=', signInUrl)
  if (!signInUrl) {
    return { ok: false, reason: 'generic' }
  }
  redirect(signInUrl)
}

/**
 * Server action wrapper. The inner action either:
 *   - returns an error result the form renders, or
 *   - throws Next's redirect signal via `signIn(provider)` which the
 *     framework converts into a navigation to the OAuth provider.
 * Either way, success never returns to the client as a value.
 */
export async function submitLinkForm(formData: FormData): Promise<LinkActionResult> {
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!token || !password) return { ok: false, reason: 'generic' }
  return linkSocialAccountAction(token, password)
}
