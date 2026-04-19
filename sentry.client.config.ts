/**
 * Sentry init for the browser. Loaded by @sentry/nextjs webpack plugin
 * into the client bundle. Degrades to a no-op when NEXT_PUBLIC_SENTRY_DSN
 * is absent — never ships Sentry bytes to users who don't need it.
 *
 * Keep this file small: it's in the critical-path bundle.
 */

import * as Sentry from '@sentry/nextjs'
import { sentryConfig } from '@/lib/sentry/config'
import { scrubSentryEvent } from '@/lib/sentry/scrubber'

if (sentryConfig) {
  Sentry.init({
    dsn: sentryConfig.dsn,
    environment: sentryConfig.environment,
    release: sentryConfig.release,
    tracesSampleRate: sentryConfig.tracesSampleRate,
    replaysSessionSampleRate: sentryConfig.replaysSessionSampleRate,
    replaysOnErrorSampleRate: sentryConfig.replaysOnErrorSampleRate,
    sendDefaultPii: false,
    beforeSend: (event) => {
      const out = scrubSentryEvent(event)
      return out ? (out as typeof event) : null
    },
    ignoreErrors: [
      // Browser noise we never want:
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      // Next navigation signals (shouldn't reach here but belt-and-braces):
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
    ],
    denyUrls: [
      // Third-party scripts we don't want event noise from.
      /extensions\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,
      /^safari-extension:\/\//i,
    ],
    // Replays integration is auto-wired by @sentry/nextjs v10+ when
    // the corresponding sample rates are > 0. We keep session replays at
    // 0 by default to avoid the cost/privacy surface until we explicitly
    // need them.
  })
}
