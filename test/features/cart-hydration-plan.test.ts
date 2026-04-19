import test from 'node:test'
import assert from 'node:assert/strict'
import { getCartHydrationAction } from '@/components/buyer/cart-hydration-plan'

test('cart hydration loads server cart after the user has already merged once', () => {
  assert.equal(
    getCartHydrationAction({
      status: 'authenticated',
      userId: 'user-1',
      alreadyMergedForUser: true,
      localItemCount: 5,
    }),
    'load',
  )
})

test('cart hydration merges only when an authenticated user still has fresh local items', () => {
  assert.equal(
    getCartHydrationAction({
      status: 'authenticated',
      userId: 'user-1',
      alreadyMergedForUser: false,
      localItemCount: 2,
    }),
    'merge',
  )
})

test('cart hydration loads server cart when the authenticated cart is empty', () => {
  assert.equal(
    getCartHydrationAction({
      status: 'authenticated',
      userId: 'user-1',
      alreadyMergedForUser: false,
      localItemCount: 0,
    }),
    'load',
  )
})
