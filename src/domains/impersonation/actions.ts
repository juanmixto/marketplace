'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { logger } from '@/lib/logger'
import { UserRole } from '@/generated/prisma/enums'
import { hasRole } from '@/lib/roles'
import { safeRevalidatePath } from '@/lib/revalidate'
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_SECONDS,
  assertImpersonationSafeToEnable,
  createImpersonationSessionId,
  isImpersonationEnabled,
  signImpersonationToken,
  verifyImpersonationToken,
} from '@/lib/impersonation'

const IMPERSONATION_STARTERS: readonly UserRole[] = [
  UserRole.ADMIN_SUPPORT,
  UserRole.SUPERADMIN,
] as const

const startSchema = z.object({
  vendorId: z.string().min(1),
  reason: z.string().min(5).max(500),
  readOnly: z.boolean().default(true),
})

/**
 * Starts an impersonation session. Only ADMIN_SUPPORT and SUPERADMIN can
 * call this. Requires the `IMPERSONATION_ENABLED` feature flag. Emits an
 * audit log entry and sets the `mp_impersonation` cookie.
 */
export async function startImpersonation(input: unknown): Promise<void> {
  if (!isImpersonationEnabled()) {
    throw new Error('[impersonation] Feature disabled')
  }
  // #1155: refuse to issue an impersonation token when the read-only
  // guard isn't actually wired into the vendor mutation surface. Sets
  // a hard floor so a future operator who flips the flag in env can't
  // accidentally bypass the read-only contract that the cookie's
  // payload claims to enforce.
  assertImpersonationSafeToEnable()

  const session = await getActionSession()
  if (!session || !hasRole(session.user.role, IMPERSONATION_STARTERS)) {
    throw new Error('[impersonation] Not authorized')
  }

  const { vendorId, reason, readOnly } = startSchema.parse(input)

  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, userId: true, displayName: true },
  })
  if (!vendor) {
    throw new Error('[impersonation] Vendor not found')
  }

  const sid = createImpersonationSessionId()
  const token = signImpersonationToken({
    sid,
    adminId: session.user.id,
    targetUserId: vendor.userId,
    vendorId: vendor.id,
    readOnly,
  })

  logger.info('impersonation.started', {
    sid,
    adminId: session.user.id,
    adminRole: session.user.role,
    vendorId: vendor.id,
    targetUserId: vendor.userId,
    readOnly,
    reason,
    ttlSeconds: IMPERSONATION_TTL_SECONDS,
  })

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: IMPERSONATION_TTL_SECONDS,
  })

  // The impersonating admin is about to see the vendor surface as a different
  // identity. Any RSC payload cached from the admin's own session must not be
  // served for these paths — bust it before the redirect lands.
  safeRevalidatePath('/vendor/dashboard')
  safeRevalidatePath('/vendor/pedidos')
  safeRevalidatePath('/vendor/productos')

  redirect('/vendor/dashboard')
}

/**
 * Ends the current impersonation session by clearing the cookie. Safe to
 * call even when no session is active.
 */
export async function endImpersonation(): Promise<void> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(IMPERSONATION_COOKIE)?.value
  const context = verifyImpersonationToken(existing)

  if (context) {
    logger.info('impersonation.ended', {
      sid: context.sid,
      adminId: context.adminId,
      vendorId: context.vendorId,
      remainingSeconds: context.remainingSeconds,
    })
  }

  cookieStore.delete(IMPERSONATION_COOKIE)

  safeRevalidatePath('/admin/dashboard')
  safeRevalidatePath('/vendor/dashboard')

  redirect('/admin/dashboard')
}
