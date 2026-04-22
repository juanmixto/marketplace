'use server'

import { getServerEnv } from '@/lib/env'
import { db } from '@/lib/db'
import { createAuditLog, getAuditRequestIp, mutateWithAudit } from '@/lib/audit'
import { requireAdminUsersResetPassword, requireAdminUsersStateChange } from '@/lib/auth-guard'
import { createPasswordResetToken } from '@/domains/auth'
import { sendEmail } from '@/lib/email'
import { AdminPasswordResetEmail } from '@/emails/AdminPasswordReset'
import { maskEmailAddress } from './privacy'

export interface AdminUserPasswordResetResult {
  userId: string
  emailMasked: string
}

export interface AdminUserStateChangeResult {
  userId: string
  isActive: boolean
  vendorStatus: string | null
  authVersion: number
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
    throw new Error('User not found')
  }

  if (user.deletedAt) {
    throw new Error('Cannot request a reset for a deleted account')
  }

  const { token } = await createPasswordResetToken(user.email)
  if (!token) {
    throw new Error('Could not create the reset token')
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
    subject: 'Reset your Marketplace password',
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

export async function setAdminUserActiveState(
  userId: string,
  isActive: boolean
): Promise<AdminUserStateChangeResult> {
  const session = await requireAdminUsersStateChange()
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      deletedAt: true,
      authVersion: true,
      vendor: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  })

  if (!user) {
    throw new Error('User not found')
  }

  if (user.deletedAt) {
    throw new Error('Cannot change the state of a deleted account')
  }

  if (session.user.id === user.id && !isActive) {
    throw new Error('You cannot deactivate your own account')
  }

  if (user.isActive === isActive) {
    return {
      userId: user.id,
      isActive: user.isActive,
      vendorStatus: user.vendor?.status ?? null,
      authVersion: user.authVersion,
    }
  }

  const ip = await getAuditRequestIp()
  const before = {
    isActive: user.isActive,
    role: user.role,
    vendorStatus: user.vendor?.status ?? null,
  }

  const result = await mutateWithAudit(async tx => {
    const updatedUser = await tx.user.update({
      where: { id: user.id },
      data: {
        isActive,
        authVersion: { increment: 1 },
      },
      select: {
        id: true,
        isActive: true,
        authVersion: true,
        vendor: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    })

    let vendorStatus = updatedUser.vendor?.status ?? null
    if (updatedUser.vendor && updatedUser.vendor.status === 'ACTIVE' && !isActive) {
      const updatedVendor = await tx.vendor.update({
        where: { id: updatedUser.vendor.id },
        data: { status: 'SUSPENDED_TEMP' },
        select: { status: true },
      })
      vendorStatus = updatedVendor.status
    } else if (updatedUser.vendor && updatedUser.vendor.status === 'SUSPENDED_TEMP' && isActive) {
      const updatedVendor = await tx.vendor.update({
        where: { id: updatedUser.vendor.id },
        data: { status: 'ACTIVE' },
        select: { status: true },
      })
      vendorStatus = updatedVendor.status
    }

    return {
      result: {
        userId: updatedUser.id,
        isActive: updatedUser.isActive,
        vendorStatus,
        authVersion: updatedUser.authVersion,
      },
      audit: {
        action: isActive ? 'ADMIN_USER_UNBLOCKED' : 'ADMIN_USER_BLOCKED',
        entityType: 'User',
        entityId: user.id,
        before,
        after: {
          isActive,
          role: user.role,
          vendorStatus,
          authVersion: updatedUser.authVersion,
        },
        actorId: session.user.id,
        actorRole: session.user.role,
        ip,
      },
    }
  })

  return result
}
