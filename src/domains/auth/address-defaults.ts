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
  findMany: (args: {
    where: { userId: string; isDefault: true }
    orderBy: { updatedAt: 'asc' | 'desc' }
    select: { id: true }
  }) => Promise<{ id: string }[]>
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

/**
 * Heal the "single default" invariant for a user.
 *
 * When the database somehow ended up with multiple addresses marked as
 * default (legacy data, race conditions, or past bugs), this picks the most
 * recently updated one as the canonical default and clears the rest.
 *
 * Returns the id of the surviving default, or null if the user has no
 * default-flagged addresses.
 */
export async function enforceSingleDefault(
  tx: AddressTxClient,
  userId: string
): Promise<string | null> {
  const defaults = await tx.address.findMany({
    where: { userId, isDefault: true },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (defaults.length <= 1) return defaults[0]?.id ?? null

  const keepId = defaults[0]!.id
  await tx.address.updateMany({
    where: { userId, isDefault: true, id: { not: keepId } },
    data: { isDefault: false },
  })
  return keepId
}
