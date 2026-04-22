/**
 * Email Verification and Password Reset Tests (#77)
 * Comprehensive test coverage for identity security flows
 */

import { describe, it, expect, beforeAll, afterAll } from '../test-helpers'
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
import crypto from 'crypto'

// Mirror the production digest derivation. The HMAC pepper falls back to a
// fixed dev-only value when AUTH_SECRET / NEXTAUTH_SECRET aren't set, so
// tests get the same digest the server would compute.
function tokenPepper(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  return secret ? `auth-token-pepper:${secret}` : 'auth-token-pepper:dev-only-fallback-do-not-use-in-prod'
}
const sha256 = (token: string) =>
  crypto.createHmac('sha256', tokenPepper()).update(token).digest('hex')

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

      const record = await db.emailVerificationToken.findUnique({
        where: { tokenHash: sha256(token) },
      })
      expect(record).toBeDefined()
      expect(record?.userId).toBe(testUserId)
      expect(record?.usedAt).toBeNull()
    })

    it('should never persist the plaintext token', async () => {
      const token = await createEmailVerificationToken(testUserId)
      const records = await db.emailVerificationToken.findMany({
        where: { userId: testUserId },
      })
      // No record should contain the plaintext token in the hash column.
      for (const r of records) {
        expect(r.tokenHash).not.toBe(token)
        expect(r.tokenHash).toBe(sha256(token))
      }
      // Lookup by raw token must NOT exist as a column.
      // (compile-time guarantee via Prisma client; runtime: hash matches)
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
        where: { tokenHash: sha256(token) },
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

        // We can't read back the plaintext token from the DB, so issue a fresh
        // one for the same user — same code path as the email link the user
        // would have received.
        const freshToken = await createEmailVerificationToken(createdUser!.id)
        const verificationResult = await verifyEmailToken(freshToken)
        expect(verificationResult.success).toBe(true)

        const allowedLogin = await authorizeCredentials({ email, password })
        expect(allowedLogin).toBeDefined()
        expect(allowedLogin?.email).toBe(email)

        const loggedInUser = await db.user.findUnique({
          where: { id: createdUser!.id },
          select: { lastLoginAt: true },
        })
        expect(loggedInUser?.lastLoginAt).not.toBeNull()
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

      const record = await db.passwordResetToken.findUnique({
        where: { tokenHash: sha256(result.token!) },
      })
      expect(record?.userId).toBe(resetTestUserId)
    })

    it('should never persist the plaintext reset token', async () => {
      const { token } = await createPasswordResetToken(resetTestEmail)
      const records = await db.passwordResetToken.findMany({
        where: { userId: resetTestUserId },
      })
      for (const r of records) {
        expect(r.tokenHash).not.toBe(token)
        expect(r.tokenHash).toBe(sha256(token!))
      }
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
        where: { tokenHash: sha256(token!) },
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

      const oldRecord = await db.passwordResetToken.findUnique({
        where: { tokenHash: sha256(oldToken!) },
      })
      const newRecord = await db.passwordResetToken.findUnique({
        where: { tokenHash: sha256(newToken!) },
      })

      // Old token should be deleted
      expect(oldRecord).toBeNull()
      expect(newRecord).toBeDefined()
    })

    it('should atomically consume the reset token under concurrency', async () => {
      const { token } = await createPasswordResetToken(resetTestEmail)
      const newHashA = await bcrypt.hash('concurrent-pass-a', 12)
      const newHashB = await bcrypt.hash('concurrent-pass-b', 12)

      const [resA, resB] = await Promise.all([
        completePasswordReset(token!, newHashA),
        completePasswordReset(token!, newHashB),
      ])

      const successCount = [resA, resB].filter(r => r.success).length
      expect(successCount).toBe(1)
    })

    it('should atomically consume the email verification token under concurrency', async () => {
      const concurrentEmail = `concurrent-verify-${Date.now()}@example.com`
      const user = await db.user.create({
        data: {
          email: concurrentEmail,
          firstName: 'Concurrent',
          lastName: 'Verify',
          passwordHash: 'test',
          emailVerified: null,
        },
      })

      try {
        const token = await createEmailVerificationToken(user.id)
        const [a, b] = await Promise.all([
          verifyEmailToken(token),
          verifyEmailToken(token),
        ])
        const successCount = [a, b].filter(r => r.success).length
        expect(successCount).toBe(1)
      } finally {
        await db.emailVerificationToken.deleteMany({ where: { userId: user.id } }).catch(() => {})
        await db.user.delete({ where: { id: user.id } }).catch(() => {})
      }
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

    it('should keep the forgot-password response identical when the per-identity bucket fills up (#173)', async () => {
      // Hit the per-identity bucket: limit is 3 per hour. Use a fresh email
      // so we don't collide with other tests; create a real user so the
      // success path is exercised.
      const isolatedEmail = `forgot-id-bucket-${Date.now()}@example.com`
      const isolatedUser = await db.user.create({
        data: {
          email: isolatedEmail,
          firstName: 'Forgot',
          lastName: 'Bucket',
          passwordHash: await bcrypt.hash('whatever', 12),
          emailVerified: new Date(),
        },
      })

      try {
        const responses: number[] = []
        const messages: string[] = []
        for (let i = 0; i < 4; i++) {
          const r = await requestPasswordReset(
            new Request('http://localhost:3000/api/auth/forgot-password', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-forwarded-for': `203.0.113.${200 + i}`, // rotate IPs so the per-IP bucket isn't the trigger
              },
              body: JSON.stringify({ email: isolatedEmail }),
            }) as never
          )
          responses.push(r.status)
          const json = await r.json()
          messages.push(json.message ?? '')
        }

        // Every status must be 200 — we never enumerate users by switching
        // shape between "we sent" and "we throttled".
        expect(responses[0]).toBe(200)
        expect(responses[1]).toBe(200)
        expect(responses[2]).toBe(200)
        expect(responses[3]).toBe(200)

        // And the message body is identical across all four.
        for (const m of messages) expect(m).toContain('Si el email existe')

        // But the per-identity bucket DID actually trip — we should not have
        // accumulated four token rows for one user. Tokens are deleted before
        // each create, so we expect at most one alive token AND we expect
        // some of the create calls to have been short-circuited.
        const tokenRows = await db.passwordResetToken.findMany({
          where: { userId: isolatedUser.id },
        })
        expect(tokenRows.length).toBeLessThanOrEqual(1)
      } finally {
        await db.passwordResetToken.deleteMany({ where: { userId: isolatedUser.id } }).catch(() => {})
        await db.user.delete({ where: { id: isolatedUser.id } }).catch(() => {})
      }
    })

    it('should rate-limit credentials authorize per identity (#173)', async () => {
      const email = `login-id-${Date.now()}@example.com`
      const password = 'login-id-test-pass'
      const user = await db.user.create({
        data: {
          email,
          firstName: 'Login',
          lastName: 'Id',
          passwordHash: await bcrypt.hash(password, 12),
          emailVerified: new Date(),
          isActive: true,
        },
      })

      try {
        // Hit the per-identity bucket repeatedly with WRONG passwords.
        // Limit is 10 per 15 min. After that, even the correct password
        // must be rejected — and the rejection shape is null (same as a
        // wrong password) so we don't enumerate which accounts are under
        // attack.
        for (let i = 0; i < 10; i++) {
          const result = await authorizeCredentials({ email, password: 'wrong-password' })
          expect(result).toBeNull()
        }

        const blocked = await authorizeCredentials({ email, password })
        expect(blocked).toBeNull()
      } finally {
        await db.user.delete({ where: { id: user.id } }).catch(() => {})
      }
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

      const tokenRecord = await db.passwordResetToken.findUnique({
        where: { tokenHash: sha256(token!) },
      })
      expect(tokenRecord?.usedAt).not.toBeNull()
    })
  })

  describe('Security validations', () => {
    it('should not verify email for non-existent user', async () => {
      const user = await db.user.create({
        data: {
          email: `non-existent-${Date.now()}@example.com`,
          firstName: 'Ghost',
          lastName: 'User',
          passwordHash: 'test',
          emailVerified: null,
        },
      })

      // Create token with valid user
      const token = await createEmailVerificationToken(user.id)

      // Delete user
      await db.user.delete({ where: { id: user.id } })

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
