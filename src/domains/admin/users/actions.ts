'use server'

import { getServerEnv } from '@/lib/env'
import { db } from '@/lib/db'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'
import { requireAdminUsersResetPassword } from '@/lib/auth-guard'
import { createPasswordResetToken } from '@/domains/auth/email-verification'
import { sendEmail } from '@/lib/email'
import { AdminPasswordResetEmail } from '@/emails/AdminPasswordReset'
import { maskEmailAddress } from './privacy'

export interface AdminUserPasswordResetResult {
  userId: string
  emailMasked: string
}

export async function requestAdminUserPasswordReset(
  userId: string
): Promise<AdminUserPasswordResetResult> {
  const session = await requireAdminUsersResetPassword()
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      deletedAt: true,
      isActive: true,
      emailVerified: true,
    },
  })

  if (!user) {
    throw new Error('Usuario no encontrado')
  }

  if (user.deletedAt) {
    throw new Error('No se puede solicitar un reset para una cuenta eliminada')
  }

  const { token } = await createPasswordResetToken(user.email)
  if (!token) {
    throw new Error('No se pudo crear el token de reset')
  }

  const resetLink = new URL(`/reset-password/${token}`, getServerEnv().appUrl).toString()
  const ip = await getAuditRequestIp()

  await createAuditLog({
    action: 'ADMIN_USER_PASSWORD_RESET_REQUESTED',
    entityType: 'User',
    entityId: user.id,
    before: {
      isActive: user.isActive,
      isDeleted: Boolean(user.deletedAt),
      emailVerified: Boolean(user.emailVerified),
    },
    after: {
      resetRequestedAt: new Date().toISOString(),
      resetChannel: 'email',
    },
    actorId: session.user.id,
    actorRole: session.user.role,
    ip,
  })

  await sendEmail({
    to: user.email,
    subject: 'Restablece tu contraseña de Marketplace',
    react: AdminPasswordResetEmail({
      userName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      resetLink,
    }),
  })

  return {
    userId: user.id,
    emailMasked: maskEmailAddress(user.email),
  }
}
