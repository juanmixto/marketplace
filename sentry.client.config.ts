/**
 * Sentry init for the browser. Loaded by @sentry/nextjs webpack plugin
 * into the client bundle. Degrades to a no-op when NEXT_PUBLIC_SENTRY_DSN
 * is absent — never ships Sentry bytes to users who don't need it.
 *
 * Keep this file small: it's in the critical-path bundle.
 */

import * as Sentry from '@sentry/nextjs'
import { sentryConfig } from '@/lib/sentry/config'
import { buildTracesSampler } from '@/lib/sentry/sampler'
import { scrubSentryEvent } from '@/lib/sentry/scrubber'
import {
  loadReplayRateConfig,
  pickOnErrorSampleRate,
} from '@/lib/sentry/replay-sample-rate'

if (sentryConfig) {
  // #1222 — UA-aware on-error replay sampling. Mobile is the priority
  // UX surface (AGENTS.md), so we replay mobile errors at 50% and
  // desktop at 25%. Both rates are env-controllable for incident
  // response (`SENTRY_REPLAYS_ONERROR_SAMPLE_RATE_MOBILE/_DESKTOP`).
  // `navigator` exists at module-init time on the client; this file
  // never executes server-side because @sentry/nextjs only bundles it
  // for the browser entrypoint.
  const replayRates = loadReplayRateConfig(process.env)
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null
  const onErrorReplayRate = pickOnErrorSampleRate(ua, replayRates)

  Sentry.init({
    dsn: sentryConfig.dsn,
    environment: sentryConfig.environment,
    release: sentryConfig.release,
    tracesSampler: buildTracesSampler(sentryConfig.tracesSampleRate),
    replaysSessionSampleRate: sentryConfig.replaysSessionSampleRate,
    replaysOnErrorSampleRate: onErrorReplayRate,
    sendDefaultPii: false,
    integrations: [
      // #1222 — explicit Replay integration with paranoid privacy
      // settings. `maskAllText` and `blockAllMedia` are SDK defaults
      // (per the @sentry-internal/replay README), but stating them at
      // the call site means a reviewer who asks "what does our
      // replay capture?" answers in 10 seconds without spelunking
      // the SDK source. Stripe Elements run in a cross-origin iframe
      // which Sentry Replay automatically blocks at the browser
      // boundary — card numbers / CVV / IBAN never reach the
      // recorded DOM.
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
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
  })
}
