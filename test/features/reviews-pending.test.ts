import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  countPendingReviewsInOrder,
  firstPendingReviewProductId,
  pendingReviewProductIds,
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

// ─── Soft-skip: reviewed-elsewhere products do not count as pending ──────────

test('countPendingReviewsInOrder ignores products the customer reviewed in any other order', () => {
  const order = {
    lines: [{ productId: 'p1' }, { productId: 'p2' }, { productId: 'p3' }],
    reviews: [],
  }
  // Reviewed p1 in a previous order — soft-skip rule excludes it.
  const alreadyReviewed = new Set(['p1'])
  assert.equal(countPendingReviewsInOrder(order, alreadyReviewed), 2)
})

test('firstPendingReviewProductId honours the soft-skip set', () => {
  const order = {
    lines: [{ productId: 'p1' }, { productId: 'p2' }, { productId: 'p3' }],
    reviews: [],
  }
  assert.equal(firstPendingReviewProductId(order, new Set(['p1'])), 'p2')
})

test('soft-skip + per-order review combine: nothing pending when everything is covered one way or the other', () => {
  const order = {
    lines: [{ productId: 'p1' }, { productId: 'p2' }, { productId: 'p3' }],
    reviews: [{ productId: 'p2' }],
  }
  // p1 reviewed elsewhere, p2 reviewed in this order, p3 reviewed elsewhere.
  assert.equal(countPendingReviewsInOrder(order, new Set(['p1', 'p3'])), 0)
  assert.equal(firstPendingReviewProductId(order, new Set(['p1', 'p3'])), null)
})

test('pendingReviewProductIds returns the wizard sequence in line order', () => {
  const order = {
    lines: [
      { productId: 'p1' },
      { productId: 'p1' }, // duplicate variant
      { productId: 'p2' },
      { productId: 'p3' },
    ],
    reviews: [{ productId: 'p2' }],
  }
  // p1 deduped, p2 reviewed in this order → only p3 should remain.
  assert.deepEqual(pendingReviewProductIds(order, new Set(['p1'])), ['p3'])
})

// ─── Hard-disable: createReview / canLeaveReview cross-order check ───────────

test('canLeaveReview rejects when the customer already reviewed the product in another order', () => {
  const src = readFileSync(
    new URL('../../src/domains/reviews/actions.ts', import.meta.url),
    'utf8'
  )
  // The function must look up reviews scoped to (customerId, productId), not
  // just (orderId, productId). If this assertion regresses, the soft-skip in
  // the UI keeps working but the per-line button silently re-appears.
  assert.match(
    src,
    /findFirst\(\{\s*where:\s*\{\s*customerId:\s*session\.user\.id,\s*productId\s*\}/,
    'canLeaveReview must check for any prior review by the same customer on the same product',
  )
})

test('createReview throws when the customer already reviewed the product in another order', () => {
  const src = readFileSync(
    new URL('../../src/domains/reviews/actions.ts', import.meta.url),
    'utf8'
  )
  // The action also has to enforce the rule server-side — UI-only soft-skip
  // would let a tampered request bypass it.
  assert.match(src, /anyPriorReview/)
  assert.match(src, /Ya reseñaste este producto en otra compra/)
})

// ─── Wizard wiring ───────────────────────────────────────────────────────────

test('OrderDetailClient renders the bulk-review wizard when 2+ products are pending', () => {
  const src = readFileSync(
    new URL('../../src/app/(buyer)/cuenta/pedidos/[id]/OrderDetailClient.tsx', import.meta.url),
    'utf8'
  )
  assert.match(src, /ReviewWizardButton/)
  // The wizard CTA must dedupe by productId — same product on two lines
  // should not become two wizard steps.
  assert.match(src, /reviewEligibility\[line\.productId\]/)
  // Show only when there is more than one item to walk; a single-item wizard
  // is just an awkward way to render the per-line button.
  assert.match(src, /uniqueItems\.length\s*<\s*2/)
})
