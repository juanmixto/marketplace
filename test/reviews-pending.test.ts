import test from 'node:test'
import assert from 'node:assert/strict'
import { countPendingReviewsInOrder } from '@/domains/reviews/pending-policy'

test('countPendingReviewsInOrder returns the number of distinct unreviewed products', () => {
  const order = {
    lines: [
      { productId: 'p1' },
      { productId: 'p2' },
      { productId: 'p3' },
    ],
    reviews: [{ productId: 'p1' }],
  }
  assert.equal(countPendingReviewsInOrder(order), 2)
})

test('countPendingReviewsInOrder de-duplicates products that appear in several lines', () => {
  // Same product in two lines (e.g. different variants) counts once, since Review
  // has a unique constraint on (orderId, productId).
  const order = {
    lines: [
      { productId: 'p1' },
      { productId: 'p1' },
      { productId: 'p2' },
    ],
    reviews: [],
  }
  assert.equal(countPendingReviewsInOrder(order), 2)
})

test('countPendingReviewsInOrder returns zero when every product is already reviewed', () => {
  const order = {
    lines: [{ productId: 'p1' }, { productId: 'p2' }],
    reviews: [{ productId: 'p1' }, { productId: 'p2' }],
  }
  assert.equal(countPendingReviewsInOrder(order), 0)
})

test('countPendingReviewsInOrder returns zero on empty orders', () => {
  assert.equal(countPendingReviewsInOrder({ lines: [], reviews: [] }), 0)
})
