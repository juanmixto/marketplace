/**
 * Sentry init for the Node server runtime. Imported by
 * `src/instrumentation.ts` at process boot. Degrades to no-op when no
 * DSN is configured.
 */

import * as Sentry from '@sentry/nextjs'
import { sentryConfig } from '@/lib/sentry/config'
import { buildTracesSampler } from '@/lib/sentry/sampler'
import { scrubSentryEvent } from '@/lib/sentry/scrubber'

if (sentryConfig) {
  Sentry.init({
    dsn: sentryConfig.dsn,
    environment: sentryConfig.environment,
    release: sentryConfig.release,
    tracesSampler: buildTracesSampler(sentryConfig.tracesSampleRate),
    // Send default PII is OFF — we rely on explicit opt-in via
    // Sentry.setUser({ id }) to add the internal id, nothing else.
    sendDefaultPii: false,
    beforeSend: (event) => {
      const out = scrubSentryEvent(event)
      return out ? (out as typeof event) : null
    },
    // `beforeSendTransaction` expects a TransactionEvent; our scrubber
    // returns the general Event. TransactionEvent is a subtype that
    // carries a `type: 'transaction'` discriminator — we preserve it
    // via the cast. If the scrubber drops the event we return null.
    beforeSendTransaction: (event) => {
      const out = scrubSentryEvent(event)
      return out ? (out as typeof event) : null
    },
    ignoreErrors: [
      // Next's navigation signaling throws that are NOT real errors.
      'NEXT_REDIRECT',
      'NEXT_NOT_FOUND',
    ],
  })
}
