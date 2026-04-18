/**
 * Runtime configuration for Sentry (#523).
 *
 * Reads DSN + environment from process env. Returns `null` when Sentry
 * is not configured so callers can feature-gate without try/catch and
 * so unconfigured local dev / tests never talk to a real Sentry project.
 */

export interface SentryRuntimeConfig {
  dsn: string
  environment: string
  release: string | undefined
  tracesSampleRate: number
  replaysSessionSampleRate: number
  replaysOnErrorSampleRate: number
}

export function loadSentryConfig(): SentryRuntimeConfig | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN
  if (!dsn) return null

  // Absolutely never send from test runs — tests are noisy and would
  // flood the project with false events.
  if (process.env.NODE_ENV === 'test') return null

  const environment =
    process.env.SENTRY_ENVIRONMENT ??
    (process.env.NODE_ENV === 'production' ? 'production' : 'development')

  const release =
    process.env.NEXT_PUBLIC_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    undefined

  // Conservative sample rates. Tune up once the project has headroom.
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1')
  const replaysSessionSampleRate = Number(
    process.env.SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? '0'
  )
  const replaysOnErrorSampleRate = Number(
    process.env.SENTRY_REPLAYS_ONERROR_SAMPLE_RATE ?? '0.5'
  )

  return {
    dsn,
    environment,
    release,
    tracesSampleRate,
    replaysSessionSampleRate,
    replaysOnErrorSampleRate,
  }
}

export const sentryConfig = loadSentryConfig()
export const isSentryEnabled = sentryConfig !== null
