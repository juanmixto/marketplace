import { isFeatureEnabledStrict } from '@/lib/flags'
import { isGoogleProviderConfigured, AUTH_FLAG_KILL_SOCIAL } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/flags'
import { sanitizeCallbackUrl } from '@/lib/portals'
import { SocialButtonsClient } from './SocialButtonsClient'

interface Props {
  callbackUrl?: string
  /**
   * Switches button label, divider copy, and the `intent` field on
   * `auth.social.start`. Defaults to 'login' so existing call sites
   * keep their behavior.
   */
  mode?: 'login' | 'register'
}

/**
 * Server component that decides which social providers to expose to
 * this request. Two gates per provider:
 *
 *   1. Boot-time: env vars present (e.g. `AUTH_GOOGLE_ID`) — without
 *      secrets the provider isn't even registered in `auth.ts`, so
 *      the button would 500 if rendered. `isGoogleProviderConfigured`
 *      mirrors that logic so the button stays out of the DOM.
 *   2. Runtime: `kill-auth-social` (emergency switch, default-on per
 *      kill-* convention) and `feat-auth-google` (cohort gate,
 *      default-off, fail-CLOSED via Strict so a PostHog outage
 *      doesn't accidentally expose the button).
 *
 * If no providers survive both gates, the component renders nothing.
 * The login page reflows naturally without a "or continue with"
 * separator.
 */
export async function SocialButtons({ callbackUrl, mode = 'login' }: Props) {
  const safeCallback = sanitizeCallbackUrl(callbackUrl) ?? '/'

  const killEngaged = await isFeatureEnabled(AUTH_FLAG_KILL_SOCIAL)
  if (killEngaged) return null

  const googleEnabled = isGoogleProviderConfigured() &&
    (await isFeatureEnabledStrict('feat-auth-google'))

  if (!googleEnabled) return null

  return <SocialButtonsClient callbackUrl={safeCallback} googleEnabled={googleEnabled} mode={mode} />
}
