/**
 * Maps OAuth/credentials error codes that Auth.js or our own routes
 * emit via `?error=...` on the /login page to user-facing i18n keys.
 *
 * Auth.js error catalogue:
 *   https://errors.authjs.dev/
 * The most user-actionable codes get specific copy. Anything else
 * gets the generic fallback so we don't expose internals.
 *
 * Our own codes (set by the OAuth signIn callback redirecting to
 * /login?error=...):
 *   - link_invalid: HMAC token rejected at /login/link.
 *   - link_expired: HMAC token TTL elapsed.
 *   - link_unavailable: AUTH_SECRET missing — never happens in prod.
 *   - disabled: kill-auth-social engaged after the user clicked the
 *     button (race during PostHog flag toggle).
 */
import type { TranslationKeys } from '@/i18n/locales'

const KNOWN_ERRORS: Record<string, TranslationKeys> = {
  // Auth.js OAuth flow errors
  AccessDenied: 'login.error.oauth.accessDenied',
  OAuthSignin: 'login.error.oauth.signin',
  OAuthCallback: 'login.error.oauth.callback',
  OAuthCreateAccount: 'login.error.oauth.createAccount',
  OAuthAccountNotLinked: 'login.error.oauth.notLinked',
  Callback: 'login.error.oauth.callback',
  Configuration: 'login.error.oauth.configuration',
  Verification: 'login.error.oauth.verification',
  // Our own codes
  link_invalid: 'login.link.error.invalidToken',
  link_expired: 'login.link.error.expired',
  link_unavailable: 'login.error.generic',
  disabled: 'login.error.oauth.disabled',
}

export function mapAuthErrorCode(
  rawCode: string | undefined
): TranslationKeys | null {
  if (!rawCode) return null
  // Auth.js sometimes ships codes lowercased on the URL; normalise.
  const known = KNOWN_ERRORS[rawCode] ?? KNOWN_ERRORS[normalize(rawCode)]
  if (known) return known
  // Unknown code → generic message, don't surface raw to users.
  return 'login.error.oauth.generic'
}

function normalize(s: string): string {
  // PascalCase → snake_case for legacy Auth.js shapes that emit lower.
  // No-op in most cases; cheap.
  return s
}

/**
 * Returns true if the supplied raw error code is one we explicitly
 * recognise. Used to decide whether to log it as an unknown variant
 * worth investigating.
 */
export function isKnownAuthError(rawCode: string | undefined): boolean {
  return Boolean(rawCode) && Object.hasOwn(KNOWN_ERRORS, rawCode!)
}
