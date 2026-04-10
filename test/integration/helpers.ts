import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { resetTestActionSession, setTestActionSession, type ActionSession } from '@/lib/action-session'
import type { UserRole } from '@/generated/prisma/enums'

export async function resetIntegrationDatabase() {
  const tables = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
  )

  if (tables.length === 0) return

  const tableList = tables
    .map(table => `"${table.tablename}"`)
    .join(', ')

  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
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
      certifications: [],
      tags: [],
      status: 'ACTIVE',
      ...overrides,
    },
  })
}
