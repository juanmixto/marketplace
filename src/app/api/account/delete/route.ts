'use server'

/**
 * GDPR Article 17: Right to Be Forgotten
 * Anonimizes user account (legal: orders retained 5 years for tax compliance)
 */

import bcrypt from 'bcryptjs'
import { getActionSession } from '@/lib/action-session'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'
import type { Prisma } from '@/generated/prisma/client'

export async function DELETE(request: NextRequest) {
  const session = await getActionSession()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const userId = session.user.id

  // #544: require current-password re-authentication before executing an
  // irreversible anonymization. A stolen/left-open session must not be
  // enough. OAuth-only accounts (passwordHash null) skip this check —
  // those accounts should be migrated to a re-auth flow separately.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })

  if (user?.passwordHash) {
    let body: { password?: unknown } = {}
    try {
      body = (await request.json()) as { password?: unknown }
    } catch {
      // empty body is also invalid below
    }
    const candidate = typeof body.password === 'string' ? body.password : ''
    if (!candidate) {
      return NextResponse.json(
        { error: 'password_required', code: 'password_required' },
        { status: 400 }
      )
    }
    const valid = await bcrypt.compare(candidate, user.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { error: 'invalid_password', code: 'invalid_password' },
        { status: 401 }
      )
    }
  }

  const rateLimitResult = await checkRateLimit('account-delete', userId, 3, 3600)
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: rateLimitResult.message ?? 'Demasiadas solicitudes' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': '3',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
        },
      }
    )
  }

  const ip = await getAuditRequestIp()
  const actorRole = session.user.role

  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Anonimize user (preserve foreign key integrity).
      // #1142: bump tokenVersion in the same statement as the
      // anonimization. The JWT callback will detect the mismatch on
      // the next refresh tick (≤60s) and strip identity claims, so
      // a session cookie that survived the deleteMany below cannot
      // continue to act as the (now anonimized) user.
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId}@anon.invalid`,
          passwordHash: null,
          deletedAt: new Date(),
          emailVerified: null,
          firstName: 'Usuario',
          lastName: 'Eliminado',
          image: null,
          tokenVersion: { increment: 1 },
        },
      })
      // Delete addresses (not needed for tax compliance)
      await tx.address.deleteMany({ where: { userId } })
      // Anonimize reviews (keep rating for products, remove text & author identity)
      await tx.review.updateMany({
        where: { customerId: userId },
        data: { body: null },
      })
      // Delete sessions (invalidate all active sessions)
      await tx.session.deleteMany({ where: { userId } })
      // #1350: extended GDPR Art.17 coverage. Without these, a "deleted"
      // user still has live OAuth tokens, push endpoints, telegram chat
      // ids and cart history attached to its now-anonimized User row.
      await tx.account.deleteMany({ where: { userId } })
      await tx.cart.deleteMany({ where: { userId } })
      await tx.pushSubscription.deleteMany({ where: { userId } })
      await tx.telegramLink.deleteMany({ where: { userId } })
      // Forensic trail of the self-erasure itself. Written last so any
      // earlier mutation failure rolls it back together with the rest.
      await createAuditLog(
        {
          action: 'USER_SELF_ERASED',
          entityType: 'User',
          entityId: userId,
          actorId: userId,
          actorRole,
          ip,
        },
        tx,
      )
    })

    return NextResponse.json({
      success: true,
      message: 'Cuenta eliminada y anonimizada correctamente',
    })
  } catch (error) {
    logger.error('gdpr.delete.failed', { error })
    return NextResponse.json(
      { error: 'Error al eliminar la cuenta' },
      { status: 500 }
    )
  }
}
