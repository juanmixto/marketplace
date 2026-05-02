import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { resetTestActionSession, setTestActionSession, type ActionSession } from '@/lib/action-session'
import { waitForPendingNotifications } from '@/domains/notifications/dispatcher'
import type { UserRole } from '@/generated/prisma/enums'
import { assertSafeToTruncate } from './safety'

export async function resetIntegrationDatabase() {
  // Block accidental TRUNCATE of the dev DB when an integration test
  // is invoked outside `npm run test:integration`. See ./safety.ts.
  assertSafeToTruncate()

  // Drain fire-and-forget notification handlers from the previous
  // test before truncating. Server actions like `approveVendor` and
  // `createOrder` schedule handlers via `queueMicrotask`, and those
  // handlers insert into `NotificationDelivery` referencing a User
  // by id. Under shared-process isolation (--test-isolation=none) a
  // late handler from the previous test can otherwise race this
  // truncate and crash the next test with a FK violation
  // ("NotificationDelivery_userId_fkey"). See issue #975.
  await waitForPendingNotifications()

  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
  )

  if (tables.length === 0) return

  const tableList = tables
    .map(table => `"${table.tablename}"`)
    .join(', ')

  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)

  // Re-seed the fallback Category the Phase 4 publish migration
  // creates. The shared-isolation cohort registers every file's
  // `beforeEach(resetIntegrationDatabase)` globally in the same
  // process, so a later file's reset can wipe a row that an earlier
  // file's beforeEach seeded. Re-seeding here keeps the invariant
  // "after any reset, cat_uncategorized exists" true regardless of
  // hook ordering across files.
  await db.$executeRawUnsafe(`
    INSERT INTO "Category" ("id", "name", "slug", "isActive", "sortOrder", "createdAt", "updatedAt")
    VALUES ('cat_uncategorized', 'Sin categoría', 'uncategorized', true, 999, NOW(), NOW())
    ON CONFLICT ("slug") DO NOTHING
  `)
}

export function useTestSession(session: ActionSession | null) {
  setTestActionSession(session)
}

export function clearTestSession() {
  resetTestActionSession()
}

export function buildSession(userId: string, role: UserRole): ActionSession {
  return {
    user: {
      id: userId,
      role,
      email: `${userId}@example.com`,
      name: `Test ${role}`,
    },
  }
}

export async function createUser(role: UserRole = 'CUSTOMER') {
  return db.user.create({
    data: {
      email: `${role.toLowerCase()}-${randomUUID()}@example.com`,
      firstName: role === 'VENDOR' ? 'Vendor' : 'Customer',
      lastName: 'Tester',
      role,
      isActive: true,
    },
  })
}

export async function createVendorUser() {
  const user = await createUser('VENDOR')
  const vendor = await db.vendor.create({
    data: {
      userId: user.id,
      slug: `vendor-${randomUUID().slice(0, 8)}`,
      displayName: 'Vendor Test',
      status: 'ACTIVE',
      stripeOnboarded: true,
      stripeAccountId: `acct_test_${randomUUID().replace(/-/g, '')}`,
    },
  })

  return { user, vendor }
}

export async function createCategory() {
  return db.category.create({
    data: {
      name: `Categoria ${randomUUID().slice(0, 6)}`,
      slug: `categoria-${randomUUID().slice(0, 8)}`,
    },
  })
}

export async function createActiveProduct(vendorId: string, overrides: Record<string, unknown> = {}) {
  const category = await createCategory()

  return db.product.create({
    data: {
      vendorId,
      categoryId: category.id,
      name: 'Producto test',
      slug: `producto-${randomUUID().slice(0, 8)}`,
      basePrice: 12,
      taxRate: 0.1,
      unit: 'ud',
      stock: 8,
      trackStock: true,
      images: [],
      imageAlts: [],
      certifications: [],
      tags: [],
      status: 'ACTIVE',
      ...overrides,
    },
  })
}
