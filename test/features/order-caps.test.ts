/**
 * Order input caps tests (#1270).
 *
 * Bounds on the cart shape are the cheap, declarative half of the
 * inventory-griefing defense. The expensive half (pending-order count
 * pre-flight) lives inside `createOrder` and is exercised by the
 * existing checkout integration suite.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_CART_LINES,
  MAX_ITEM_QUANTITY,
  orderItemSchema,
  orderItemsSchema,
} from '@/domains/orders/checkout'

test('quantity beyond MAX_ITEM_QUANTITY is rejected (#1270)', () => {
  const ok = orderItemSchema.safeParse({
    productId: 'p1',
    quantity: MAX_ITEM_QUANTITY,
  })
  assert.equal(ok.success, true)

  const tooMany = orderItemSchema.safeParse({
    productId: 'p1',
    quantity: MAX_ITEM_QUANTITY + 1,
  })
  assert.equal(tooMany.success, false)
})

test('cart with more than MAX_CART_LINES distinct items is rejected (#1270)', () => {
  const lines = Array.from({ length: MAX_CART_LINES + 1 }, (_, i) => ({
    productId: `p${i}`,
    quantity: 1,
  }))
  const result = orderItemsSchema.safeParse(lines)
  assert.equal(result.success, false)
})

test('cart at exactly MAX_CART_LINES is accepted (#1270)', () => {
  const lines = Array.from({ length: MAX_CART_LINES }, (_, i) => ({
    productId: `p${i}`,
    quantity: 1,
  }))
  const result = orderItemsSchema.safeParse(lines)
  assert.equal(result.success, true)
})
