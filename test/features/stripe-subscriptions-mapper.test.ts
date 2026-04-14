import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mapStripeSubscriptionStatus,
  parseStripeSubscriptionEvent,
} from '@/domains/subscriptions/stripe-subscriptions'

/**
 * Phase 4b-α — pure unit tests for the Stripe → local status mapper and
 * the event payload parser. No DB, no SDK, no network.
 */

test('mapStripeSubscriptionStatus maps active / trialing to ACTIVE', () => {
  assert.equal(mapStripeSubscriptionStatus('active', null), 'ACTIVE')
  assert.equal(mapStripeSubscriptionStatus('trialing', null), 'ACTIVE')
})

test('mapStripeSubscriptionStatus maps past_due / unpaid to PAST_DUE', () => {
  assert.equal(mapStripeSubscriptionStatus('past_due', null), 'PAST_DUE')
  assert.equal(mapStripeSubscriptionStatus('unpaid', null), 'PAST_DUE')
})

test('mapStripeSubscriptionStatus maps canceled / incomplete_expired to CANCELED', () => {
  assert.equal(mapStripeSubscriptionStatus('canceled', null), 'CANCELED')
  assert.equal(mapStripeSubscriptionStatus('incomplete_expired', null), 'CANCELED')
})

test('mapStripeSubscriptionStatus treats a non-null pause_collection as PAUSED regardless of underlying status', () => {
  // Stripe represents a paused sub as status=active + pause_collection={...}
  assert.equal(
    mapStripeSubscriptionStatus('active', { behavior: 'void' }),
    'PAUSED'
  )
})

test('mapStripeSubscriptionStatus defaults unknown statuses to ACTIVE so the buyer does not lose access silently', () => {
  assert.equal(mapStripeSubscriptionStatus('something_new', null), 'ACTIVE')
})

test('parseStripeSubscriptionEvent accepts a well-formed subscription payload', () => {
  const parsed = parseStripeSubscriptionEvent({
    id: 'sub_123',
    status: 'active',
    pause_collection: null,
    cancel_at: null,
    canceled_at: null,
  })
  assert.ok(parsed)
  assert.equal(parsed?.id, 'sub_123')
  assert.equal(parsed?.status, 'active')
})

test('parseStripeSubscriptionEvent rejects payloads missing a subscription id', () => {
  assert.equal(parseStripeSubscriptionEvent({ status: 'active' }), null)
  assert.equal(parseStripeSubscriptionEvent(null), null)
  assert.equal(parseStripeSubscriptionEvent('nope'), null)
})

test('parseStripeSubscriptionEvent rejects ids that do not look like Stripe subscription ids', () => {
  // Defensive: a payload with id=`pi_xxx` would be a payment intent.
  assert.equal(
    parseStripeSubscriptionEvent({ id: 'pi_123', status: 'active' }),
    null
  )
})
