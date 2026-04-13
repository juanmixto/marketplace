import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  countPendingReviewsInOrder,
  firstPendingReviewProductId,
} from '@/domains/reviews/pending-policy'

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

// ─── #204: deep-link helper + page wiring ────────────────────────────────────

test('firstPendingReviewProductId returns the first unreviewed product in line order', () => {
  const order = {
    lines: [{ productId: 'p1' }, { productId: 'p2' }, { productId: 'p3' }],
    reviews: [{ productId: 'p1' }],
  }
  assert.equal(firstPendingReviewProductId(order), 'p2')
})

test('firstPendingReviewProductId skips duplicates and respects line order (#204)', () => {
  // p1 appears twice (variants); the helper must not visit it twice.
  // p2 is already reviewed. Expected: p3.
  const order = {
    lines: [
      { productId: 'p1' },
      { productId: 'p1' },
      { productId: 'p2' },
      { productId: 'p3' },
      { productId: 'p4' },
    ],
    reviews: [{ productId: 'p1' }, { productId: 'p2' }],
  }
  assert.equal(firstPendingReviewProductId(order), 'p3')
})

test('firstPendingReviewProductId returns null when nothing is pending (#204)', () => {
  assert.equal(
    firstPendingReviewProductId({
      lines: [{ productId: 'p1' }, { productId: 'p2' }],
      reviews: [{ productId: 'p1' }, { productId: 'p2' }],
    }),
    null
  )
  assert.equal(firstPendingReviewProductId({ lines: [], reviews: [] }), null)
})

test('orders list page deep-links the pending-review badge to the first unreviewed product (#204)', () => {
  const src = readFileSync(
    new URL('../../src/app/(buyer)/cuenta/pedidos/page.tsx', import.meta.url),
    'utf8'
  )
  // The badge must use the first-pending helper and build a fragment URL,
  // not the generic #reseñas section anchor.
  assert.match(src, /firstPendingReviewProductId/)
  assert.match(
    src,
    /#review-\$\{firstPendingProductId\}/,
    'badge href must include #review-{productId} fragment'
  )
})

test('OrderDetailClient renders id="review-{productId}" anchors on every line (#204)', () => {
  const src = readFileSync(
    new URL('../../src/app/(buyer)/cuenta/pedidos/[id]/OrderDetailClient.tsx', import.meta.url),
    'utf8'
  )
  // Anchor target for the deep-link from the order list. Must be on the row,
  // not inside a conditional, so the fragment works regardless of whether
  // the product is currently reviewable.
  assert.match(src, /id=\{`review-\$\{line\.productId\}`\}/)
  // scroll-mt-* keeps the row below the sticky header after the browser
  // scrolls to the fragment — without it, the row hides under the header.
  assert.match(src, /scroll-mt-\d+/)
})
