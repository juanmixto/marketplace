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

test('SubscriptionPlan: productId_cadence compound unique is reachable at runtime', async () => {
  // Regression guard: the generated Prisma client must expose the
  // `productId_cadence` compound key that `createSubscriptionPlan`
  // relies on for its cadence-aware duplicate check. A drift between
  // schema and generated client (stale `src/generated/prisma/` from a
  // prior Prisma version / missing `prisma generate` after a migration)
  // used to surface as a runtime "Unknown argument productId_cadence"
  // on /vendor/suscripciones/nueva.
  const result = await db.subscriptionPlan.findUnique({
    where: {
      productId_cadence: {
        productId: 'nonexistent-product-id',
        cadence: 'WEEKLY',
      },
    },
    select: { id: true },
  })
  // Null is the happy path — the important thing is that the query was
  // accepted by the Prisma validator. A regression surfaces as a thrown
  // PrismaClientValidationError, not as null.
  assert.equal(result, null)
})

test('SubscriptionPlan: @@unique([productId, cadence]) is enforced by the DB', async () => {
  const vendor = await createVendor()
  const product = await db.product.create({
    data: {
      vendorId: vendor.id,
      slug: `plan-test-${randomUUID().slice(0, 8)}`,
      name: 'Plan test product',
      basePrice: 10,
      taxRate: 0.1,
      unit: 'unidad',
      stock: 100,
      trackStock: true,
      status: 'ACTIVE',
    },
  })

  const base = {
    vendorId: vendor.id,
    productId: product.id,
    cadence: 'WEEKLY' as const,
    priceSnapshot: 10,
    taxRateSnapshot: 0.1,
    cutoffDayOfWeek: 5,
  }

  await db.subscriptionPlan.create({ data: base })

  // Same (productId, cadence) must fail — either via P2002 at the DB
  // level or the pre-check error from createSubscriptionPlan when the
  // app-layer guard runs first. Different cadences must still succeed.
  await assert.rejects(
    () => db.subscriptionPlan.create({ data: base }),
    error => isConstraintError(error, /productId|cadence|unique/i),
  )
  await assert.doesNotReject(
    () => db.subscriptionPlan.create({ data: { ...base, cadence: 'MONTHLY' } }),
  )
})
