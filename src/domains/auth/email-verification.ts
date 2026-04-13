/**
 * Authentication services for email verification and password reset
 * Handles token generation, validation, and expiration.
 *
 * Tokens are returned to the user in plain form but only their SHA-256
 * digest is persisted, so a database/backup leak does not yield usable
 * recovery credentials. Consumption is atomic via conditional updateMany.
 */

import { db } from '@/lib/db'
import crypto from 'crypto'

const TOKEN_EXPIRY_EMAIL_VERIFICATION = 24 * 60 * 60 * 1000 // 24 hours
const TOKEN_EXPIRY_PASSWORD_RESET = 60 * 60 * 1000 // 1 hour

/**
 * Derive the at-rest digest for a token.
 *
 * We HMAC-sign with a server-side secret instead of plain SHA-256 so that
 * a database/backup leak alone is not enough to recover any token: an
 * attacker would also need the server pepper. The token itself is full
 * 256-bit entropy from `crypto.randomBytes`, so a fast keyed hash is the
 * right primitive — slow KDFs (bcrypt/argon) are designed for low-entropy
 * passwords, not high-entropy secrets, and would only add latency here.
 */
function hashToken(token: string): string {
  return crypto.createHmac('sha256', getTokenPepper()).update(token).digest('hex')
}

let cachedPepper: string | null = null
function getTokenPepper(): string {
  if (cachedPepper !== null) return cachedPepper
  // AUTH_SECRET is required in production by getServerEnv(); fall back to a
  // dev-only constant in test/CI so unit tests don't need to wire it up.
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (secret && secret.length > 0) {
    cachedPepper = `auth-token-pepper:${secret}`
  } else {
    cachedPepper = 'auth-token-pepper:dev-only-fallback-do-not-use-in-prod'
  }
  return cachedPepper
}

/**
 * Generate a cryptographically secure email verification token.
 * Returns the plaintext token to be sent to the user; only the hash is stored.
 */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  await db.emailVerificationToken.deleteMany({ where: { userId } })

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_EMAIL_VERIFICATION)

  await db.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt },
  })

  return token
}

/**
 * Atomically consume an email verification token and verify the user.
 */
export async function verifyEmailToken(token: string): Promise<{ success: boolean; message: string; email?: string }> {
  if (!token) {
    return { success: false, message: 'Token inválido' }
  }

  const tokenHash = hashToken(token)
  const record = await db.emailVerificationToken.findUnique({ where: { tokenHash } })

  if (!record) {
    return { success: false, message: 'Token inválido' }
  }

  if (new Date() > record.expiresAt) {
    return { success: false, message: 'Este token ha expirado' }
  }

  if (record.usedAt) {
    return { success: false, message: 'Este token ya ha sido utilizado' }
  }

  // Atomic single-use: only one concurrent caller wins.
  const consumed = await db.emailVerificationToken.updateMany({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  })

  if (consumed.count !== 1) {
    return { success: false, message: 'Este token ya ha sido utilizado' }
  }

  const user = await db.user.findUnique({ where: { id: record.userId } })
  if (!user) {
    return { success: false, message: 'Usuario no encontrado' }
  }

  await db.user.update({
    where: { id: record.userId },
    data: { emailVerified: new Date() },
  })

  return { success: true, message: 'Email verificado correctamente', email: user.email }
}

/**
 * Generate a password reset token. Returns the plaintext token.
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

  await db.passwordResetToken.deleteMany({ where: { userId: user.id } })

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_PASSWORD_RESET)

  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  })

  return { success: true, token, message: 'Token de reset creado' }
}

/**
 * Validate (without consuming) a password reset token.
 */
export async function validatePasswordResetToken(token: string): Promise<{ valid: boolean; userId?: string; message: string }> {
  if (!token) {
    return { valid: false, message: 'Token inválido o expirado' }
  }

  const tokenHash = hashToken(token)
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } })

  if (!record) {
    return { valid: false, message: 'Token inválido o expirado' }
  }

  if (record.usedAt) {
    return { valid: false, message: 'Este token ya ha sido utilizado' }
  }

  if (new Date() > record.expiresAt) {
    return { valid: false, message: 'Este token ha expirado' }
  }

  return { valid: true, userId: record.userId, message: 'Token válido' }
}

/**
 * Atomically consume a password reset token and update the user's password.
 */
export async function completePasswordReset(
  token: string,
  newPasswordHash: string
): Promise<{ success: boolean; message: string; email?: string }> {
  if (!token) {
    return { success: false, message: 'Token inválido o expirado' }
  }

  const tokenHash = hashToken(token)

  // Atomic single-use: refuse to update password unless we owned the consume.
  const consumed = await db.passwordResetToken.updateMany({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  })

  if (consumed.count !== 1) {
    return { success: false, message: 'Token inválido o expirado' }
  }

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } })
  if (!record) {
    return { success: false, message: 'Token inválido o expirado' }
  }

  const user = await db.user.findUnique({
    where: { id: record.userId },
    select: { email: true },
  })

  if (!user) {
    return { success: false, message: 'Usuario no encontrado' }
  }

  await db.user.update({
    where: { id: record.userId },
    data: {
      passwordHash: newPasswordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  })

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
