import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { exportOrdersCsv, CsvExportRateLimitError } from '@/domains/analytics/actions'
import { db } from '@/lib/db'
import { resetServerEnvCache } from '@/lib/env'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

// Pins the contract for #1348 (epic #1346): every CSV export of admin
// analytics MUST be rate-limited per actor and recorded in AuditLog,
// and the CSV must NOT leak full customer names — initials only.

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
  resetServerEnvCache()
})

async function seedOneOrder() {
  const customer = await db.user.create({
    data: {
      email: `c-${randomUUID()}@example.com`,
      firstName: 'Juan',
      lastName: 'Pérez García',
      role: 'CUSTOMER',
      isActive: true,
    },
  })
  const vendorUser = await createUser('VENDOR')
  const vendor = await db.vendor.create({
    data: {
      userId: vendorUser.id,
      slug: `v-${randomUUID().slice(0, 8)}`,
      displayName: 'Vendor Test',
      status: 'ACTIVE',
      stripeOnboarded: true,
    },
  })
  const product = await db.product.create({
    data: {
      vendorId: vendor.id,
      name: 'Test Product',
      slug: `p-${randomUUID().slice(0, 8)}`,
      basePrice: 10,
      status: 'ACTIVE',
    },
  })
  await db.order.create({
    data: {
      orderNumber: `ORD-${randomUUID().slice(0, 6)}`,
      customerId: customer.id,
      placedAt: new Date(),
      status: 'PAYMENT_CONFIRMED',
      subtotal: 1000,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 1000,
      lines: {
        create: {
          vendorId: vendor.id,
          productId: product.id,
          productSnapshot: {},
          quantity: 1,
          unitPrice: 1000,
          taxRate: 0.1,
        },
      },
    },
  })
  return { customer, vendor }
}

test('exportOrdersCsv minimizes customerName to initials and writes a DATA_EXPORT audit row', async () => {
  const admin = await createUser('SUPERADMIN')
  const { customer } = await seedOneOrder()

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))

  const csv = await exportOrdersCsv({ preset: '30d' })

  // Full first/last names must NOT appear; initials must.
  assert.ok(!csv.includes('Juan'), 'CSV must not contain customer firstName')
  assert.ok(!csv.includes('Pérez'), 'CSV must not contain customer lastName')
  assert.ok(csv.includes('J. P. G.'), `CSV must contain initials, got: ${csv}`)
  // Sanity: customer was actually persisted.
  const persisted = await db.user.findUniqueOrThrow({ where: { id: customer.id } })
  assert.equal(persisted.firstName, 'Juan')

  // Exactly one audit row for the export.
  const auditRows = await db.auditLog.findMany({
    where: { entityType: 'analytics.orders', actorId: admin.id },
  })
  assert.equal(auditRows.length, 1, 'expected exactly one audit row for the export')
  const row = auditRows[0]!
  assert.equal(row.action, 'DATA_EXPORT')
  assert.equal(row.actorRole, 'SUPERADMIN')
  const after = row.after as { rowCount: number; filters: Record<string, unknown> } | null
  assert.ok(after, 'audit `after` payload must be present')
  assert.equal(after.rowCount, 1)
  assert.ok(after.filters && typeof after.filters === 'object')
})

test('exportOrdersCsv blocks a second export within the rate window', async () => {
  const admin = await createUser('SUPERADMIN')
  await seedOneOrder()

  useTestSession(buildSession(admin.id, 'SUPERADMIN'))

  await exportOrdersCsv({ preset: '30d' })

  await assert.rejects(
    () => exportOrdersCsv({ preset: '30d' }),
    (err: unknown) => err instanceof CsvExportRateLimitError && err.retryAfterSeconds > 0,
    'second export within the window must throw CsvExportRateLimitError',
  )

  // Failed export does NOT write a second audit row.
  const auditRows = await db.auditLog.findMany({
    where: { entityType: 'analytics.orders', actorId: admin.id },
  })
  assert.equal(auditRows.length, 1, 'rate-limited export must not write an audit row')
})
