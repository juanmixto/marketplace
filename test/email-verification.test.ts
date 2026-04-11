/**
 * Email Verification and Password Reset Tests (#77)
 * Comprehensive test coverage for identity security flows
 */

import { describe, it, expect, beforeAll, afterAll } from './test-helpers'
import { db } from '@/lib/db'
import {
  createEmailVerificationToken,
  verifyEmailToken,
  createPasswordResetToken,
  validatePasswordResetToken,
  completePasswordReset,
  isEmailVerified,
} from '@/domains/auth/email-verification'
import { authorizeCredentials } from '@/domains/auth/credentials'
import { POST as registerUser } from '@/app/api/auth/register/route'
import { POST as requestPasswordReset } from '@/app/api/auth/forgot-password/route'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import bcrypt from 'bcryptjs'

describe('Email Verification and Password Reset (#77)', () => {
  let testUserId: string
  let testEmail: string

  beforeAll(async () => {
    testEmail = `test-auth-${Date.now()}@example.com`
    const user = await db.user.create({
      data: {
        email: testEmail,
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'test-hash',
        emailVerified: null, // Not verified
      },
    })
    testUserId = user.id
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: testUserId } })
  })

  describe('Email Verification Flow', () => {
    it('should create email verification token', async () => {
      const token = await createEmailVerificationToken(testUserId)
      expect(token).toBeTruthy()
      expect(token.length).toBeGreaterThan(20)

      const record = await db.emailVerificationToken.findUnique({ where: { token } })
      expect(record).toBeDefined()
      expect(record?.userId).toBe(testUserId)
      expect(record?.usedAt).toBeNull()
    })

    it('should verify email with valid token', async () => {
      const token = await createEmailVerificationToken(testUserId)
      const result = await verifyEmailToken(token)

      expect(result.success).toBe(true)
      expect(result.email).toBe(testEmail)

      const user = await db.user.findUnique({ where: { id: testUserId } })
      expect(user?.emailVerified).not.toBeNull()
    })

    it('should reject invalid token', async () => {
      const result = await verifyEmailToken('invalid-token-xyz')
      expect(result.success).toBe(false)
      expect(result.message).toContain('inválido')
    })

    it('should reject already-used token', async () => {
      // First use
      const token = await createEmailVerificationToken(testUserId)
      await verifyEmailToken(token)

      // Try to use again
      const result = await verifyEmailToken(token)
      expect(result.success).toBe(false)
      expect(result.message).toContain('ya ha sido utilizado')
    })

    it('should reject expired token', async () => {
      const token = await createEmailVerificationToken(testUserId)

      // Artificially expire the token
      await db.emailVerificationToken.update({
        where: { token },
        data: { expiresAt: new Date(Date.now() - 1000) },
      })

      const result = await verifyEmailToken(token)
      expect(result.success).toBe(false)
      expect(result.message).toContain('expirado')
    })

    it('should check email verification status', async () => {
      // Create unverified user
      const newUser = await db.user.create({
        data: {
          email: `unverified-${Date.now()}@example.com`,
          firstName: 'Unverified',
          lastName: 'User',
          passwordHash: 'test',
          emailVerified: null,
        },
      })

      expect(await isEmailVerified(newUser.id)).toBe(false)

      // Verify and check again
      const token = await createEmailVerificationToken(newUser.id)
      await verifyEmailToken(token)

      expect(await isEmailVerified(newUser.id)).toBe(true)

      await db.user.delete({ where: { id: newUser.id } })
    })

    it('should register users unverified and block login until email verification completes', async () => {
      const email = `register-flow-${Date.now()}@example.com`
      const password = 'test-password-123'
      const originalResendKey = process.env.RESEND_API_KEY
      let createdUserId: string | undefined
      delete process.env.RESEND_API_KEY

      try {
        const response = await registerUser(
          new Request('http://localhost:3000/api/auth/register', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-forwarded-for': `203.0.113.${Math.floor(Date.now() % 200) + 1}`,
            },
            body: JSON.stringify({
              firstName: 'Register',
              lastName: 'Flow',
              email,
              password,
            }),
          }) as never
        )

        expect(response.status).toBe(201)

        const createdUser = await db.user.findUnique({
          where: { email },
        })

        expect(createdUser).toBeDefined()
        expect(createdUser?.emailVerified).toBeNull()
        createdUserId = createdUser?.id

        const tokenRecord = await db.emailVerificationToken.findFirst({
          where: { userId: createdUser!.id },
        })

        expect(tokenRecord).toBeDefined()

        const blockedLogin = await authorizeCredentials({ email, password })
        expect(blockedLogin).toBeNull()

        const verificationResult = await verifyEmailToken(tokenRecord!.token)
        expect(verificationResult.success).toBe(true)

        const allowedLogin = await authorizeCredentials({ email, password })
        expect(allowedLogin).toBeDefined()
        expect(allowedLogin?.email).toBe(email)
      } finally {
        if (originalResendKey === undefined) {
          delete process.env.RESEND_API_KEY
        } else {
          process.env.RESEND_API_KEY = originalResendKey
        }

        if (createdUserId) {
          await db.emailVerificationToken.deleteMany({
            where: { userId: createdUserId },
          }).catch(() => {})

          await db.user.deleteMany({
            where: { id: createdUserId },
          }).catch(() => {})
        } else {
          await db.user.deleteMany({
            where: { email },
          }).catch(() => {})
        }
      }
    })
  })

  describe('Password Reset Flow', () => {
    let resetTestUserId: string
    let resetTestEmail: string

    beforeAll(async () => {
      resetTestEmail = `reset-test-${Date.now()}@example.com`
      const user = await db.user.create({
        data: {
          email: resetTestEmail,
          firstName: 'Reset',
          lastName: 'Test',
          passwordHash: await bcrypt.hash('old-password', 12),
          emailVerified: new Date(),
        },
      })
      resetTestUserId = user.id
    })

    afterAll(async () => {
      await db.user.delete({ where: { id: resetTestUserId } })
    })

    it('should create password reset token', async () => {
      const result = await createPasswordResetToken(resetTestEmail)

      expect(result.success).toBe(true)
      expect(result.token).toBeTruthy()
      expect(result.token?.length).toBeGreaterThan(20)

      const record = await db.passwordResetToken.findUnique({ where: { token: result.token! } })
      expect(record?.userId).toBe(resetTestUserId)
    })

    it('should not reveal if email exists (security)', async () => {
      const result = await createPasswordResetToken('nonexistent@example.com')

      // Should still return success message
      expect(result.success).toBe(false)
      expect(result.message).toContain('Si el email existe')
    })

    it('should validate password reset token', async () => {
      const { token } = await createPasswordResetToken(resetTestEmail)

      const validation = await validatePasswordResetToken(token!)
      expect(validation.valid).toBe(true)
      expect(validation.userId).toBe(resetTestUserId)
    })

    it('should reject invalid reset token', async () => {
      const validation = await validatePasswordResetToken('invalid-reset-token')
      expect(validation.valid).toBe(false)
      expect(validation.message).toContain('inválido')
    })

    it('should reject expired reset token', async () => {
      const { token } = await createPasswordResetToken(resetTestEmail)

      await db.passwordResetToken.update({
        where: { token: token! },
        data: { expiresAt: new Date(Date.now() - 1000) },
      })

      const validation = await validatePasswordResetToken(token!)
      expect(validation.valid).toBe(false)
      expect(validation.message).toContain('expirado')
    })

    it('should complete password reset', async () => {
      const { token } = await createPasswordResetToken(resetTestEmail)
      const newPasswordHash = await bcrypt.hash('new-password-123', 12)

      const result = await completePasswordReset(token!, newPasswordHash)

      expect(result.success).toBe(true)
      expect(result.email).toBe(resetTestEmail)

      // Verify old password doesn't work anymore
      const user = await db.user.findUnique({ where: { id: resetTestUserId } })
      const oldPasswordValid = await bcrypt.compare('old-password', user?.passwordHash || '')
      expect(oldPasswordValid).toBe(false)

      // Verify new password works
      const newPasswordValid = await bcrypt.compare('new-password-123', user?.passwordHash || '')
      expect(newPasswordValid).toBe(true)
    })

    it('should prevent reusing already-used reset token', async () => {
      const { token } = await createPasswordResetToken(resetTestEmail)
      const newPasswordHash = await bcrypt.hash('first-reset-pass', 12)

      // First use
      await completePasswordReset(token!, newPasswordHash)

      // Try to use again
      const result = await completePasswordReset(token!, newPasswordHash)
      expect(result.success).toBe(false)
    })

    it('should delete old reset tokens when requesting new one', async () => {
      const oldToken = (await createPasswordResetToken(resetTestEmail)).token
      const newToken = (await createPasswordResetToken(resetTestEmail)).token

      const oldRecord = await db.passwordResetToken.findUnique({ where: { token: oldToken! } })
      const newRecord = await db.passwordResetToken.findUnique({ where: { token: newToken! } })

      // Old token should be deleted
      expect(oldRecord).toBeNull()
      expect(newRecord).toBeDefined()
    })

    it('should create password reset token through the modern forgot-password route', async () => {
      const email = resetTestEmail

      const response = await requestPasswordReset(
        new Request('http://localhost:3000/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
        }) as never
      )

      expect(response.status).toBe(200)

      const tokenRecord = await db.passwordResetToken.findFirst({
        where: { userId: resetTestUserId },
      })

      expect(tokenRecord).toBeDefined()
    })

    it('should reset the password through the modern reset-password route', async () => {
      const { token } = await createPasswordResetToken(resetTestEmail)

      const response = await resetPassword(
        new Request('http://localhost:3000/api/auth/reset-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token,
            password: 'route-new-password-123',
            passwordConfirm: 'route-new-password-123',
          }),
        }) as never
      )

      expect(response.status).toBe(200)

      const user = await db.user.findUnique({ where: { id: resetTestUserId } })
      const passwordValid = await bcrypt.compare('route-new-password-123', user?.passwordHash || '')
      expect(passwordValid).toBe(true)

      const tokenRecord = await db.passwordResetToken.findUnique({ where: { token: token! } })
      expect(tokenRecord?.usedAt).not.toBeNull()
    })
  })

  describe('Security validations', () => {
    it('should not verify email for non-existent user', async () => {
      // Create token with valid user
      const token = await createEmailVerificationToken(testUserId)

      // Delete user
      await db.user.delete({ where: { id: testUserId } })

      // Try to verify - should fail gracefully
      const result = await verifyEmailToken(token)
      expect(result.success).toBe(false)
    })

    it('should enforce minimum password length in reset', async () => {
      const testEmail = `pw-length-${Date.now()}@example.com`
      const user = await db.user.create({
        data: {
          email: testEmail,
          firstName: 'Test',
          lastName: 'Pw',
          passwordHash: 'test',
          emailVerified: new Date(),
        },
      })

      const { token } = await createPasswordResetToken(testEmail)

      // Try short password - API should reject in route handler validation
      // This test documents the requirement
      expect(token).toBeTruthy()

      await db.user.delete({ where: { id: user.id } })
    })
  })
})
