/**
 * Helpers for managing the "default address" invariant atomically.
 *
 * The invariant: at most one address per user has isDefault = true.
 * These helpers are designed to run inside a Prisma `$transaction` so that
 * clearing the previous default and setting the new one happen atomically.
 */

type AddressDelegate = {
  updateMany: (args: {
    where: { userId: string; isDefault: boolean; id?: { not: string } }
    data: { isDefault: boolean }
  }) => Promise<{ count: number }>
  findFirst: (args: {
    where: { userId: string; id?: { not: string } }
    orderBy: { createdAt: 'asc' | 'desc' }
  }) => Promise<{ id: string } | null>
  update: (args: {
    where: { id: string }
    data: { isDefault: boolean }
  }) => Promise<unknown>
}

export type AddressTxClient = { address: AddressDelegate }

export async function clearOtherDefaults(
  tx: AddressTxClient,
  userId: string,
  exceptId?: string
): Promise<number> {
  const where: { userId: string; isDefault: boolean; id?: { not: string } } = {
    userId,
    isDefault: true,
  }
  if (exceptId) where.id = { not: exceptId }

  const result = await tx.address.updateMany({ where, data: { isDefault: false } })
  return result.count
}

export async function promoteOldestAsDefault(
  tx: AddressTxClient,
  userId: string
): Promise<string | null> {
  const next = await tx.address.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })
  if (!next) return null
  await tx.address.update({ where: { id: next.id }, data: { isDefault: true } })
  return next.id
}
