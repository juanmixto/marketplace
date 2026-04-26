'use client'

import { useEffect } from 'react'
import { capturePostHog } from '@/lib/posthog'

interface Props {
  errorCode: string
}

/**
 * Fires a PostHog `auth.social.error` event on mount when an OAuth-
 * related error lands on /login via the `?error=...` query param.
 * Pairs with `auth.social.start` (button click) so the rollout
 * dashboard can compute drop-off in the OAuth funnel even when the
 * server-side `auth.social.error` (matrix deny) doesn't fire — e.g.
 * when Auth.js itself rejects the callback before reaching our
 * signIn handler.
 *
 * Server-side AuthErrorBanner decides whether to mount this; this
 * component only handles the capture.
 */
export function AuthErrorTracker({ errorCode }: Props) {
  useEffect(() => {
    if (!errorCode) return
    capturePostHog('auth.social.error', { code: errorCode, source: 'login_url' })
    // Capture once per render of this error code. The login page is
    // server-component; React unmounts/remounts on URL changes, so
    // navigating away clears.
  }, [errorCode])

  return null
}
