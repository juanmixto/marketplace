import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearMyServerCart,
  loadServerCart,
  mergeLocalIntoServerCart,
  setCartItem,
} from '@/domains/cart/cart-actions'
import { setServerCartItem } from '@/domains/cart/cart-persistence'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createActiveProduct,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Server-action wrappers over cart-persistence (#270). The persistence
 * layer is already covered end-to-end; these tests pin the identity
 * gate at the server-action boundary so the client can't forge a
 * cross-tenant cart write.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { NODE_ENV: 'test' })
})

afterEach(() => {
  clearTestSession()
})

test('loadServerCart returns [] for anonymous callers and the buyer cart otherwise', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)

  await setServerCartItem(buyer.id, { productId: product.id, quantity: 2 })

  useTestSession(null)
  const anon = await loadServerCart()
  assert.equal(anon.length, 0, 'anonymous → empty')

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const own = await loadServerCart()
  assert.equal(own.length, 1)
  assert.equal(own[0]?.productId, product.id)
  assert.equal(own[0]?.quantity, 2)
})

test('setCartItem ignores calls from anonymous callers (no-op, no cart created)', async () => {
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)

  useTestSession(null)
  await setCartItem({ productId: product.id, quantity: 3 })

  const carts = await db.cart.count()
  assert.equal(carts, 0, 'no Cart row persisted for an anonymous setCartItem call')
})

test('mergeLocalIntoServerCart sums quantities on overlapping (productId, variantId)', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const p1 = await createActiveProduct(vendor.id)
  const p2 = await createActiveProduct(vendor.id)

  // Buyer already had p1×1 on the server from another device.
  await setServerCartItem(buyer.id, { productId: p1.id, quantity: 1 })

  // Anonymous cart contained p1×2 + p2×3.
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  const merged = await mergeLocalIntoServerCart([
    { productId: p1.id, quantity: 2 },
    { productId: p2.id, quantity: 3 },
  ])

  const byProduct = new Map(merged.map(line => [line.productId, line.quantity]))
  assert.equal(byProduct.get(p1.id), 3, 'server 1 + local 2 = 3')
  assert.equal(byProduct.get(p2.id), 3, 'only-local item joined as 3')

  // Persisted state matches the returned view.
  const fromServer = await loadServerCart()
  assert.equal(fromServer.length, 2)
  const persisted = new Map(fromServer.map(line => [line.productId, line.quantity]))
  assert.equal(persisted.get(p1.id), 3)
  assert.equal(persisted.get(p2.id), 3)
})

test('mergeLocalIntoServerCart is anonymous-safe (returns [] without touching DB)', async () => {
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)

  useTestSession(null)
  const result = await mergeLocalIntoServerCart([{ productId: product.id, quantity: 5 }])

  assert.deepEqual(result, [])
  const carts = await db.cart.count()
  assert.equal(carts, 0)
})

test('clearMyServerCart wipes items but leaves the Cart shell so future writes succeed', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id)
  await setServerCartItem(buyer.id, { productId: product.id, quantity: 2 })

  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  await clearMyServerCart()

  const after = await loadServerCart()
  assert.equal(after.length, 0, 'cart emptied')

  // A subsequent setCartItem re-populates it without a Cart-missing error.
  await setCartItem({ productId: product.id, quantity: 1 })
  const after2 = await loadServerCart()
  assert.equal(after2.length, 1)
})
