import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'

/**
 * Result of resolving the User row that owns a checkout. For
 * authenticated sessions the caller already has the id; this helper
 * is concerned with the guest path (#1072), where the buyer submits
 * an email and we must mint or reuse a User without colliding with a
 * real account that the email's owner has not authorized us to touch.
 */
export type ResolveCustomerResult =
  | { ok: true; userId: string; isGuest: boolean }
  | { ok: false; error: string }

/**
 * Decide whether an existing User row belongs to a real account or
 * to a previous guest checkout. Real accounts are protected: the
 * caller must NOT auto-attach a guest order to them, because the
 * email's owner never authorized this checkout. Markers of a real
 * account: a credentials password, any OAuth Account row, or a
 * confirmed `emailVerified` timestamp.
 */
function looksLikeRealAccount(user: {
  passwordHash: string | null
  emailVerified: Date | null
  accountsCount: number
}) {
  return (
    user.passwordHash !== null ||
    user.emailVerified !== null ||
    user.accountsCount > 0
  )
}

/**
 * Resolve the customer User row for a guest checkout. Three outcomes:
 *
 * 1. No User exists for this email → mint one with passwordHash null,
 *    emailVerified null, role CUSTOMER. Future authenticated login via
 *    the same email (passwordless / magic link / OAuth) will inherit
 *    the orders attached to this row.
 *
 * 2. A User exists but it's a previous guest (no password, no linked
 *    account, no verified email) → reuse it. Returning guests with
 *    the same email keep their order history under one row.
 *
 * 3. A User exists AND it's a real account → reject. We tell the buyer
 *    to log in. We do NOT auto-attach the order: doing so would assign
 *    a purchase to an account whose owner did not authorize it, and
 *    the guest would never see the order again.
 */
export async function resolveGuestCustomer(
  email: string,
  firstName: string,
  lastName: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<ResolveCustomerResult> {
  const normalizedEmail = email.trim().toLowerCase()

  const existing = await client.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      passwordHash: true,
      emailVerified: true,
      _count: { select: { accounts: true } },
    },
  })

  if (existing) {
    const realAccount = looksLikeRealAccount({
      passwordHash: existing.passwordHash,
      emailVerified: existing.emailVerified,
      accountsCount: existing._count.accounts,
    })
    if (realAccount) {
      return {
        ok: false,
        error:
          'Ya existe una cuenta con este email. Inicia sesión para continuar con tu pedido.',
      }
    }
    return { ok: true, userId: existing.id, isGuest: true }
  }

  const created = await client.user.create({
    data: {
      email: normalizedEmail,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      // Guest: passwordHash null + emailVerified null. A future login
      // via magic link or OAuth will populate these and "claim" the
      // account. We do not pre-claim here — that would be a silent
      // auth event without consent.
    },
    select: { id: true },
  })

  return { ok: true, userId: created.id, isGuest: true }
}
