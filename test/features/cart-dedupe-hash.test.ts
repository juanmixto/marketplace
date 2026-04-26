import test from 'node:test'
import assert from 'node:assert/strict'
import { hashCartForDedupe } from '@/domains/cart'

test('hashCartForDedupe is stable for identical carts', () => {
  const items = [
    { productId: 'p1', variantId: 'v1', quantity: 2 },
    { productId: 'p2', quantity: 1 },
  ]
  assert.equal(hashCartForDedupe(items), hashCartForDedupe(items))
})

test('hashCartForDedupe is order-independent', () => {
  const a = [
    { productId: 'p1', variantId: 'v1', quantity: 2 },
    { productId: 'p2', quantity: 1 },
  ]
  const b = [
    { productId: 'p2', quantity: 1 },
    { productId: 'p1', variantId: 'v1', quantity: 2 },
  ]
  assert.equal(hashCartForDedupe(a), hashCartForDedupe(b))
})

test('hashCartForDedupe changes when quantity changes', () => {
  const base = [{ productId: 'p1', quantity: 1 }]
  const more = [{ productId: 'p1', quantity: 2 }]
  assert.notEqual(hashCartForDedupe(base), hashCartForDedupe(more))
})

test('hashCartForDedupe changes when a product is added', () => {
  const base = [{ productId: 'p1', quantity: 1 }]
  const extended = [
    { productId: 'p1', quantity: 1 },
    { productId: 'p2', quantity: 1 },
  ]
  assert.notEqual(hashCartForDedupe(base), hashCartForDedupe(extended))
})

test('hashCartForDedupe distinguishes variants of the same product', () => {
  const a = [{ productId: 'p1', variantId: 'v1', quantity: 1 }]
  const b = [{ productId: 'p1', variantId: 'v2', quantity: 1 }]
  assert.notEqual(hashCartForDedupe(a), hashCartForDedupe(b))
})

test('hashCartForDedupe collapses duplicate rows with matching variant', () => {
  // Some UI flows can end up shipping two rows for the same variant; the
  // server groups them downstream, so the fingerprint must too.
  const split = [
    { productId: 'p1', variantId: 'v1', quantity: 1 },
    { productId: 'p1', variantId: 'v1', quantity: 2 },
  ]
  const merged = [{ productId: 'p1', variantId: 'v1', quantity: 3 }]
  assert.equal(hashCartForDedupe(split), hashCartForDedupe(merged))
})

test('hashCartForDedupe treats undefined and null variantId the same way', () => {
  const undef = [{ productId: 'p1', variantId: undefined, quantity: 1 }]
  const nul = [{ productId: 'p1', variantId: null, quantity: 1 }]
  assert.equal(hashCartForDedupe(undef), hashCartForDedupe(nul))
})

test('hashCartForDedupe returns a fixed marker for empty carts', () => {
  // Empty is allowed for symmetry (an order with no lines can never exist
  // in practice but the helper should be total). The exact string does
  // not matter, but it must differ from any non-empty fingerprint.
  const empty = hashCartForDedupe([])
  const nonEmpty = hashCartForDedupe([{ productId: 'p1', quantity: 1 }])
  assert.notEqual(empty, nonEmpty)
})
