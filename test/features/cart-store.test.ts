import test from 'node:test'
import assert from 'node:assert/strict'
import { useCartStore } from '@/domains/orders/cart-store'

function resetCart() {
  useCartStore.setState({ items: [], hasHydrated: false })
}

test('addItem can add multiple units in one action', () => {
  resetCart()

  useCartStore.getState().addItem({
    productId: 'prod-1',
    name: 'Galletas',
    slug: 'galletas',
    price: 5.1,
    unit: 'bolsa 300g',
    vendorId: 'vendor-1',
    vendorName: 'Obrador',
    quantity: 4,
  } as never)

  assert.equal(useCartStore.getState().items[0]?.quantity, 4)
})

test('addItem merges quantities from repeated bulk adds', () => {
  resetCart()

  useCartStore.getState().addItem({
    productId: 'prod-1',
    name: 'Galletas',
    slug: 'galletas',
    price: 5.1,
    unit: 'bolsa 300g',
    vendorId: 'vendor-1',
    vendorName: 'Obrador',
    quantity: 2,
  } as never)

  useCartStore.getState().addItem({
    productId: 'prod-1',
    name: 'Galletas',
    slug: 'galletas',
    price: 5.1,
    unit: 'bolsa 300g',
    vendorId: 'vendor-1',
    vendorName: 'Obrador',
    quantity: 3,
  } as never)

  assert.equal(useCartStore.getState().items[0]?.quantity, 5)
})

test('cart store exposes a hydration flag for persisted localStorage state', () => {
  resetCart()

  assert.equal(useCartStore.getState().hasHydrated, false)

  useCartStore.getState().setHasHydrated(true)
  assert.equal(useCartStore.getState().hasHydrated, true)
})
