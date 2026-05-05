import test from 'node:test'
import assert from 'node:assert/strict'
import { requireCatalogSearchAccess } from '@/domains/catalog/search-guard'

test('requireCatalogSearchAccess bypasses rate limiting for verified bots', async () => {
  let rateLimitCalls = 0
  let trackCalls = 0

  const result = await requireCatalogSearchAccess(
    {
      query: 'miel',
      headerStore: new Headers({
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'cf-connecting-ip': '203.0.113.10',
      }),
    },
    {
      isVerifiedSearchBot: async () => true,
      checkRateLimit: async () => {
        rateLimitCalls++
        return { success: false, remaining: 0, resetAt: Date.now() }
      },
      trackServer: () => {
        trackCalls++
      },
      logger: { warn: () => undefined },
    },
  )

  assert.equal(result.allowed, true)
  assert.equal(result.verifiedBot, true)
  assert.equal(rateLimitCalls, 0)
  assert.equal(trackCalls, 0)
})

test('requireCatalogSearchAccess blocks over-limit search traffic and records telemetry', async () => {
  const originalTrustProxy = process.env.TRUST_PROXY_HEADERS
  process.env.TRUST_PROXY_HEADERS = 'true'
  const trackEvents: Array<{ event: string; properties: Record<string, unknown> }> = []
  const warnings: Array<{ scope: string; payload: Record<string, unknown> }> = []

  try {
    const result = await requireCatalogSearchAccess(
      {
        query: 'miel',
        categorySlug: 'mieles',
        headerStore: new Headers({
          'user-agent': 'Mozilla/5.0',
          'cf-connecting-ip': '203.0.113.25',
        }),
      },
      {
        isVerifiedSearchBot: async () => false,
        checkRateLimit: async (action, key, limit, windowSeconds) => {
          assert.equal(action, 'catalog-search-ip')
          assert.equal(key, '203.0.113.25')
          assert.equal(limit, 20)
          assert.equal(windowSeconds, 60)
          return {
            success: false,
            remaining: 0,
            resetAt: 1_700_000_000_000,
            message: 'Demasiados intentos.',
          }
        },
        trackServer: (event, properties) => {
          trackEvents.push({ event, properties })
        },
        logger: {
          warn: (scope, payload) => {
            warnings.push({ scope, payload: payload as Record<string, unknown> })
          },
        },
      },
    )

    assert.equal(result.allowed, false)
    assert.equal(result.resetAt, 1_700_000_000_000)
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0]!.scope, 'catalog.ratelimit_blocked')
    assert.equal(trackEvents.length, 1)
    assert.equal(trackEvents[0]!.event, 'catalog.ratelimit_blocked')
    assert.deepEqual(trackEvents[0]!.properties, {
      surface: 'search',
      ip: '203.0.113.25',
      category_slug: 'mieles',
      query_length: 4,
      reset_at: 1_700_000_000_000,
      degraded: false,
    })
  } finally {
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY_HEADERS
    else process.env.TRUST_PROXY_HEADERS = originalTrustProxy
  }
})
