import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createCheckoutOrder } from '@/domains/orders/actions'
import { resetServerEnvCache } from '@/lib/env'
import { clearTestFlagOverrides, setTestFlagOverrides } from '../flags-helper'
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
 * Kill switch contract for createCheckoutOrder. Covers:
 *   - flag `false` via override → returns ok:false with friendly error,
 *     no Order row is created;
 *   - flag absent (PostHog not configured) → fail-open, normal checkout.
 * The override helper short-circuits PostHog so this test never hits
 * the network.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, { PAYMENT_PROVIDER: 'mock' })
  resetServerEnvCache()
})

afterEach(() => {
  clearTestSession()
  clearTestFlagOverrides()
  resetServerEnvCache()
})

async function buildCheckoutInputs() {
  const buyer = await createUser('CUSTOMER')
  const { vendor } = await createVendorUser()
  const product = await createActiveProduct(vendor.id, {
    basePrice: 12,
    stock: 5,
    trackStock: true,
  })
  useTestSession(buildSession(buyer.id, 'CUSTOMER'))
  return {
    items: [{ productId: product.id, quantity: 1 }],
    formData: {
      address: {
        firstName: 'Kill',
        lastName: 'Switch',
        line1: 'Calle Flag 1',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
      },
      saveAddress: false,
    },
  }
}

test('kill-checkout=false short-circuits with friendly error, no Order created', async () => {
  setTestFlagOverrides({ 'kill-checkout': false })
  const { items, formData } = await buildCheckoutInputs()

  const { db } = await import('@/lib/db')
  const ordersBefore = await db.order.count()

  const result = await createCheckoutOrder(items, formData)

  assert.equal(result.ok, false)
  if (result.ok === false) {
    assert.match(result.error, /temporalmente desactivado/i)
  }

  const ordersAfter = await db.order.count()
  assert.equal(ordersAfter, ordersBefore, 'no Order should be created')
})

test('kill-checkout=true lets checkout proceed', async () => {
  setTestFlagOverrides({ 'kill-checkout': true })
  const { items, formData } = await buildCheckoutInputs()

  const result = await createCheckoutOrder(items, formData)
  assert.equal(result.ok, true)
})

test('no flag override + no PostHog key → fail-open, checkout proceeds', async () => {
  clearTestFlagOverrides()
  const savedKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY
  try {
    const { items, formData } = await buildCheckoutInputs()
    const result = await createCheckoutOrder(items, formData)
    assert.equal(result.ok, true)
  } finally {
    if (savedKey) process.env.NEXT_PUBLIC_POSTHOG_KEY = savedKey
  }
})
