import test from 'node:test'
import assert from 'node:assert/strict'
import type { EnrichedProducer } from '@/domains/admin/producers-schema'

/**
 * Issue #1351 (epic #1346 — PII pre-launch).
 *
 * Type-level guard: `EnrichedProducer.email` MUST be optional. Pre-#1351
 * the field was required and the loader populated it on every row,
 * shipping the entire vendor base's emails over the wire on every
 * /admin/productores render. The runtime contract is enforced in the
 * loader (`getProducersOverview`); this is the cheap typing rail that
 * stops a future regression from re-adding the required field.
 */

test('EnrichedProducer.email is optional', () => {
  // The cast must succeed — TS would fail compilation if `email`
  // were required and missing here.
  const minimal: EnrichedProducer = {
    id: 'v1',
    slug: 'v1',
    displayName: 'Producer 1',
    status: 'ACTIVE',
    description: null,
    location: null,
    logo: null,
    productsCount: 0,
    stripeOnboarded: true,
    avgRating: null,
    totalReviews: 0,
    createdAt: new Date().toISOString(),
    revenue: 0,
    ordersCount: 0,
    topProduct: null,
    lastSeenAt: null,
    sparkline: [0, 0, 0, 0, 0, 0, 0],
  }
  assert.equal(minimal.email, undefined)
})
