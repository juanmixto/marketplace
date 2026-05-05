import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { suspendVendor } from '@/domains/admin/actions'
import { advanceFulfillment, confirmFulfillmentByUserId } from '@/domains/vendors/actions'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * #1334: vendor SUSPENDED cascade.
 *
 * Two halves of the same gate:
 *   - Action-level: vendor portal + Telegram callbacks must refuse to
 *     progress a fulfillment when the vendor is not ACTIVE.
 *   - Cascade: when admin suspends a vendor, fulfillments that have not
 *     committed physical work (PENDING / CONFIRMED / LABEL_FAILED) get
 *     cancelled in the same transaction. PREPARING / READY / SHIPPED+
 *     are left alone — admin handles them out-of-band.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

async function asSuperadmin() {
  const u = await db.user.create({
    data: {
      email: `superadmin-${randomUUID().slice(0, 6)}@example.com`,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPERADMIN',
      isActive: true,
    },
  })
  useTestSession(buildSession(u.id, 'SUPERADMIN'))
  return u
}

async function createOrderWithFulfillment(opts: {
  vendorId: string
  fulfillmentStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SHIPPED' | 'LABEL_FAILED'
}) {
  const buyer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
      customerId: buyer.id,
      status: 'PAYMENT_CONFIRMED',
      paymentStatus: 'SUCCEEDED',
      subtotal: 50,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 50,
    },
  })
  const fulfillment = await db.vendorFulfillment.create({
    data: {
      orderId: order.id,
      vendorId: opts.vendorId,
      status: opts.fulfillmentStatus,
    },
  })
  return { order, fulfillment }
}

// ─── Cascade in suspendVendor ──────────────────────────────────────────────

test('suspendVendor: cancels PENDING fulfillments and writes OrderEvent', async () => {
  const { vendor } = await createVendorUser()
  const { order, fulfillment } = await createOrderWithFulfillment({
    vendorId: vendor.id,
    fulfillmentStatus: 'PENDING',
  })

  await asSuperadmin()
  await suspendVendor(vendor.id)

  const refreshed = await db.vendorFulfillment.findUniqueOrThrow({
    where: { id: fulfillment.id },
  })
  assert.equal(refreshed.status, 'CANCELLED')

  const events = await db.orderEvent.findMany({
    where: { orderId: order.id, type: 'VENDOR_SUSPENDED_FULFILLMENT_CANCELLED' },
  })
  assert.equal(events.length, 1)
})

test('suspendVendor: cancels CONFIRMED and LABEL_FAILED, leaves PREPARING/READY/SHIPPED', async () => {
  const { vendor } = await createVendorUser()
  const cancellableFs = await Promise.all(
    (['PENDING', 'CONFIRMED', 'LABEL_FAILED'] as const).map(s =>
      createOrderWithFulfillment({ vendorId: vendor.id, fulfillmentStatus: s }),
    ),
  )
  const preservedFs = await Promise.all(
    (['PREPARING', 'READY', 'SHIPPED'] as const).map(s =>
      createOrderWithFulfillment({ vendorId: vendor.id, fulfillmentStatus: s }),
    ),
  )

  await asSuperadmin()
  await suspendVendor(vendor.id)

  for (const { fulfillment } of cancellableFs) {
    const f = await db.vendorFulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })
    assert.equal(f.status, 'CANCELLED', `expected CANCELLED for ${fulfillment.id}`)
  }
  for (const { fulfillment, order: _o } of preservedFs) {
    const f = await db.vendorFulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })
    assert.notEqual(f.status, 'CANCELLED', `expected NOT CANCELLED for ${fulfillment.id}`)
  }
})

test('suspendVendor: no-op cascade when vendor has no in-flight fulfillments', async () => {
  const { vendor } = await createVendorUser()
  await asSuperadmin()
  await suspendVendor(vendor.id)

  const v = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(v.status, 'SUSPENDED_TEMP')
})

// ─── Action-level gate: vendor portal ──────────────────────────────────────

test('advanceFulfillment: refuses progression when vendor is SUSPENDED_TEMP', async () => {
  const { vendor, user } = await createVendorUser()
  const { fulfillment } = await createOrderWithFulfillment({
    vendorId: vendor.id,
    fulfillmentStatus: 'CONFIRMED',
  })

  // Suspend AFTER creating the fulfillment so the row exists.
  await db.vendor.update({ where: { id: vendor.id }, data: { status: 'SUSPENDED_TEMP' } })

  useTestSession(buildSession(user.id, 'VENDOR'))
  await assert.rejects(() => advanceFulfillment(fulfillment.id), /suspendida/i)

  // State must not have advanced.
  const f = await db.vendorFulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })
  assert.equal(f.status, 'CONFIRMED')
})

// ─── Action-level gate: Telegram out-of-band ───────────────────────────────

test('confirmFulfillmentByUserId: returns VENDOR_SUSPENDED when vendor not ACTIVE', async () => {
  const { vendor, user } = await createVendorUser()
  const { fulfillment } = await createOrderWithFulfillment({
    vendorId: vendor.id,
    fulfillmentStatus: 'PENDING',
  })

  await db.vendor.update({ where: { id: vendor.id }, data: { status: 'SUSPENDED_PERM' } })

  const result = await confirmFulfillmentByUserId(user.id, fulfillment.id)
  assert.equal(result.ok, false)
  assert.equal(result.ok ? '' : result.code, 'VENDOR_SUSPENDED')

  const f = await db.vendorFulfillment.findUniqueOrThrow({ where: { id: fulfillment.id } })
  assert.equal(f.status, 'PENDING', 'fulfillment must not advance for suspended vendor')
})
