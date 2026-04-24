import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createOrder } from '@/domains/orders/actions'
import { createPromotion } from '@/domains/promotions/actions'
import { setTestCreatePaymentIntentOverride } from '@/domains/payments/provider'
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
 * Safety-net tests for the critical checkout invariants that are most
 * vulnerable to refactors and concurrency regressions.
 *
 * Existing integration suites already pin dedupe, cross-user protection,
 * amount verification, persist-first cleanup, and manual confirmation.
 * This file focuses on race-prone behavior that is easy to break during
 * structural changes:
 *   - stock must remain consistent under concurrent checkouts
 *   - promotions must never be over-redeemed under concurrent checkouts
 */

const ADDRESS = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  line1: 'Calle Mayor 1',
  city: 'Madrid',
  province: 'Madrid',
  postalCode: '28001',
}

beforeEach(async () => {
  Object.assign(process.env, { PAYMENT_PROVIDER: 'mock', NODE_ENV: 'test' })
  resetServerEnvCache()
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
  setTestCreatePaymentIntentOverride(undefined)
  resetServerEnvCache()
})

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
    perUserLimit: overrides.perUserLimit ?? 100,
    startsAt: overrides.startsAt ?? new Date().toISOString(),
    endsAt: overrides.endsAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  })
}

test('createOrder keeps stock consistent when two checkouts race for the last unit', async () => {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, {
    basePrice: 10,
    stock: 1,
    trackStock: true,
  })
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  let providerCalls = 0
  setTestCreatePaymentIntentOverride(async amountCents => {
    providerCalls += 1
    const id = `mock_pi_stock_${providerCalls}`
    return { id, clientSecret: `${id}_secret`, amount: amountCents }
  })

  const payload = () =>
    createOrder(
      [{ productId: product.id, quantity: 1 }],
      { address: ADDRESS, saveAddress: false }
    )

  const results = await Promise.allSettled([payload(), payload()])
  const fulfilled = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>> => result.status === 'fulfilled')
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')

  assert.equal(fulfilled.length + rejected.length, 2)
  assert.equal(fulfilled.length, 1, 'exactly one checkout should succeed')
  assert.equal(rejected.length, 1, 'the losing checkout should fail')
  assert.match(
    rejected[0]?.reason instanceof Error ? rejected[0].reason.message : String(rejected[0]?.reason),
    /stock insuficiente/i
  )

  const refreshed = await db.product.findUnique({
    where: { id: product.id },
    select: { stock: true },
  })
  assert.equal(refreshed?.stock, 0, 'stock must never go negative or double-decrement')

  const orders = await db.order.findMany({ where: { customerId: buyer.id } })
  const payments = await db.payment.findMany({ where: { order: { customerId: buyer.id } } })
  assert.equal(orders.length, 1, 'only one order row should survive the race')
  assert.equal(payments.length, 1, 'only one payment row should survive the race')
  assert.equal(providerCalls, 1, 'PaymentIntent creation must happen once')
})

test('createOrder never over-redeems a promotion when two checkouts race for the last redemption', async () => {
  const buyer = await createUser('CUSTOMER')
  const { user: vendorUser, vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, {
    basePrice: 50,
    stock: 2,
    trackStock: true,
  })
  await createPromoAs(vendorUser.id, {
    name: 'Limited 10%',
    value: 10,
    maxRedemptions: 1,
    perUserLimit: 100,
  })
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))

  const payload = () =>
    createOrder(
      [{ productId: product.id, quantity: 1 }],
      { address: ADDRESS, saveAddress: false }
    )

  const results = await Promise.allSettled([payload(), payload()])
  const settledOrders = await db.order.findMany({
    where: { customerId: buyer.id },
    include: { fulfillments: true },
    orderBy: { placedAt: 'asc' },
  })
  const promo = await db.promotion.findFirst({
    where: { vendorId: vendor.id },
  })

  assert.equal(results.length, 2)
  assert.equal(promo?.redemptionCount, 1, 'promotion budget must be claimed at most once')
  assert.equal(
    settledOrders.filter(order => Number(order.discountTotal) > 0).length,
    1,
    'at most one order should receive the discount'
  )
  assert.equal(
    settledOrders.filter(order => order.fulfillments.some(fulfillment => fulfillment.promotionId)).length,
    1,
    'at most one fulfillment should hold the promotion claim'
  )
})
