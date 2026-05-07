import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { POST as POST_TEST_CHECKOUT } from '@/app/api/test-checkout/start/route'
import { ensureSyntheticMonitor } from '@/domains/synthetic-monitor/seed'
import { runCleanupAbandonedJob } from '@/workers/jobs/cleanup-abandoned'
import { resetIntegrationDatabase } from './helpers'

/**
 * Issue #1223 (epic #1225 — observability pre-launch).
 *
 * Synthetic-checkout endpoint:
 *   - 503 when SYNTHETIC_TOKEN unset
 *   - 401 on bad / missing bearer
 *   - 201 + Order created (status PLACED, synthetic=true) on valid bearer
 *   - synthetic vendor / product / customer are idempotent across calls
 *   - public catalog query never returns the synthetic product
 *
 * Cleanup-abandoned (#1285 + #1223 extension):
 *   - synthetic Orders > 24h purged with their lines
 *   - Real orders never touched even if older than 24h
 */

const ORIGINAL_TOKEN = process.env.SYNTHETIC_TOKEN

beforeEach(async () => {
  await resetIntegrationDatabase()
  process.env.SYNTHETIC_TOKEN = 'test-monitor-token-1234567890'
})

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.SYNTHETIC_TOKEN
  } else {
    process.env.SYNTHETIC_TOKEN = ORIGINAL_TOKEN
  }
})

function bearerRequest(token: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token !== null) headers.authorization = `Bearer ${token}`
  return new Request('http://localhost/api/test-checkout/start', {
    method: 'POST',
    headers,
    body: '{}',
  }) as Parameters<typeof POST_TEST_CHECKOUT>[0]
}

test('POST /api/test-checkout/start returns 503 when SYNTHETIC_TOKEN unset', async () => {
  delete process.env.SYNTHETIC_TOKEN
  const res = await POST_TEST_CHECKOUT(bearerRequest('whatever'))
  assert.equal(res.status, 503)
})

test('POST /api/test-checkout/start returns 401 on missing bearer', async () => {
  const res = await POST_TEST_CHECKOUT(bearerRequest(null))
  assert.equal(res.status, 401)
})

test('POST /api/test-checkout/start returns 401 on wrong token', async () => {
  const res = await POST_TEST_CHECKOUT(bearerRequest('wrong-token'))
  assert.equal(res.status, 401)
})

test('POST /api/test-checkout/start creates a synthetic Order on valid bearer', async () => {
  const res = await POST_TEST_CHECKOUT(bearerRequest('test-monitor-token-1234567890'))
  assert.equal(res.status, 201)
  const body = (await res.json()) as { orderId: string; orderNumber: string; status: string }
  assert.equal(body.status, 'PLACED')
  assert.match(body.orderNumber, /^SYN-/)

  const order = await db.order.findUniqueOrThrow({
    where: { id: body.orderId },
    include: { lines: true },
  })
  assert.equal(order.synthetic, true)
  assert.equal(order.status, 'PLACED')
  assert.equal(order.lines.length, 1)
})

test('ensureSyntheticMonitor is idempotent — repeated calls return the same ids', async () => {
  const a = await ensureSyntheticMonitor()
  const b = await ensureSyntheticMonitor()
  assert.equal(a.customerId, b.customerId)
  assert.equal(a.vendorId, b.vendorId)
  assert.equal(a.productId, b.productId)
  // And the synthetic vendor / product flags are set.
  const v = await db.vendor.findUniqueOrThrow({ where: { id: a.vendorId } })
  assert.equal(v.synthetic, true)
  const p = await db.product.findUniqueOrThrow({ where: { id: a.productId } })
  assert.equal(p.synthetic, true)
})

test('cleanup-abandoned purges synthetic Orders > 24h old (and their lines)', async () => {
  const refs = await ensureSyntheticMonitor()
  const old = await db.order.create({
    data: {
      orderNumber: `SYN-OLD-${Date.now()}`,
      customerId: refs.customerId,
      status: 'PAYMENT_CONFIRMED',
      paymentStatus: 'SUCCEEDED',
      subtotal: '1.00',
      taxAmount: '0',
      grandTotal: '1.00',
      synthetic: true,
      placedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      lines: {
        create: {
          vendorId: refs.vendorId,
          productId: refs.productId,
          quantity: 1,
          unitPrice: '1.00',
          taxRate: '0',
          productSnapshot: {
            version: 1,
            id: refs.productId,
            name: 'x',
            slug: 'x',
            images: [],
            unit: 'unidad',
            vendorName: 'x',
          },
        },
      },
    },
  })

  const result = await runCleanupAbandonedJob()
  assert.equal(result.syntheticOrders, 1)

  assert.equal(await db.order.count({ where: { id: old.id } }), 0)
  assert.equal(await db.orderLine.count({ where: { orderId: old.id } }), 0)
})

test('cleanup-abandoned NEVER purges a real (non-synthetic) order, even if older than 24h', async () => {
  // Create a real customer + a non-synthetic order placed 30 days ago.
  const realCustomer = await db.user.create({
    data: {
      email: `real-${Date.now()}@example.com`,
      firstName: 'Real',
      lastName: 'Customer',
      role: 'CUSTOMER',
      isActive: true,
    },
  })
  const oldReal = await db.order.create({
    data: {
      orderNumber: `ORD-REAL-${Date.now()}`,
      customerId: realCustomer.id,
      status: 'DELIVERED',
      paymentStatus: 'SUCCEEDED',
      subtotal: '20.00',
      taxAmount: '0',
      grandTotal: '20.00',
      synthetic: false,
      placedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  })

  const result = await runCleanupAbandonedJob()
  assert.equal(result.syntheticOrders, 0)

  const stillThere = await db.order.findUnique({ where: { id: oldReal.id } })
  assert.ok(stillThere, 'real order must NOT be deleted by cleanup-abandoned')
})

test('synthetic-monitor product is excluded from getAvailableProductWhere', async () => {
  const refs = await ensureSyntheticMonitor()
  const { getAvailableProductWhere } = await import('@/domains/catalog/availability')
  const visible = await db.product.findMany({
    where: getAvailableProductWhere(),
    select: { id: true, slug: true },
  })
  assert.equal(visible.find(p => p.id === refs.productId), undefined)
})
