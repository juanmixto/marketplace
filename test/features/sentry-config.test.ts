import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSentryConfig } from '@/lib/sentry/config'

/**
 * Config loader regression suite. The gate that keeps Sentry disabled
 * in tests, in CI, and in any deploy where the operator hasn't opted
 * in via DSN.
 */

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key]
    const value = overrides[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('loadSentryConfig: returns null when no DSN is set', () => {
  withEnv(
    {
      SENTRY_DSN: undefined,
      NEXT_PUBLIC_SENTRY_DSN: undefined,
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(loadSentryConfig(), null)
    }
  )
})

test('loadSentryConfig: returns null in NODE_ENV=test even when DSN is set', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://x@y.ingest.sentry.io/1',
      NODE_ENV: 'test',
    },
    () => {
      assert.equal(loadSentryConfig(), null)
    }
  )
})

test('loadSentryConfig: uses SENTRY_DSN when set', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      NEXT_PUBLIC_SENTRY_DSN: undefined,
      NODE_ENV: 'production',
    },
    () => {
      const c = loadSentryConfig()
      assert.ok(c)
      assert.equal(c!.dsn, 'https://a@b.ingest.sentry.io/1')
      assert.equal(c!.environment, 'production')
    }
  )
})

test('loadSentryConfig: prefers NEXT_PUBLIC_SENTRY_DSN when available', () => {
  withEnv(
    {
      NEXT_PUBLIC_SENTRY_DSN: 'https://public@x.ingest.sentry.io/2',
      SENTRY_DSN: undefined,
      NODE_ENV: 'production',
    },
    () => {
      const c = loadSentryConfig()
      assert.ok(c)
      assert.equal(c!.dsn, 'https://public@x.ingest.sentry.io/2')
    }
  )
})

test('loadSentryConfig: environment defaults to NODE_ENV when SENTRY_ENVIRONMENT is unset', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: undefined,
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(loadSentryConfig()!.environment, 'production')
    }
  )
})

test('loadSentryConfig: honors explicit SENTRY_ENVIRONMENT', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'staging',
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(loadSentryConfig()!.environment, 'staging')
    }
  )
})

test('loadSentryConfig: APP_ENV=staging surfaces as environment', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: undefined,
      APP_ENV: 'staging',
      NEXT_PUBLIC_APP_ENV: undefined,
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(loadSentryConfig()!.environment, 'staging')
    }
  )
})

test('loadSentryConfig: SENTRY_ENVIRONMENT wins over APP_ENV', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'qa',
      APP_ENV: 'staging',
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(loadSentryConfig()!.environment, 'qa')
    }
  )
})

test('loadSentryConfig: NEXT_PUBLIC_APP_ENV is used when APP_ENV is unset (browser bundle path)', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: undefined,
      APP_ENV: undefined,
      NEXT_PUBLIC_APP_ENV: 'staging',
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(loadSentryConfig()!.environment, 'staging')
    }
  )
})

test('loadSentryConfig: reads release from NEXT_PUBLIC_COMMIT_SHA', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      NEXT_PUBLIC_COMMIT_SHA: 'abc1234',
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(loadSentryConfig()!.release, 'abc1234')
    }
  )
})

test('loadSentryConfig: falls back to VERCEL_GIT_COMMIT_SHA when NEXT_PUBLIC_COMMIT_SHA is absent', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      NEXT_PUBLIC_COMMIT_SHA: undefined,
      VERCEL_GIT_COMMIT_SHA: 'vercel-sha-1',
      NODE_ENV: 'production',
    },
    () => {
      assert.equal(loadSentryConfig()!.release, 'vercel-sha-1')
    }
  )
})

test('loadSentryConfig: sample rates respect env overrides', () => {
  withEnv(
    {
      SENTRY_DSN: 'https://a@b.ingest.sentry.io/1',
      SENTRY_TRACES_SAMPLE_RATE: '0.5',
      SENTRY_REPLAYS_SESSION_SAMPLE_RATE: '0.1',
      SENTRY_REPLAYS_ONERROR_SAMPLE_RATE: '0.9',
      NODE_ENV: 'production',
    },
    () => {
      const c = loadSentryConfig()!
      assert.equal(c.tracesSampleRate, 0.5)
      assert.equal(c.replaysSessionSampleRate, 0.1)
      assert.equal(c.replaysOnErrorSampleRate, 0.9)
    }
  )
})
