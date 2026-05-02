import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { resetIntegrationDatabase, createUser } from './helpers'

/**
 * DB audit / GDPR (#961). The User → Order/Review/Incident foreign keys
 * are now declared `ON DELETE RESTRICT`. The account-erase flow at
 * /api/account/delete anonimizes the User row instead of deleting it
 * (orders kept 5 years for tax compliance, reviews scrubbed but kept,
 * incidents preserved). RESTRICT prevents a future `prisma.user.delete()`
 * from silently wiping all of that.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('hard-deleting a User with Orders is rejected (P2003)', async () => {
  const customer = await createUser('CUSTOMER')
  await db.order.create({
    data: {
      orderNumber: `ORD-FK-${Date.now()}`,
      customerId: customer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: '10.00',
      taxAmount: '0',
      grandTotal: '10.00',
    },
  })

  await assert.rejects(
    () => db.user.delete({ where: { id: customer.id } }),
    (err: { code?: string; message: string }) =>
      err.code === 'P2003' || /foreign key|RESTRICT/i.test(err.message),
  )

  // The user row must still exist after the rejected delete.
  const stillThere = await db.user.findUnique({ where: { id: customer.id } })
  assert.ok(stillThere, 'user must not have been removed by the failed delete')
})
