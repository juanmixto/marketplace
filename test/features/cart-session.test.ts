import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { clearCartSessionState } from '@/components/buyer/cart-session'
import { useCartStore } from '@/domains/orders/cart-store'

class FakeStorage implements Storage {
  private readonly store = new Map<string, string>()

  get length() {
    return this.store.size
  }

  getItem(key: string) {
    return this.store.get(key) ?? null
  }

  key(index: number) {
    return [...this.store.keys()][index] ?? null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }
}

afterEach(() => {
  useCartStore.setState({ items: [], hasHydrated: false })
  delete (globalThis as unknown as { window?: unknown }).window
})

test('clearCartSessionState clears the cart store and merged flag', () => {
  useCartStore.setState({
    items: [
      {
        productId: 'prod-1',
        name: 'Tomates',
        slug: 'tomates',
        price: 2,
        unit: 'kg',
        vendorId: 'vendor-1',
        vendorName: 'Huerta',
        quantity: 2,
      },
    ],
  })

  const storage = new FakeStorage()
  storage.setItem('cart-merged-user', 'user-1')

  ;(globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: storage }

  clearCartSessionState()

  assert.equal(useCartStore.getState().items.length, 0)
  assert.equal(useCartStore.getState().hasHydrated, false)
  assert.equal(storage.getItem('cart-merged-user'), null)
})
