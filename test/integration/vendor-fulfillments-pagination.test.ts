import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  buildSession,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'
import {
  getMyFulfillmentsPaginated,
  getMyFulfillmentKpis,
} from '@/domains/vendors/actions'
import { VENDOR_FULFILLMENT_PAGE_SIZE } from '@/domains/vendors/types'

/**
 * DB audit P1.2-B (#963). The /vendor/pedidos dashboard now uses
 * cursor pagination + aggregate KPIs instead of hydrating every
 * fulfillment row for the vendor on each load.
 */

async function seedFulfillments(
  vendorId: string,
  n: number,
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' = 'PENDING',
) {
  const out = []
  for (let i = 0; i < n; i++) {
    const customer = await createUser('CUSTOMER')
    const order = await db.order.create({
      data: {
        orderNumber: `F-${i}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        customerId: customer.id,
        status: 'PLACED',
        paymentStatus: 'PENDING',
        subtotal: '10.00',
        taxAmount: '0',
        grandTotal: '10.00',
      },
    })
    const f = await db.vendorFulfillment.create({
      data: {
        orderId: order.id,
        vendorId,
        status,
        createdAt: new Date(Date.now() + i * 1_000),
      },
    })
    out.push(f)
  }
  return out
}

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('getMyFulfillmentsPaginated returns at most pageSize and signals next', async () => {
  const { user, vendor } = await createVendorUser()
  await seedFulfillments(vendor.id, VENDOR_FULFILLMENT_PAGE_SIZE + 5)

  useTestSession(buildSession(user.id, 'VENDOR'))
  const page1 = await getMyFulfillmentsPaginated({})

  assert.equal(page1.items.length, VENDOR_FULFILLMENT_PAGE_SIZE)
  assert.equal(page1.hasNextPage, true)
  assert.ok(page1.nextCursor, 'nextCursor must be set on a non-final page')

  const page2 = await getMyFulfillmentsPaginated({ cursor: page1.nextCursor! })
  assert.equal(page2.items.length, 5)
  assert.equal(page2.hasNextPage, false)
  assert.equal(page2.nextCursor, null)

  // No row appears twice across the two pages.
  const ids = new Set([...page1.items, ...page2.items].map((f) => f.id))
  assert.equal(ids.size, VENDOR_FULFILLMENT_PAGE_SIZE + 5)
})

test('getMyFulfillmentsPaginated is scoped to the requesting vendor', async () => {
  const { user: userA, vendor: vendorA } = await createVendorUser()
  const { vendor: vendorB } = await createVendorUser()
  await seedFulfillments(vendorA.id, 3)
  await seedFulfillments(vendorB.id, 7)

  useTestSession(buildSession(userA.id, 'VENDOR'))
  const page = await getMyFulfillmentsPaginated({ statuses: ['PENDING'] })

  assert.equal(page.items.length, 3)
  for (const f of page.items) assert.equal(f.vendorId, vendorA.id)
})

test('getMyFulfillmentKpis aggregates over the full vendor population', async () => {
  const { user, vendor } = await createVendorUser()
  await seedFulfillments(vendor.id, 4, 'PENDING')
  await seedFulfillments(vendor.id, 2, 'CONFIRMED')
  await seedFulfillments(vendor.id, 1, 'CANCELLED')

  useTestSession(buildSession(user.id, 'VENDOR'))
  const kpis = await getMyFulfillmentKpis()

  assert.equal(kpis.pending, 4)
  assert.equal(kpis.inPrep, 2) // CONFIRMED counts towards inPrep
})
