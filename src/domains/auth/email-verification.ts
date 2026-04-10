/**
 * Authentication services for email verification and password reset
 * Handles token generation, validation, and expiration
 */

import { db } from '@/lib/db'
import crypto from 'crypto'

const TOKEN_EXPIRY_EMAIL_VERIFICATION = 24 * 60 * 60 * 1000 // 24 hours
const TOKEN_EXPIRY_PASSWORD_RESET = 60 * 60 * 1000 // 1 hour

/**
 * Generate a cryptographically secure token for email verification
 */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  // Delete existing tokens for this user
  await db.emailVerificationToken.deleteMany({ where: { userId } })

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_EMAIL_VERIFICATION)

  await db.emailVerificationToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  })

  return token
}

/**
 * Verify an email verification token and mark user as verified
 */
export async function verifyEmailToken(token: string): Promise<{ success: boolean; message: string; email?: string }> {
  const verificationToken = await db.emailVerificationToken.findUnique({ where: { token } })

  if (!verificationToken) {
    return { success: false, message: 'Token inválido' }
  }

  if (verificationToken.usedAt) {
    return { success: false, message: 'Este token ya ha sido utilizado' }
  }

  if (new Date() > verificationToken.expiresAt) {
    return { success: false, message: 'Este token ha expirado' }
  }

  const user = await db.user.findUnique({ where: { id: verificationToken.userId } })
  if (!user) {
    return { success: false, message: 'Usuario no encontrado' }
  }

  // Mark token as used and verify user email
  await Promise.all([
    db.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    }),
    db.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: new Date() },
    }),
  ])

  return { success: true, message: 'Email verificado correctamente', email: user.email }
}

/**
 * Generate a password reset token
 */
export async function createPasswordResetToken(email: string): Promise<{ success: boolean; token?: string; message: string }> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  })

  if (!user) {
    // Don't reveal if email exists (security)
    return { success: false, message: 'Si el email existe, recibirás instrucciones' }
  }

  // Delete existing reset tokens for this user
  await db.passwordResetToken.deleteMany({ where: { userId: user.id } })

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_PASSWORD_RESET)

  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  })

  return { success: true, token, message: 'Token de reset creado' }
}

/**
 * Verify and validate a password reset token
 */
export async function validatePasswordResetToken(token: string): Promise<{ valid: boolean; userId?: string; message: string }> {
  const resetToken = await db.passwordResetToken.findUnique({ where: { token } })

  if (!resetToken) {
    return { valid: false, message: 'Token inválido o expirado' }
  }

  if (resetToken.usedAt) {
    return { valid: false, message: 'Este token ya ha sido utilizado' }
  }

  if (new Date() > resetToken.expiresAt) {
    return { valid: false, message: 'Este token ha expirado' }
  }

  return { valid: true, userId: resetToken.userId, message: 'Token válido' }
}

/**
 * Complete a password reset (after validation)
 */
export async function completePasswordReset(
  token: string,
  newPasswordHash: string
): Promise<{ success: boolean; message: string; email?: string }> {
  const tokenData = await validatePasswordResetToken(token)

  if (!tokenData.valid || !tokenData.userId) {
    return { success: false, message: tokenData.message }
  }

  const user = await db.user.findUnique({
    where: { id: tokenData.userId },
    select: { email: true },
  })

  if (!user) {
    return { success: false, message: 'Usuario no encontrado' }
  }

  // Mark token as used and update password
  await Promise.all([
    db.passwordResetToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
    db.user.update({
      where: { id: tokenData.userId },
      data: {
        passwordHash: newPasswordHash,
        // Clear old reset fields if they exist
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    }),
  ])

  return { success: true, message: 'Contraseña actualizada correctamente', email: user.email }
}

/**
 * Check if a user's email is verified
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  })

  return user?.emailVerified !== null
}
