/**
 * Sentry init for the Edge runtime (middleware + some route handlers).
 * Kept minimal because the edge runtime has limited Node APIs — no
 * Replay, no tracing helpers, no BrowserClient.
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
    sendDefaultPii: false,
    beforeSend: (event) => {
      const out = scrubSentryEvent(event)
      return out ? (out as typeof event) : null
    },
    ignoreErrors: ['NEXT_REDIRECT', 'NEXT_NOT_FOUND'],
  })
}
