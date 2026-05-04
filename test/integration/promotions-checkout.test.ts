import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createOrder } from '@/domains/orders/actions'
import { createPromotion } from '@/domains/promotions/actions'
import { previewPromotionsForCart } from '@/domains/promotions/checkout'
import { db } from '@/lib/db'
import { resetServerEnvCache } from '@/lib/env'
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
 * Phase 2 of the promotions RFC. These tests cover the actual checkout
 * integration: promotion candidate loading, discount math, race-safe
 * redemption bookkeeping, the coupon-code UX, and the VendorFulfillment
 * linkage. The pure engine math is covered in
 * test/features/promotions-evaluation.test.ts.
 */

const ADDRESS = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  line1: 'Calle Mayor 1',
  city: 'Madrid',
  province: 'Madrid',
  postalCode: '28001',
}

const in30Days = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const inThePast = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const now = () => new Date().toISOString()

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
  process.env.PAYMENT_PROVIDER = 'mock'
  resetServerEnvCache()
})

async function setupVendorAndProduct(opts: { price?: number; stock?: number } = {}) {
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, {
    stock: opts.stock ?? 10,
    basePrice: opts.price ?? 20,
  })
  return { vendorUser, vendor, product }
}

async function createCustomerSession() {
  const customer = await createUser('CUSTOMER')
  useTestSession(buildSession(customer.id, 'CUSTOMER'))
  return customer
}

async function createPromoAs(
  vendorUserId: string,
  overrides: Partial<Parameters<typeof createPromotion>[0]>
) {
  useTestSession(buildSession(vendorUserId, 'VENDOR'))
  return createPromotion({
    name: overrides.name ?? 'Campaign',
    code: overrides.code ?? null,
    kind: overrides.kind ?? 'PERCENTAGE',
    value: overrides.value ?? 10,
    scope: overrides.scope ?? 'VENDOR',
    productId: overrides.productId ?? null,
    categoryId: overrides.categoryId ?? null,
    minSubtotal: overrides.minSubtotal ?? null,
    maxRedemptions: overrides.maxRedemptions ?? null,
    perUserLimit: overrides.perUserLimit ?? 1,
    startsAt: overrides.startsAt ?? now(),
    endsAt: overrides.endsAt ?? in30Days(),
  })
}

test('createOrder applies an auto vendor-wide percentage promo and persists discount fields', async () => {
  const { vendorUser, vendor, product } = await setupVendorAndProduct({ price: 50, stock: 5 })
  await createPromoAs(vendorUser.id, { value: 20 }) // 20% off
  await createCustomerSession()

  const created = await createOrder(
    [{ productId: product.id, quantity: 2 }],
    { address: ADDRESS, saveAddress: false }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    include: { fulfillments: true },
  })
  assert.ok(order)
  assert.equal(Number(order!.discountTotal), 20) // 20% of 100
  assert.equal(Number(order!.subtotal), 80)
  assert.equal(order!.fulfillments.length, 1)
  assert.equal(Number(order!.fulfillments[0].discountAmount), 20)
  assert.ok(order!.fulfillments[0].promotionId)

  // Promotion redemption was bumped
  const promo = await db.promotion.findFirst({ where: { vendorId: vendor.id } })
  assert.equal(promo?.redemptionCount, 1)

  // Grand total is subtotal + shipping
  assert.equal(
    Number(order!.grandTotal),
    Number(order!.subtotal) + Number(order!.shippingCost)
  )
})

test('createOrder bypasses Stripe and commits PAYMENT_CONFIRMED when grandTotal===0 (#1154 H-4)', async () => {
  // Reproduce the free-order vector: a fixed-amount promo zeroes subtotal,
  // and a shipping zone with price=0 zeroes the shipping cost. Before the
  // bypass, this would commit the Order with stock decremented + promo
  // claimed and THEN crash on `createPaymentIntent(0, ...)` because Stripe
  // rejects a zero-amount PI. The fix short-circuits PI creation and
  // marks the Order paid in the same transaction.
  const { vendorUser, product } = await setupVendorAndProduct({ price: 4, stock: 5 })
  const zone = await db.shippingZone.create({
    data: { name: 'Madrid free', provinces: ['Madrid'], isActive: true },
  })
  await db.shippingRate.create({
    data: { zoneId: zone.id, name: 'free madrid', price: 0, isActive: true },
  })
  await createPromoAs(vendorUser.id, { kind: 'FIXED_AMOUNT', value: 4 })
  await createCustomerSession()

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    include: { payments: true },
  })
  assert.ok(order)
  assert.equal(Number(order!.grandTotal), 0, 'grandTotal must be 0 to exercise the bypass')
  assert.equal(order!.status, 'PAYMENT_CONFIRMED', 'free order must skip PLACED state')
  assert.equal(order!.paymentStatus, 'SUCCEEDED', 'paymentStatus must be SUCCEEDED, not PENDING')

  const payment = order!.payments[0]
  assert.ok(payment, 'Payment row must exist')
  assert.equal(payment!.status, 'SUCCEEDED')
  assert.match(payment!.providerRef ?? '', /^free_/, 'synthetic providerRef must start with free_')
  assert.equal(Number(payment!.amount), 0)

  // Stock must have been decremented (real consumption, not leak)
  const refreshed = await db.product.findUnique({ where: { id: product.id }, select: { stock: true }})
  assert.equal(refreshed?.stock, 4, 'stock decrement is the legitimate cost of a real free order')
})

test('createOrder applies a fixed-amount promo and clamps against subtotal', async () => {
  const { vendorUser, product } = await setupVendorAndProduct({ price: 4, stock: 2 })
  await createPromoAs(vendorUser.id, { kind: 'FIXED_AMOUNT', value: 50 })
  await createCustomerSession()

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )
  const order = await db.order.findUnique({ where: { id: created.orderId } })
  // Cart has a single 4€ line; the 50€ promo is clamped to 4€
  assert.equal(Number(order!.discountTotal), 4)
  assert.equal(Number(order!.subtotal), 0)
})

test('createOrder uses a buyer-entered code when it is a better deal than the auto promo', async () => {
  const { vendorUser, product } = await setupVendorAndProduct({ price: 50, stock: 5 })
  await createPromoAs(vendorUser.id, { name: 'Auto 5', value: 5, perUserLimit: 100 })
  await createPromoAs(vendorUser.id, {
    name: 'Coded 40',
    code: 'BIG40',
    value: 40,
    perUserLimit: 100,
  })
  await createCustomerSession()

  const created = await createOrder(
    [{ productId: product.id, quantity: 2 }],
    { address: ADDRESS, saveAddress: false },
    { promotionCode: 'BIG40' }
  )

  const order = await db.order.findUnique({
    where: { id: created.orderId },
    include: { fulfillments: true },
  })
  assert.equal(Number(order!.discountTotal), 40) // 40% of 100
  const applied = await db.promotion.findFirst({
    where: { id: order!.fulfillments[0].promotionId! },
  })
  assert.equal(applied?.code, 'BIG40')
})

test('createOrder rejects a coupon code that does not match any promotion', async () => {
  const { product } = await setupVendorAndProduct()
  await createCustomerSession()

  await assert.rejects(
    () =>
      createOrder(
        [{ productId: product.id, quantity: 1 }],
        { address: ADDRESS, saveAddress: false },
        { promotionCode: 'NOPE' }
      ),
    /NOPE/
  )
})

test('createOrder skips expired promotions', async () => {
  const { vendorUser, product } = await setupVendorAndProduct({ price: 30, stock: 3 })
  await createPromoAs(vendorUser.id, {
    value: 25,
    startsAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    endsAt: inThePast(),
  })
  await createCustomerSession()

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )
  const order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(Number(order!.discountTotal), 0)
})

test('createOrder skips archived promotions', async () => {
  const { vendorUser, product } = await setupVendorAndProduct({ price: 30, stock: 3 })
  const promo = await createPromoAs(vendorUser.id, { value: 25 })
  // archive by direct db write (cheaper than calling the action with session juggling)
  await db.promotion.update({
    where: { id: promo.id },
    data: { archivedAt: new Date() },
  })
  await createCustomerSession()

  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )
  const order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(Number(order!.discountTotal), 0)
})

test('createOrder enforces maxRedemptions atomically', async () => {
  const { vendorUser, product } = await setupVendorAndProduct({ price: 40, stock: 10 })
  await createPromoAs(vendorUser.id, { value: 10, maxRedemptions: 1, perUserLimit: 100 })

  // First buyer consumes the single redemption budget.
  const firstBuyer = await createCustomerSession()
  await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )

  // Second buyer should place the order WITHOUT the discount (no rollback
  // on the order itself, just no promo applied).
  const secondBuyer = await createUser('CUSTOMER')
  useTestSession(buildSession(secondBuyer.id, 'CUSTOMER'))
  const created = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )
  const order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.equal(Number(order!.discountTotal), 0)

  // Safety: the promo counter never exceeds maxRedemptions
  const promo = await db.promotion.findFirst({ where: { vendorId: (await db.product.findUnique({ where: { id: product.id } }))!.vendorId } })
  assert.equal(promo?.redemptionCount, 1)

  // Silence the unused reference for lint
  void firstBuyer
})

test('createOrder enforces perUserLimit', async () => {
  const { vendorUser, product } = await setupVendorAndProduct({ price: 40, stock: 10 })
  await createPromoAs(vendorUser.id, { value: 10, perUserLimit: 1 })

  const buyer = await createCustomerSession()

  const first = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )
  const firstOrder = await db.order.findUnique({ where: { id: first.orderId } })
  assert.equal(Number(firstOrder!.discountTotal), 4)

  // Same buyer, second order — the promo must NOT apply again.
  const second = await createOrder(
    [{ productId: product.id, quantity: 1 }],
    { address: ADDRESS, saveAddress: false }
  )
  const secondOrder = await db.order.findUnique({ where: { id: second.orderId } })
  assert.equal(Number(secondOrder!.discountTotal), 0)

  // Silence the unused reference for lint
  void buyer
})

test('createOrder scopes promotions per vendor in a multi-vendor cart', async () => {
  const { vendorUser: vuA, vendor: vendorA, product: productA } =
    await setupVendorAndProduct({ price: 30, stock: 5 })
  const { vendorUser: vuB, vendor: vendorB, product: productB } =
    await setupVendorAndProduct({ price: 50, stock: 5 })

  await createPromoAs(vuA.id, { name: 'A 10%', value: 10 })
  await createPromoAs(vuB.id, { name: 'B fixed 7', kind: 'FIXED_AMOUNT', value: 7 })

  await createCustomerSession()

  const created = await createOrder(
    [
      { productId: productA.id, quantity: 1 }, // 30
      { productId: productB.id, quantity: 1 }, // 50
    ],
    { address: ADDRESS, saveAddress: false }
  )
  const order = await db.order.findUnique({
    where: { id: created.orderId },
    include: { fulfillments: { orderBy: { createdAt: 'asc' } } },
  })
  assert.ok(order)
  // Vendor A: 10% of 30 = 3. Vendor B: fixed 7.
  const byVendor = new Map(
    order!.fulfillments.map(f => [f.vendorId, Number(f.discountAmount)])
  )
  assert.equal(byVendor.get(vendorA.id), 3)
  assert.equal(byVendor.get(vendorB.id), 7)
  assert.equal(Number(order!.discountTotal), 10)
})

test('createOrder skips FREE_SHIPPING promotions in multi-vendor carts', async () => {
  const { vendorUser: vuA, product: productA } = await setupVendorAndProduct({ price: 30, stock: 5 })
  const { product: productB } = await setupVendorAndProduct({ price: 50, stock: 5 })

  await createPromoAs(vuA.id, { name: 'Free ship A', kind: 'FREE_SHIPPING', value: 0 })
  await createCustomerSession()

  const created = await createOrder(
    [
      { productId: productA.id, quantity: 1 },
      { productId: productB.id, quantity: 1 },
    ],
    { address: ADDRESS, saveAddress: false }
  )
  const order = await db.order.findUnique({ where: { id: created.orderId } })
  assert.ok(Number(order!.shippingCost) > 0)
  assert.equal(Number(order!.discountTotal), 0)
})

test('previewPromotionsForCart returns the applied discount without writing anything', async () => {
  const { vendorUser, vendor, product } = await setupVendorAndProduct({ price: 50, stock: 5 })
  await createPromoAs(vendorUser.id, { value: 20, perUserLimit: 100 })
  await createCustomerSession()

  const preview = await previewPromotionsForCart({
    items: [{ productId: product.id, quantity: 2 }],
    code: null,
    shippingCost: 4.95,
  })

  assert.equal(preview.ok, true)
  assert.equal(preview.subtotalDiscount, 20)
  assert.equal(preview.appliedByVendor.length, 1)
  assert.equal(preview.appliedByVendor[0].vendorId, vendor.id)
  assert.equal(preview.appliedByVendor[0].discountAmount, 20)

  // No rows were created / mutated
  const orders = await db.order.count()
  assert.equal(orders, 0)
  const promo = await db.promotion.findFirst({ where: { vendorId: vendor.id } })
  assert.equal(promo?.redemptionCount, 0)
})

test('previewPromotionsForCart surfaces an unknown code without crashing', async () => {
  const { product } = await setupVendorAndProduct()
  await createCustomerSession()

  const preview = await previewPromotionsForCart({
    items: [{ productId: product.id, quantity: 1 }],
    code: 'TYPO',
    shippingCost: 0,
  })
  assert.equal(preview.subtotalDiscount, 0)
  assert.deepEqual(preview.unknownCodes, ['TYPO'])
})
