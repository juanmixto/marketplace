import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  clearServerCart,
  getServerCart,
  mergeLocalCartIntoServer,
  removeServerCartItem,
  setServerCartItem,
} from '@/domains/cart/cart-persistence'
import { db } from '@/lib/db'
import {
  createActiveProduct,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
} from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(async () => {
  await resetIntegrationDatabase()
})

test('getServerCart returns an empty array when the user has no Cart row', async () => {
  const customer = await createUser('CUSTOMER')
  const items = await getServerCart(customer.id)
  assert.deepEqual(items, [])
})

test('setServerCartItem creates a Cart on first write and persists the line', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 10 })

  await setServerCartItem(customer.id, { productId: product.id, quantity: 3 })

  const items = await getServerCart(customer.id)
  assert.equal(items.length, 1)
  assert.equal(items[0].productId, product.id)
  assert.equal(items[0].quantity, 3)
  assert.equal(items[0].variantId, null)
  assert.equal(items[0].product.vendor.id, vendor.id)
})

test('setServerCartItem on an existing line REPLACES the quantity (not increments)', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 10 })

  await setServerCartItem(customer.id, { productId: product.id, quantity: 3 })
  await setServerCartItem(customer.id, { productId: product.id, quantity: 1 })

  const items = await getServerCart(customer.id)
  assert.equal(items.length, 1, 'still a single line — not duplicated')
  assert.equal(items[0].quantity, 1, 'quantity replaced, not summed')
})

test('setServerCartItem with quantity 0 removes the line', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 10 })

  await setServerCartItem(customer.id, { productId: product.id, quantity: 2 })
  await setServerCartItem(customer.id, { productId: product.id, quantity: 0 })

  const items = await getServerCart(customer.id)
  assert.equal(items.length, 0)
})

test('removeServerCartItem is a no-op for a line that does not exist', async () => {
  const customer = await createUser('CUSTOMER')
  await assert.doesNotReject(() =>
    removeServerCartItem(customer.id, 'product-that-does-not-exist', null)
  )
})

test('clearServerCart empties all lines but keeps the Cart row', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const productA = await createActiveProduct(vendor.id, { stock: 10 })
  const productB = await createActiveProduct(vendor.id, { stock: 10, slug: 'second-product' })

  await setServerCartItem(customer.id, { productId: productA.id, quantity: 1 })
  await setServerCartItem(customer.id, { productId: productB.id, quantity: 1 })

  await clearServerCart(customer.id)

  const items = await getServerCart(customer.id)
  assert.deepEqual(items, [])

  // The Cart row itself should still exist so subsequent writes don't
  // pay the upsert cost again.
  const cart = await db.cart.findUnique({ where: { userId: customer.id } })
  assert.ok(cart, 'Cart row still present after clearing items')
})

test('mergeLocalCartIntoServer SUMS quantities of overlapping (productId, variantId) lines', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 50 })

  // User had 2 of this product on the server already (from a previous device).
  await setServerCartItem(customer.id, { productId: product.id, quantity: 2 })

  // Now they log in carrying a local cart with 3 more of the same product.
  const merged = await mergeLocalCartIntoServer(customer.id, [
    { productId: product.id, quantity: 3 },
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].quantity, 5, '2 + 3 = 5 — local + server merged, not replaced')
})

test('mergeLocalCartIntoServer creates new lines for products not yet on the server', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const productA = await createActiveProduct(vendor.id, { stock: 10 })
  const productB = await createActiveProduct(vendor.id, { stock: 10, slug: 'second-product' })

  // Server has only product A
  await setServerCartItem(customer.id, { productId: productA.id, quantity: 1 })

  // Local has both
  const merged = await mergeLocalCartIntoServer(customer.id, [
    { productId: productA.id, quantity: 2 },
    { productId: productB.id, quantity: 4 },
  ])

  assert.equal(merged.length, 2)
  const a = merged.find(line => line.productId === productA.id)!
  const b = merged.find(line => line.productId === productB.id)!
  assert.equal(a.quantity, 3, 'productA: 1 server + 2 local = 3')
  assert.equal(b.quantity, 4, 'productB: 0 server + 4 local = 4')
})

test('mergeLocalCartIntoServer collapses duplicate local lines before writing', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 10 })

  // A malformed client sends the same line twice — should collapse to one
  // row with the summed quantity, not two writes.
  const merged = await mergeLocalCartIntoServer(customer.id, [
    { productId: product.id, quantity: 1 },
    { productId: product.id, quantity: 2 },
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].quantity, 3)
})

test('mergeLocalCartIntoServer with empty input returns whatever the server already had', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 10 })
  await setServerCartItem(customer.id, { productId: product.id, quantity: 4 })

  const merged = await mergeLocalCartIntoServer(customer.id, [])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].quantity, 4)
})

test('mergeLocalCartIntoServer ignores lines with zero or negative quantity', async () => {
  const { vendor } = await createVendorUser()
  const customer = await createUser('CUSTOMER')
  const product = await createActiveProduct(vendor.id, { stock: 10 })

  const merged = await mergeLocalCartIntoServer(customer.id, [
    { productId: product.id, quantity: 0 },
    { productId: product.id, quantity: -3 },
  ])

  assert.equal(merged.length, 0, 'no lines created from invalid quantities')
})
