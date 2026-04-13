import test from 'node:test'
import assert from 'node:assert/strict'
import { canReviewDeliveredOrder } from '@/domains/reviews/policy'

test('canReviewDeliveredOrder only allows delivered orders without an existing review', () => {
  assert.equal(canReviewDeliveredOrder({ orderDelivered: true, reviewExists: false }), true)
  assert.equal(canReviewDeliveredOrder({ orderDelivered: false, reviewExists: false }), false)
  assert.equal(canReviewDeliveredOrder({ orderDelivered: true, reviewExists: true }), false)
})
