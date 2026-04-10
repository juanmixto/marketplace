import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { UserRole } from '@/generated/prisma/enums'
import { resetIntegrationDatabase } from './helpers'

beforeEach(async () => {
  await resetIntegrationDatabase()
})

function isConstraintError(error: unknown, expected: RegExp) {
  if (!(error instanceof Error)) return false

  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''

  return expected.test(error.message) || code === 'P2002' || code === 'P2004'
}

async function createVendor(stripeAccountId?: string) {
  const user = await db.user.create({
    data: {
      email: `vendor-${randomUUID()}@example.com`,
      firstName: 'Vendor',
      lastName: 'Tester',
      role: UserRole.VENDOR,
      isActive: true,
    },
  })

  return db.vendor.create({
    data: {
      userId: user.id,
      slug: `vendor-${randomUUID().slice(0, 8)}`,
      displayName: 'Vendor Test',
      status: 'ACTIVE',
      stripeAccountId: stripeAccountId ?? null,
    },
  })
}

test('CommissionRule requires at least one target reference', async () => {
  await assert.rejects(
    () =>
      db.commissionRule.create({
        data: {
          type: 'PERCENTAGE',
          rate: 0.12,
          isActive: true,
        },
      }),
    error => isConstraintError(error, /commission_rule_must_have_target|constraint/i)
  )
})

test('Vendor.stripeAccountId must be unique when present', async () => {
  const stripeAccountId = `acct_${randomUUID().slice(0, 10)}`
  await createVendor(stripeAccountId)

  await assert.rejects(
    () => createVendor(stripeAccountId),
    error => isConstraintError(error, /stripeAccountId|unique/i)
  )
})
