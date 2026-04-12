/**
 * Duck-typed Prisma error inspectors. We avoid importing
 * `Prisma.PrismaClientKnownRequestError` directly so this module stays cheap
 * to load and easy to unit-test in isolation.
 */

function getErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/** Prisma `P2002` — unique constraint violation. */
export function isUniqueConstraintViolation(err: unknown): boolean {
  return getErrorCode(err) === 'P2002'
}

/** Prisma `P2025` — record required by an operation was not found. */
export function isRecordNotFoundError(err: unknown): boolean {
  return getErrorCode(err) === 'P2025'
}
